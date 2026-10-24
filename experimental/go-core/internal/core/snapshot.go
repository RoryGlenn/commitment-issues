// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package core

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	indexLimit     = 32 << 20
	fileLimit      = 512
	blobLimit      = 2 << 20
	totalBlobLimit = 16 << 20
)

// File owns captured staged blob bytes. Unavailable marks an unsupported file
// kind, which must be reported rather than treated as successfully scanned.
type File struct {
	Path        string
	Mode        string
	ObjectID    string
	Data        []byte
	Unavailable string
}

// Snapshot is detached from subsequent changes to the worktree and index.
// Head is empty for an unborn branch; Branch is empty for a detached HEAD.
type Snapshot struct {
	ID          string
	Head        string
	Branch      string
	IndexSHA256 string
	Files       []File
	Deleted     []string
}

type indexSnapshot struct {
	path string
	info os.FileInfo
	data []byte
}

type treeEntry struct {
	mode string
	oid  string
}

// Capture reads a coherent staged snapshot without writing the repository or
// reading source/configuration files from the worktree. A private index copy is
// the only index ever given to an index-reading Git command.
func Capture(ctx context.Context, directory string) (*Snapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	g, err := newGitRunner(directory)
	if err != nil {
		return nil, err
	}
	// This probe does not read the index. Preserve the explicit active index
	// until Git resolves it; every later probe uses only the private copy.
	g.index = os.Getenv("GIT_INDEX_FILE")
	indexPath, _, err := g.run(ctx, metadataLimit, "rev-parse", "--path-format=absolute", "--git-path", "index")
	if err != nil {
		return nil, err
	}
	activePath, err := singleLine(indexPath)
	if err != nil || !filepath.IsAbs(activePath) {
		return nil, errors.New("active index path is unavailable")
	}
	index, err := readIndexSnapshot(activePath)
	if err != nil {
		return nil, err
	}
	privateDir, err := os.MkdirTemp("", "commitment-issues-snapshot-")
	if err != nil {
		return nil, errors.New("private snapshot storage is unavailable")
	}
	defer os.RemoveAll(privateDir)
	g.index = filepath.Join(privateDir, "index")
	if index.info != nil {
		if err := os.WriteFile(g.index, index.data, 0600); err != nil {
			return nil, errors.New("private index copy could not be created")
		}
	}
	inside, _, err := g.run(ctx, metadataLimit, "rev-parse", "--is-inside-work-tree")
	if err != nil || string(inside) != "true\n" {
		return nil, errors.New("capture requires a Git working repository")
	}
	rootOutput, _, err := g.run(ctx, metadataLimit, "rev-parse", "--show-toplevel")
	if err != nil {
		return nil, err
	}
	root, err := singleLine(rootOutput)
	if err != nil || !filepath.IsAbs(root) {
		return nil, errors.New("repository root is unavailable")
	}
	g.directory = root
	format, _, err := g.run(ctx, metadataLimit, "rev-parse", "--show-object-format")
	if err != nil {
		return nil, err
	}
	hashSize := 20
	switch string(format) {
	case "sha1\n":
	case "sha256\n":
		hashSize = 32
	default:
		return nil, errors.New("repository object format is unsupported")
	}
	if index.info != nil {
		if err := inspectIndex(index.data, hashSize); err != nil {
			return nil, err
		}
	}
	head, branch, err := captureHead(ctx, g, hashSize)
	if err != nil {
		return nil, err
	}
	// --full-tree ensures invoking from a subdirectory does not change paths.
	base := map[string]treeEntry{}
	if head != "" {
		out, _, err := g.run(ctx, metadataLimit, "ls-tree", "-r", "-z", "--full-tree", head)
		if err != nil {
			return nil, err
		}
		base, err = parseEntries(out, hashSize, false)
		if err != nil {
			return nil, err
		}
	}
	out, _, err := g.run(ctx, metadataLimit, "ls-files", "--stage", "--full-name", "-z", "--")
	if err != nil {
		return nil, err
	}
	staged, err := parseEntries(out, hashSize, true)
	if err != nil {
		return nil, err
	}
	indexHash := sha256.Sum256(index.data)
	snapshot := &Snapshot{Head: head, Branch: branch, IndexSHA256: hex.EncodeToString(indexHash[:]), Files: []File{}, Deleted: []string{}}
	paths := make([]string, 0)
	for path, entry := range staged {
		if old, ok := base[path]; !ok || old != entry {
			paths = append(paths, path)
		}
	}
	for path := range base {
		if _, ok := staged[path]; !ok {
			snapshot.Deleted = append(snapshot.Deleted, path)
		}
	}
	if len(paths)+len(snapshot.Deleted) > fileLimit {
		return nil, errors.New("staged changes exceed the 512-file capture limit")
	}
	sort.Strings(paths)
	sort.Strings(snapshot.Deleted)
	total := 0
	for _, path := range paths {
		entry := staged[path]
		file := File{Path: path, Mode: entry.mode, ObjectID: entry.oid}
		switch entry.mode {
		case "100644", "100755":
			data, err := readBlob(ctx, g, entry.oid)
			if err != nil {
				return nil, err
			}
			if len(data) > totalBlobLimit-total {
				return nil, errors.New("staged blobs exceed the 16 MiB capture limit")
			}
			total += len(data)
			file.Data = data
		case "120000":
			file.Unavailable = "symbolic links are not scanned"
		case "160000":
			file.Unavailable = "submodules are not scanned"
		default:
			return nil, errors.New("staged file mode is unsupported")
		}
		snapshot.Files = append(snapshot.Files, file)
	}
	if err := validateIndexSnapshot(index); err != nil {
		return nil, err
	}
	currentHead, currentBranch, err := captureHead(ctx, g, hashSize)
	if err != nil || currentHead != head || currentBranch != branch {
		return nil, errors.New("HEAD changed during snapshot capture")
	}
	// Recheck after the last Git read as well, closing the validation probe gap.
	if err := validateIndexSnapshot(index); err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return nil, errors.New("snapshot capture was interrupted")
	}
	id := sha256.Sum256([]byte(head + "\x00" + branch + "\x00" + snapshot.IndexSHA256))
	snapshot.ID = hex.EncodeToString(id[:])
	return snapshot, nil
}

func singleLine(data []byte) (string, error) {
	if len(data) == 0 || data[len(data)-1] != '\n' {
		return "", errors.New("Git returned malformed metadata")
	}
	line := string(data[:len(data)-1])
	if line == "" || strings.ContainsAny(line, "\x00\r\n") || !utf8.ValidString(line) {
		return "", errors.New("Git returned unsupported metadata")
	}
	return line, nil
}

func captureHead(ctx context.Context, g *gitRunner, hashSize int) (string, string, error) {
	branch := ""
	ref, code, err := g.run(ctx, metadataLimit, "symbolic-ref", "--quiet", "HEAD")
	if err == nil {
		branch, err = singleLine(ref)
		if err != nil || len(branch) > 4096 || !strings.HasPrefix(branch, "refs/heads/") {
			return "", "", errors.New("HEAD has an unsupported symbolic reference")
		}
		branch = strings.TrimPrefix(branch, "refs/heads/")
	} else if code != 1 {
		return "", "", err
	}
	out, code, err := g.run(ctx, metadataLimit, "rev-parse", "--verify", "--quiet", "HEAD^{commit}")
	if err != nil {
		if code == 1 && branch != "" {
			_, refCode, refErr := g.run(ctx, metadataLimit, "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
			if refErr != nil && refCode == 1 {
				return "", branch, nil
			}
		}
		return "", "", errors.New("HEAD could not be captured")
	}
	head, err := singleLine(out)
	if err != nil || !validOID(head, hashSize) {
		return "", "", errors.New("HEAD has an invalid object identity")
	}
	return head, branch, nil
}

func readIndexSnapshot(path string) (*indexSnapshot, error) {
	before, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return &indexSnapshot{path: path}, nil
	}
	if err != nil || !before.Mode().IsRegular() {
		return nil, errors.New("active index is not a readable regular file")
	}
	if before.Size() > indexLimit {
		return nil, errors.New("index exceeds the 32 MiB capture limit")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, errors.New("active index could not be read")
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(before, opened) {
		return nil, errors.New("index changed during snapshot capture")
	}
	data, err := io.ReadAll(io.LimitReader(f, indexLimit+1))
	if err != nil || len(data) > indexLimit {
		return nil, errors.New("index exceeds the capture boundary")
	}
	after, err := os.Lstat(path)
	if err != nil || !sameIndexIdentity(before, after) || int64(len(data)) != before.Size() {
		return nil, errors.New("index changed during snapshot capture")
	}
	return &indexSnapshot{path: path, info: before, data: data}, nil
}

func sameIndexIdentity(a, b os.FileInfo) bool {
	return a.Mode().IsRegular() && b.Mode().IsRegular() && os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime()) && a.Mode() == b.Mode()
}

func validateIndexSnapshot(captured *indexSnapshot) error {
	current, err := readIndexSnapshot(captured.path)
	if err != nil {
		return err
	}
	if (captured.info == nil) != (current.info == nil) || !bytes.Equal(captured.data, current.data) {
		return errors.New("index changed during snapshot capture")
	}
	if captured.info != nil && !sameIndexIdentity(captured.info, current.info) {
		return errors.New("index changed during snapshot capture")
	}
	return nil
}

// inspectIndex refuses special index states before Git can resolve their
// external storage. Index v4 prefix compression only affects path encoding;
// exact path validation is performed on the subsequent NUL-delimited output.
func inspectIndex(data []byte, hashSize int) error {
	malformed := errors.New("index format is malformed or unsupported")
	if len(data) < 12+hashSize || string(data[:4]) != "DIRC" {
		return malformed
	}
	version := binary.BigEndian.Uint32(data[4:8])
	if version < 2 || version > 4 {
		return malformed
	}
	end := len(data) - hashSize
	if hashSize == sha1.Size {
		sum := sha1.Sum(data[:end])
		if !bytes.Equal(sum[:], data[end:]) {
			return malformed
		}
	} else {
		sum := sha256.Sum256(data[:end])
		if !bytes.Equal(sum[:], data[end:]) {
			return malformed
		}
	}
	count := binary.BigEndian.Uint32(data[8:12])
	offset := 12
	for i := uint32(0); i < count; i++ {
		start := offset
		if offset+40+hashSize+2 > end {
			return malformed
		}
		mode := binary.BigEndian.Uint32(data[offset+24 : offset+28])
		if mode == 040000 {
			return errors.New("sparse indexes are unsupported")
		}
		offset += 40 + hashSize
		flags := binary.BigEndian.Uint16(data[offset : offset+2])
		offset += 2
		if flags&0x3000 != 0 {
			return errors.New("unmerged index entries are unsupported")
		}
		if flags&0x8000 != 0 {
			return errors.New("assume-unchanged index entries are unsupported")
		}
		if flags&0x4000 != 0 {
			if version == 2 || offset+2 > end {
				return malformed
			}
			extended := binary.BigEndian.Uint16(data[offset : offset+2])
			offset += 2
			if extended&0x2000 != 0 {
				return errors.New("intent-to-add index entries are unsupported")
			}
			if extended&0x4000 != 0 {
				return errors.New("sparse or skip-worktree index entries are unsupported")
			}
			if extended != 0 {
				return malformed
			}
		}
		if version == 4 {
			// Consume the bounded variable-width prefix-removal count.
			for n := 0; ; n++ {
				if offset >= end || n > 9 {
					return malformed
				}
				value := data[offset]
				offset++
				if value&0x80 == 0 {
					break
				}
			}
		}
		if offset >= end {
			return malformed
		}
		nul := bytes.IndexByte(data[offset:end], 0)
		if nul < 0 {
			return malformed
		}
		offset += nul + 1
		if version != 4 {
			offset = start + ((offset-start+7)/8)*8
		}
		if offset > end {
			return malformed
		}
	}
	for offset < end {
		if offset+8 > end {
			return malformed
		}
		signature := string(data[offset : offset+4])
		size := uint64(binary.BigEndian.Uint32(data[offset+4 : offset+8]))
		offset += 8
		if size > uint64(end-offset) {
			return malformed
		}
		if signature == "link" {
			return errors.New("split indexes are unsupported")
		}
		if signature == "sdir" {
			return errors.New("sparse indexes are unsupported")
		}
		if signature[0] < 'A' || signature[0] > 'Z' {
			return malformed
		}
		offset += int(size)
	}
	return nil
}

func validOID(oid string, hashSize int) bool {
	if len(oid) != hashSize*2 {
		return false
	}
	for _, c := range oid {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return strings.Trim(oid, "0") != ""
}

func validPath(path string) bool {
	if !utf8.ValidString(path) || path == "" || len(path) > 4096 || strings.ContainsAny(path, "\x00\\") || strings.HasPrefix(path, "/") {
		return false
	}
	for _, part := range strings.Split(path, "/") {
		if part == "" || part == "." || part == ".." || strings.EqualFold(part, ".git") || strings.Contains(part, ":") {
			return false
		}
	}
	return true
}

func parseEntries(data []byte, hashSize int, index bool) (map[string]treeEntry, error) {
	result := map[string]treeEntry{}
	if len(data) == 0 {
		return result, nil
	}
	if data[len(data)-1] != 0 {
		return nil, errors.New("Git returned unterminated path metadata")
	}
	for _, record := range bytes.Split(data[:len(data)-1], []byte{0}) {
		fields, path, ok := bytes.Cut(record, []byte{'\t'})
		if !ok || !validPath(string(path)) {
			return nil, errors.New("Git returned an unsupported path")
		}
		parts := strings.Split(string(fields), " ")
		if len(parts) != 3 {
			return nil, errors.New("Git returned malformed entry metadata")
		}
		entry := treeEntry{mode: parts[0]}
		if index {
			entry.oid = parts[1]
			if parts[2] != "0" {
				return nil, errors.New("unmerged index entries are unsupported")
			}
		} else {
			entry.oid = parts[2]
			if parts[1] != "blob" && parts[1] != "commit" {
				return nil, errors.New("HEAD contains unsupported entry types")
			}
		}
		if !validOID(entry.oid, hashSize) {
			return nil, errors.New("Git returned an invalid object identity")
		}
		switch entry.mode {
		case "100644", "100755", "120000", "160000":
		default:
			return nil, errors.New("Git returned an unsupported file mode")
		}
		if _, duplicate := result[string(path)]; duplicate {
			return nil, errors.New("Git returned duplicate path entries")
		}
		result[string(path)] = entry
	}
	return result, nil
}

func readBlob(ctx context.Context, g *gitRunner, oid string) ([]byte, error) {
	sizeOutput, _, err := g.run(ctx, 128, "cat-file", "-s", oid)
	if err != nil {
		return nil, err
	}
	sizeLine, err := singleLine(sizeOutput)
	if err != nil {
		return nil, err
	}
	size, err := strconv.ParseInt(sizeLine, 10, 64)
	if err != nil || size < 0 {
		return nil, errors.New("Git returned an invalid blob size")
	}
	if size > blobLimit {
		return nil, errors.New("staged blob exceeds the 2 MiB capture limit")
	}
	// Object IDs cannot become pathspecs or options; cat-file does not apply
	// worktree attributes, textconv, smudge filters, or source-file reads.
	data, _, err := g.run(ctx, blobLimit, "cat-file", "blob", oid)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != size {
		return nil, errors.New("captured blob has an inconsistent size")
	}
	// Bind bytes to the staged object identity even if the object store changes
	// concurrently or contains an object whose filename does not match its hash.
	header := []byte("blob " + strconv.Itoa(len(data)) + "\x00")
	var actual string
	if len(oid) == sha1.Size*2 {
		hash := sha1.New()
		hash.Write(header)
		hash.Write(data)
		actual = hex.EncodeToString(hash.Sum(nil))
	} else {
		hash := sha256.New()
		hash.Write(header)
		hash.Write(data)
		actual = hex.EncodeToString(hash.Sum(nil))
	}
	if actual != oid {
		return nil, errors.New("captured blob does not match its staged identity")
	}
	return data, nil
}
