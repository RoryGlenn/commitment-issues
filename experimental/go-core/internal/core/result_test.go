// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package core

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func snapshotFor(files ...File) *Snapshot {
	return &Snapshot{ID: "snapshot", Head: "commit", Branch: "refs/heads/main", IndexSHA256: "digest", Files: files, Deleted: []string{}}
}

func checkByID(t *testing.T, r Result, id string) Check {
	t.Helper()
	for _, c := range r.Checks {
		if c.ID == id {
			return c
		}
	}
	t.Fatalf("check %s missing", id)
	return Check{}
}

func TestConflictMarkersUseStagedTextWithoutSourceDisclosure(t *testing.T) {
	r := Evaluate(snapshotFor(File{Path: "app.py", Mode: "100644", ObjectID: "blob", Data: []byte("\xef\xbb\xbf<<<<<<< private-branch\r\nsecret = 'private source'\n=======\n>>>>>>> other\n")}))
	if r.ExitCode != 0 || r.Status != "advisory" || len(r.Findings) != 3 {
		t.Fatalf("unexpected result: %+v", r)
	}
	if r.Findings[0].Details[1] != "line:1" || r.Findings[2].Details[1] != "line:4" {
		t.Fatal("wrong line attribution")
	}
	encoded, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "private source") || strings.Contains(string(encoded), "private-branch") {
		t.Fatal("source text leaked")
	}
	if checkByID(t, r, "ecosystem.tools").Details["executed"] != false {
		t.Fatal("invented ecosystem execution")
	}
}

func TestCleanUnknownExtensionHasOnlyNamedTextCoverage(t *testing.T) {
	r := Evaluate(snapshotFor(File{Path: "file.unrecognized", Mode: "100644", ObjectID: "blob", Data: []byte("print('fine')\n<<<<< not a marker\n")}))
	if r.Status != "clean" || len(r.Findings) != 0 {
		t.Fatalf("unexpected result: %+v", r)
	}
	if checkByID(t, r, "text.conflict-markers").Details["inspectedFiles"] != 1 {
		t.Fatal("unknown extension not inspected")
	}
	if checkByID(t, r, "ecosystem.tools").Status != "skipped" {
		t.Fatal("missing tools presented as passed")
	}
}

func TestCoverageGapsNeverBecomeCleanText(t *testing.T) {
	for _, tc := range []struct {
		name string
		file File
	}{
		{"binary", File{Path: "a.bin", Data: []byte("a\x00=======")}},
		{"encoding", File{Path: "a.txt", Data: []byte{0xff, 0xfe}}},
		{"symlink", File{Path: "link", Unavailable: "unsupported-mode"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := Evaluate(snapshotFor(tc.file))
			c := checkByID(t, r, "text.conflict-markers")
			if r.Status != "advisory" || c.Details["complete"] != false || c.Details["inspectedFiles"] != 0 || c.Details["excludedFiles"] != 1 {
				t.Fatalf("incorrect gap: %+v", r)
			}
		})
	}
}

func TestBoundedFindingsPreserveCounts(t *testing.T) {
	r := Evaluate(snapshotFor(File{Path: "many.txt", Data: []byte(strings.Repeat("=======\n", 100))}))
	if len(r.Findings) != 64 {
		t.Fatal("unbounded findings")
	}
	c := checkByID(t, r, "text.conflict-markers")
	if c.Details["markerCount"] != 100 || c.Details["findingsTruncated"] != true {
		t.Fatal("truncation lost evidence")
	}
	files := make([]File, 100)
	for i := range files {
		files[i] = File{Path: "opaque", Unavailable: "unsupported-mode"}
	}
	r = Evaluate(snapshotFor(files...))
	if checkByID(t, r, "git.snapshot").Details["omittedFileMetadata"] != 36 || checkByID(t, r, "text.conflict-markers").Details["gapsTruncated"] != true {
		t.Fatal("metadata truncation not visible")
	}
}

func TestDetachedUnbornAndDeletionOnly(t *testing.T) {
	s := snapshotFor()
	s.Branch = ""
	r := Evaluate(s)
	if r.Status != "advisory" || r.Findings[0].Check != "git.snapshot" {
		t.Fatal("detached HEAD missing")
	}
	s.Head = ""
	s.Deleted = []string{"removed.py"}
	r = Evaluate(s)
	if len(r.Findings) != 0 || checkByID(t, r, "text.conflict-markers").Status != "skipped" {
		t.Fatal("empty staged content incorrectly reported")
	}
}

func TestHumanEscapesRepositoryControlCharacters(t *testing.T) {
	r := Evaluate(snapshotFor(File{Path: "bad\n\x1b[31m\t.py", Data: []byte("=======\n")}))
	text := Human(r)
	if strings.Contains(text, "\x1b") || !strings.Contains(text, `bad\n\x1b[31m\t.py`) {
		t.Fatalf("unescaped output: %q", text)
	}
}

func TestCancelledRunDoesNotReportSuccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := Run(ctx, t.TempDir())
	if r.ExitCode != 130 || r.Status != "error" || checkByID(t, r, "git.snapshot").Details["complete"] != false {
		t.Fatalf("unexpected result: %+v", r)
	}
}

func TestUnavailableAndArraysFollowLegacyShape(t *testing.T) {
	for _, exit := range []int{0, 2} {
		r := Unavailable("example", "Unavailable.", exit)
		data, err := json.Marshal(r)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), "null") || r.ExitCode != exit {
			t.Fatalf("bad shape: %s", data)
		}
	}
}
