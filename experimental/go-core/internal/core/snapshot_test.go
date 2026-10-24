// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package core

import (
	"bytes"
	"compress/zlib"
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

type snapshotTestRepo struct {
	t   *testing.T
	dir string
	git string
}

func newSnapshotTestRepo(t *testing.T) snapshotTestRepo {
	t.Helper()
	git, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	r := snapshotTestRepo{t: t, dir: t.TempDir(), git: git}
	r.command(nil, nil, "init", "--initial-branch=main")
	return r
}

func (r snapshotTestRepo) command(input []byte, extraEnv []string, args ...string) string {
	r.t.Helper()
	out, err := r.tryCommand(input, extraEnv, args...)
	if err != nil {
		r.t.Fatalf("fixture git %q: %v: %s", args, err, out)
	}
	return out
}

func (r snapshotTestRepo) tryCommand(input []byte, extraEnv []string, args ...string) (string, error) {
	r.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	base := []string{"-c", "user.name=Snapshot Test", "-c", "user.email=snapshot@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + filepath.Join(r.dir, "no-hooks")}
	cmd := exec.CommandContext(ctx, r.git, append(base, args...)...)
	cmd.Dir = r.dir
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		if !strings.HasPrefix(strings.ToUpper(key), "GIT_") {
			cmd.Env = append(cmd.Env, value)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_TERMINAL_PROMPT=0")
	cmd.Env = append(cmd.Env, extraEnv...)
	cmd.Stdin = bytes.NewReader(input)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (r snapshotTestRepo) write(name string, data []byte) {
	r.t.Helper()
	file := filepath.Join(r.dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(file, data, 0600); err != nil {
		r.t.Fatal(err)
	}
}

func (r snapshotTestRepo) commit() string {
	r.t.Helper()
	r.command(nil, nil, "add", "--all")
	r.command(nil, nil, "commit", "--allow-empty", "-m", "fixture")
	return r.command(nil, nil, "rev-parse", "HEAD")
}

func (r snapshotTestRepo) capture() *Snapshot {
	r.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	snapshot, err := Capture(ctx, r.dir)
	if err != nil {
		r.t.Fatalf("Capture: %v", err)
	}
	if snapshot == nil {
		r.t.Fatal("Capture returned a nil snapshot")
	}
	return snapshot
}

func (r snapshotTestRepo) refuses() {
	r.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	snapshot, err := Capture(ctx, r.dir)
	if err == nil || snapshot != nil {
		r.t.Fatalf("unsupported snapshot accepted: snapshot=%v err=%v", snapshot != nil, err)
	}
}

func snapshotTestRead(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func snapshotTestFile(t *testing.T, snapshot *Snapshot, name string) File {
	t.Helper()
	for _, file := range snapshot.Files {
		if file.Path == name {
			return file
		}
	}
	t.Fatalf("snapshot does not contain %q", name)
	return File{}
}

func TestSnapshotCapturesStagedBytesWithoutReadingWorktree(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("partial.go", []byte("committed\n"))
	r.write("unchanged.txt", []byte("unchanged\n"))
	head := r.commit()
	r.write("partial.go", []byte("staged\n"))
	r.command(nil, nil, "add", "--", "partial.go")
	r.write("partial.go", []byte("unstaged secret must stay outside snapshot\n"))
	indexPath := filepath.Join(r.dir, ".git", "index")
	before := snapshotTestRead(t, indexPath)
	snapshot := r.capture()
	if snapshot.Head != head || snapshot.Branch != "main" {
		t.Fatalf("unexpected identity: head=%q branch=%q", snapshot.Head, snapshot.Branch)
	}
	if len(snapshot.Files) != 1 || len(snapshot.Deleted) != 0 {
		t.Fatalf("unexpected changed files: %v %v", snapshot.Files, snapshot.Deleted)
	}
	file := snapshotTestFile(t, snapshot, "partial.go")
	if string(file.Data) != "staged\n" || file.Mode != "100644" || file.Unavailable != "" {
		t.Fatalf("unexpected staged file: %+v", file)
	}
	wantOID := r.command([]byte("staged\n"), nil, "hash-object", "--stdin")
	if file.ObjectID != wantOID {
		t.Fatalf("blob identity = %q, want %q", file.ObjectID, wantOID)
	}
	digest := sha256.Sum256(before)
	if snapshot.IndexSHA256 != hex.EncodeToString(digest[:]) {
		t.Fatalf("index digest does not bind exact bytes: %q", snapshot.IndexSHA256)
	}
	if len(snapshot.ID) != 64 {
		t.Fatalf("snapshot identity is not a SHA-256 digest: %q", snapshot.ID)
	}
	if !bytes.Equal(before, snapshotTestRead(t, indexPath)) {
		t.Fatal("Capture mutated the live index")
	}
	if got := r.command(nil, nil, "rev-parse", "HEAD"); got != head {
		t.Fatal("Capture changed HEAD")
	}
	again := r.capture()
	if again.ID != snapshot.ID {
		t.Fatal("unchanged captured state produced a different identity")
	}
	if err := os.Remove(filepath.Join(r.dir, "partial.go")); err != nil {
		t.Fatal(err)
	}
	withoutWorktree := r.capture()
	if string(snapshotTestFile(t, withoutWorktree, "partial.go").Data) != "staged\n" {
		t.Fatal("Capture depends on the worktree file")
	}
	r.write("partial.go", []byte("later staging\n"))
	r.command(nil, nil, "add", "--", "partial.go")
	if string(file.Data) != "staged\n" {
		t.Fatal("captured bytes changed with later staging")
	}
}

func TestSnapshotEmptyUnbornAndDetachedRepositories(t *testing.T) {
	r := newSnapshotTestRepo(t)
	empty := r.capture()
	if empty.Head != "" || empty.Branch != "main" || len(empty.Files) != 0 || len(empty.Deleted) != 0 {
		t.Fatalf("unexpected empty repository snapshot: %+v", empty)
	}
	r.write("new.txt", []byte("new\n"))
	r.command(nil, nil, "add", "--", "new.txt")
	unborn := r.capture()
	if unborn.Head != "" || string(snapshotTestFile(t, unborn, "new.txt").Data) != "new\n" {
		t.Fatalf("unexpected unborn snapshot: %+v", unborn)
	}
	head := r.commit()
	r.command(nil, nil, "checkout", "--detach", head)
	r.write("new.txt", []byte("detached staging\n"))
	r.command(nil, nil, "add", "--", "new.txt")
	detached := r.capture()
	if detached.Head != head || detached.Branch != "" {
		t.Fatalf("detached identity: %+v", detached)
	}
}

func TestSnapshotHonorsAlternateIndexWithoutChangingEitherIndex(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("chosen.txt", []byte("base\n"))
	r.commit()
	defaultPath := filepath.Join(r.dir, ".git", "index")
	defaultBefore := snapshotTestRead(t, defaultPath)
	alternate := filepath.Join(r.dir, "alternate index")
	if err := os.WriteFile(alternate, defaultBefore, 0600); err != nil {
		t.Fatal(err)
	}
	r.write("chosen.txt", []byte("alternate staged\n"))
	r.command(nil, []string{"GIT_INDEX_FILE=" + alternate}, "add", "--", "chosen.txt")
	alternateBefore := snapshotTestRead(t, alternate)
	t.Setenv("GIT_INDEX_FILE", alternate)
	snapshot := r.capture()
	if string(snapshotTestFile(t, snapshot, "chosen.txt").Data) != "alternate staged\n" {
		t.Fatal("did not capture the active alternate index")
	}
	if !bytes.Equal(defaultBefore, snapshotTestRead(t, defaultPath)) || !bytes.Equal(alternateBefore, snapshotTestRead(t, alternate)) {
		t.Fatal("Capture mutated an index")
	}
	t.Setenv("GIT_INDEX_FILE", "alternate index")
	relative := r.capture()
	if relative.ID != snapshot.ID {
		t.Fatal("relative alternate index selected different staged bytes")
	}
}

func TestSnapshotHandlesDeletedRenamedAndModeOnlyChanges(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("deleted.txt", []byte("delete\n"))
	r.write("old.txt", []byte("rename\n"))
	r.write("mode.sh", []byte("echo unchanged\n"))
	r.commit()
	r.command(nil, nil, "rm", "--", "deleted.txt")
	r.command(nil, nil, "mv", "--", "old.txt", "new.txt")
	r.command(nil, nil, "update-index", "--chmod=+x", "mode.sh")
	snapshot := r.capture()
	deleted := append([]string(nil), snapshot.Deleted...)
	sort.Strings(deleted)
	if strings.Join(deleted, "|") != "deleted.txt|old.txt" {
		t.Fatalf("deleted paths = %q", deleted)
	}
	if len(snapshot.Files) != 2 {
		t.Fatalf("changed files = %d", len(snapshot.Files))
	}
	if string(snapshotTestFile(t, snapshot, "new.txt").Data) != "rename\n" {
		t.Fatal("rename destination bytes missing")
	}
	if got := snapshotTestFile(t, snapshot, "mode.sh"); got.Mode != "100755" || string(got.Data) != "echo unchanged\n" {
		t.Fatalf("mode-only change missing: %+v", got)
	}
}

func TestSnapshotPreservesNULDelimitedUTF8PathsAndIndexV4(t *testing.T) {
	r := newSnapshotTestRepo(t)
	paths := []string{"-leading.go", "nested/a file (with spaces).txt", "unicode/雪.go"}
	if runtime.GOOS != "windows" {
		paths = append(paths, "tab\tname.txt", "line\nname.txt")
	}
	for _, name := range paths {
		r.write(name, []byte("staged "+name))
	}
	r.command(nil, nil, "add", "--all")
	r.command(nil, nil, "update-index", "--index-version=4")
	index := snapshotTestRead(t, filepath.Join(r.dir, ".git", "index"))
	if binary.BigEndian.Uint32(index[4:8]) != 4 {
		t.Fatal("fixture did not create index v4")
	}
	snapshot := r.capture()
	if len(snapshot.Files) != len(paths) {
		t.Fatalf("file count = %d, want %d", len(snapshot.Files), len(paths))
	}
	for _, name := range paths {
		if got := string(snapshotTestFile(t, snapshot, name).Data); got != "staged "+name {
			t.Fatalf("content for %q = %q", name, got)
		}
	}
}

func TestSnapshotDoesNotFollowSymlinksOrSubmodules(t *testing.T) {
	r := newSnapshotTestRepo(t)
	head := r.commit()
	linkOID := r.command([]byte(filepath.Join(t.TempDir(), "outside-secret")), nil, "hash-object", "-w", "--stdin")
	r.command(nil, nil, "update-index", "--add", "--cacheinfo", "120000,"+linkOID+",link.txt")
	r.command(nil, nil, "update-index", "--add", "--cacheinfo", "160000,"+head+",nested-module")
	snapshot := r.capture()
	for _, name := range []string{"link.txt", "nested-module"} {
		file := snapshotTestFile(t, snapshot, name)
		if file.Unavailable == "" || len(file.Data) != 0 {
			t.Fatalf("non-regular entry was scanned: %+v", file)
		}
	}
}

func TestSnapshotRefusesUnsupportedIndexStates(t *testing.T) {
	t.Run("intent to add", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		r.write("intent.txt", []byte("not staged\n"))
		r.command(nil, nil, "add", "--intent-to-add", "--", "intent.txt")
		r.refuses()
	})
	t.Run("unmerged", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		oid := r.command([]byte("conflict\n"), nil, "hash-object", "-w", "--stdin")
		entries := fmt.Sprintf("100644 %s 1\tconflict.txt\n100644 %s 2\tconflict.txt\n100644 %s 3\tconflict.txt\n", oid, oid, oid)
		r.command([]byte(entries), nil, "update-index", "--index-info")
		r.refuses()
	})
	t.Run("split", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		r.write("split.txt", []byte("staged\n"))
		r.command(nil, nil, "add", "--all")
		r.command(nil, nil, "update-index", "--split-index")
		r.refuses()
	})
	t.Run("sparse", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		r.write("keep/a.txt", []byte("a\n"))
		r.write("skip/b.txt", []byte("b\n"))
		r.commit()
		r.command(nil, nil, "sparse-checkout", "init", "--cone", "--sparse-index")
		r.command(nil, nil, "sparse-checkout", "set", "keep")
		r.refuses()
	})
}

func TestSnapshotRefusesInvalidPaths(t *testing.T) {
	t.Run("traversal index entry", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		r.write("safe", []byte("content\n"))
		r.command(nil, nil, "add", "--all")
		r.command(nil, nil, "update-index", "--index-version=2")
		indexPath := filepath.Join(r.dir, ".git", "index")
		index := snapshotTestRead(t, indexPath)
		const pathOffset = 12 + 62 // SHA-1 index v2 header and fixed entry fields.
		if string(index[pathOffset:pathOffset+4]) != "safe" {
			t.Fatal("unexpected fixture index encoding")
		}
		copy(index[pathOffset:pathOffset+4], "../x")
		digest := sha1.Sum(index[:len(index)-sha1.Size])
		copy(index[len(index)-sha1.Size:], digest[:])
		if err := os.WriteFile(indexPath, index, 0600); err != nil {
			t.Fatal(err)
		}
		r.refuses()
	})
	t.Run("non UTF-8 filename", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("Windows paths cannot preserve arbitrary non-UTF-8 bytes")
		}
		r := newSnapshotTestRepo(t)
		name := "invalid-\xff.txt"
		r.write(name, []byte("content\n"))
		r.command(nil, nil, "add", "--", name)
		r.refuses()
	})
}

func TestSnapshotRefusesResourceLimitExcess(t *testing.T) {
	t.Run("blob bytes", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		r.write("large.txt", bytes.Repeat([]byte("x"), 2*1024*1024+1))
		r.command(nil, nil, "add", "--all")
		r.refuses()
	})
	t.Run("total bytes", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		data := bytes.Repeat([]byte("x"), 2*1024*1024)
		for i := 0; i < 9; i++ {
			r.write(fmt.Sprintf("large-%d.txt", i), data)
		}
		r.command(nil, nil, "add", "--all")
		r.refuses()
	})
	t.Run("changed file count", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		for i := 0; i < 513; i++ {
			r.write(fmt.Sprintf("file-%03d.txt", i), nil)
		}
		r.command(nil, nil, "add", "--all")
		r.refuses()
	})
	t.Run("index bytes", func(t *testing.T) {
		r := newSnapshotTestRepo(t)
		index, err := os.Create(filepath.Join(r.dir, ".git", "index"))
		if err != nil {
			t.Fatal(err)
		}
		if err := index.Truncate(32*1024*1024 + 1); err != nil {
			index.Close()
			t.Fatal(err)
		}
		if err := index.Close(); err != nil {
			t.Fatal(err)
		}
		r.refuses()
	})
}

func TestSnapshotIgnoresInheritedGitRoutingAndConfig(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("correct.txt", []byte("correct repository\n"))
	r.command(nil, nil, "add", "--all")
	other := newSnapshotTestRepo(t)
	other.write("wrong.txt", []byte("wrong repository\n"))
	other.command(nil, nil, "add", "--all")
	t.Setenv("GIT_DIR", filepath.Join(other.dir, ".git"))
	t.Setenv("GIT_WORK_TREE", other.dir)
	t.Setenv("GIT_OBJECT_DIRECTORY", filepath.Join(other.dir, ".git", "objects"))
	t.Setenv("GIT_CONFIG_COUNT", "1")
	t.Setenv("GIT_CONFIG_KEY_0", "core.fsmonitor")
	t.Setenv("GIT_CONFIG_VALUE_0", "untrusted-monitor-command")
	snapshot := r.capture()
	if len(snapshot.Files) != 1 || string(snapshotTestFile(t, snapshot, "correct.txt").Data) != "correct repository\n" {
		t.Fatal("inherited Git routing or configuration changed capture")
	}
}

func TestSnapshotHonorsCancellation(t *testing.T) {
	r := newSnapshotTestRepo(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	snapshot, err := Capture(ctx, r.dir)
	if err == nil || snapshot != nil {
		t.Fatalf("cancelled capture succeeded: snapshot=%v err=%v", snapshot != nil, err)
	}
}

func TestSnapshotDisablesRepositoryConfiguredPrograms(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("executable fixture uses a POSIX script")
	}
	r := newSnapshotTestRepo(t)
	r.write("staged.txt", []byte("raw staged content\n"))
	r.command(nil, nil, "add", "--all")
	monitor := filepath.Join(r.dir, ".git", "untrusted-monitor")
	if err := os.WriteFile(monitor, []byte("#!/bin/sh\nprintf ran > \"$0.ran\"\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	r.command(nil, nil, "config", "core.fsmonitor", monitor)
	r.command(nil, nil, "config", "diff.untrusted.textconv", monitor)
	r.command(nil, nil, "config", "filter.untrusted.smudge", monitor)
	r.write(".gitattributes", []byte("*.txt diff=untrusted filter=untrusted\n"))
	snapshot := r.capture()
	if string(snapshotTestFile(t, snapshot, "staged.txt").Data) != "raw staged content\n" {
		t.Fatal("raw blob content changed")
	}
	if _, err := os.Stat(monitor + ".ran"); !os.IsNotExist(err) {
		t.Fatalf("a repository-configured program ran or its marker cannot be checked: %v", err)
	}
}

func TestSnapshotFromSubdirectoryStillCapturesTheWholeIndex(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("root.txt", []byte("root\n"))
	r.write("nested/deeper/child.txt", []byte("child\n"))
	r.command(nil, nil, "add", "--all")
	fromRoot := r.capture()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	fromChild, err := Capture(ctx, filepath.Join(r.dir, "nested", "deeper"))
	if err != nil {
		t.Fatal(err)
	}
	if fromChild.ID != fromRoot.ID || len(fromChild.Files) != 2 {
		t.Fatal("subdirectory capture changed the staged snapshot scope")
	}
	if string(snapshotTestFile(t, fromChild, "root.txt").Data) != "root\n" {
		t.Fatal("subdirectory capture lost a root file")
	}
}

func TestSnapshotRevalidationDetectsConcurrentIndexChanges(t *testing.T) {
	for _, change := range []string{"same inode changed bytes", "replacement with identical bytes", "disappearance", "appearance"} {
		t.Run(change, func(t *testing.T) {
			indexPath := filepath.Join(t.TempDir(), "index")
			if change != "appearance" {
				if err := os.WriteFile(indexPath, []byte("original"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			captured, err := readIndexSnapshot(indexPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateIndexSnapshot(captured); err != nil {
				t.Fatalf("unchanged index did not validate: %v", err)
			}
			switch change {
			case "same inode changed bytes":
				if err := os.WriteFile(indexPath, []byte("modified"), 0600); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(indexPath, captured.info.ModTime(), captured.info.ModTime()); err != nil {
					t.Fatal(err)
				}
			case "replacement with identical bytes":
				replacement := indexPath + ".replacement"
				if err := os.WriteFile(replacement, captured.data, captured.info.Mode().Perm()); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(replacement, captured.info.ModTime(), captured.info.ModTime()); err != nil {
					t.Fatal(err)
				}
				if err := os.Rename(replacement, indexPath); err != nil {
					t.Fatal(err)
				}
			case "disappearance":
				if err := os.Remove(indexPath); err != nil {
					t.Fatal(err)
				}
			case "appearance":
				if err := os.WriteFile(indexPath, []byte("appeared"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := validateIndexSnapshot(captured); err == nil {
				t.Fatal("changed index passed snapshot revalidation")
			}
		})
	}
}

func TestSnapshotCapturesSHA256RepositoryIdentities(t *testing.T) {
	git, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	r := snapshotTestRepo{t: t, dir: t.TempDir(), git: git}
	output, err := r.tryCommand(nil, nil, "init", "--initial-branch=main", "--object-format=sha256")
	if err != nil {
		unsupportedOption := strings.Contains(output, "unknown option") && strings.Contains(output, "object-format")
		unsupportedHash := strings.Contains(output, "unknown hash algorithm") && strings.Contains(output, "sha256")
		if unsupportedOption || unsupportedHash {
			t.Skipf("fixture Git explicitly lacks SHA-256 support: %s", output)
		}
		t.Fatalf("initialize SHA-256 fixture: %v: %s", err, output)
	}
	r.write("sha256.txt", []byte("base\n"))
	head := r.commit()
	r.write("sha256.txt", []byte("staged\n"))
	r.command(nil, nil, "add", "--all")
	index := snapshotTestRead(t, filepath.Join(r.dir, ".git", "index"))
	if len(index) < sha256.Size {
		t.Fatal("SHA-256 fixture index has no checksum")
	}
	checksum := sha256.Sum256(index[:len(index)-sha256.Size])
	if !bytes.Equal(checksum[:], index[len(index)-sha256.Size:]) {
		t.Fatal("SHA-256 fixture index checksum is invalid")
	}
	snapshot := r.capture()
	file := snapshotTestFile(t, snapshot, "sha256.txt")
	for name, identity := range map[string]string{"HEAD": snapshot.Head, "blob": file.ObjectID} {
		decoded, err := hex.DecodeString(identity)
		if err != nil || len(decoded) != sha256.Size {
			t.Fatalf("%s is not a 64-hex SHA-256 identity: %q", name, identity)
		}
	}
	if snapshot.Head != head || file.ObjectID != r.command([]byte("staged\n"), nil, "hash-object", "--stdin") || string(file.Data) != "staged\n" {
		t.Fatal("captured SHA-256 repository identities or bytes do not match Git")
	}
	indexDigest := sha256.Sum256(index)
	if snapshot.IndexSHA256 != hex.EncodeToString(indexDigest[:]) {
		t.Fatal("SHA-256 repository snapshot does not bind exact index bytes")
	}
}

func TestSnapshotRefusesCorruptedLooseBlobUnderStagedObjectID(t *testing.T) {
	r := newSnapshotTestRepo(t)
	r.write("content.txt", []byte("trusted\n"))
	r.command(nil, nil, "add", "--all")
	oid := r.command(nil, nil, "rev-parse", ":content.txt")
	corrupt := []byte("damaged\n") // Same size: metadata length checks cannot detect this.
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	if _, err := fmt.Fprintf(writer, "blob %d\x00", len(corrupt)); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write(corrupt); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	objectPath := filepath.Join(r.dir, ".git", "objects", oid[:2], oid[2:])
	// Git creates loose objects read-only. Replacing this disposable fixture
	// object preserves the OID pathname while changing its decompressed bytes.
	if err := os.Remove(objectPath); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(objectPath, compressed.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	if got := r.command(nil, nil, "cat-file", "blob", oid); got != strings.TrimSpace(string(corrupt)) {
		t.Fatal("fixture Git did not return the substituted same-size blob")
	}
	r.refuses()
}

func TestSnapshotGitRunnerBoundsOutputAndAggregateMetadata(t *testing.T) {
	r := newSnapshotTestRepo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	t.Run("single command output", func(t *testing.T) {
		g, err := newGitRunner(r.dir)
		if err != nil {
			t.Fatal(err)
		}
		output, _, err := g.run(ctx, 1, "rev-parse", "--is-inside-work-tree")
		if err == nil || len(output) != 0 {
			t.Fatalf("output cap returned successful or partial bytes: bytes=%d err=%v", len(output), err)
		}
	})
	t.Run("aggregate metadata", func(t *testing.T) {
		g, err := newGitRunner(r.dir)
		if err != nil {
			t.Fatal(err)
		}
		g.metadataRemaining = len("true\n")
		output, _, err := g.run(ctx, metadataLimit, "rev-parse", "--is-inside-work-tree")
		if err != nil || string(output) != "true\n" || g.metadataRemaining != 0 {
			t.Fatalf("first metadata command did not exhaust its exact budget: bytes=%q remaining=%d err=%v", output, g.metadataRemaining, err)
		}
		output, _, err = g.run(ctx, metadataLimit, "rev-parse", "--is-inside-work-tree")
		if err == nil || len(output) != 0 {
			t.Fatalf("exhausted metadata budget returned successful or partial bytes: bytes=%d err=%v", len(output), err)
		}
	})
}
