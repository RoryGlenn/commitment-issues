// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package core

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Result deliberately preserves the existing JSON v1 shape. Experimental
// capabilities and snapshot provenance belong inside check details.
type Result struct {
	SchemaVersion int          `json:"schemaVersion"`
	Command       string       `json:"command"`
	Mode          string       `json:"mode"`
	Status        string       `json:"status"`
	ExitCode      int          `json:"exitCode"`
	Summary       string       `json:"summary"`
	Checks        []Check      `json:"checks"`
	Findings      []Finding    `json:"findings"`
	Suggestions   []Suggestion `json:"suggestions"`
	Diagnostics   []Diagnostic `json:"diagnostics"`
}

type Check struct {
	ID      string         `json:"id"`
	Status  string         `json:"status"`
	Summary string         `json:"summary"`
	Details map[string]any `json:"details"`
}

type Finding struct {
	Check       string   `json:"check"`
	Severity    string   `json:"severity"`
	Message     string   `json:"message"`
	AutoFixable bool     `json:"autoFixable"`
	Details     []string `json:"details"`
}

type Suggestion struct {
	Command     string `json:"command"`
	Description string `json:"description"`
}

type Diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

func baseResult() Result {
	return Result{SchemaVersion: 1, Command: "precommit", Mode: "advisory",
		Status: "clean", Summary: "Experimental staged checks completed; ecosystem lint and tests were not run.",
		Checks: []Check{}, Findings: []Finding{}, Suggestions: []Suggestion{}, Diagnostics: []Diagnostic{}}
}

// Unavailable never represents an uninspected snapshot as clean. Operational
// failures remain advisory; CLI misuse and cancellation have distinct exits.
func Unavailable(code, message string, exitCode int) Result {
	r := baseResult()
	r.Status, r.ExitCode, r.Summary = "advisory", exitCode, message
	if exitCode != 0 {
		r.Status = "error"
	}
	r.Checks = append(r.Checks, Check{ID: "git.snapshot", Status: "advisory", Summary: "Snapshot unavailable.",
		Details: map[string]any{"complete": false, "source": "index", "reason": code}})
	r.Diagnostics = append(r.Diagnostics, Diagnostic{Severity: "warning", Code: code, Message: message})
	return r
}

func Run(ctx context.Context, directory string) Result {
	snapshot, err := Capture(ctx, directory)
	if err != nil {
		if ctx.Err() != nil {
			return Unavailable("cancelled", "Staged inspection was interrupted; no complete result is available.", 130)
		}
		// Git output and filesystem errors may contain paths, source or terminal
		// controls. Keep this boundary diagnostic stable and content-free.
		return Unavailable("snapshot-unavailable", "Unable to capture the staged snapshot. Check repository/index validity and prototype limits.", 0)
	}
	if ctx.Err() != nil {
		return Unavailable("cancelled", "Staged inspection was interrupted; no complete result is available.", 130)
	}
	r := Evaluate(snapshot)
	if ctx.Err() != nil {
		return Unavailable("cancelled", "Staged inspection was interrupted; no complete result is available.", 130)
	}
	return r
}

const maxReportedFindings = 64

// Evaluate inspects only immutable blob bytes supplied by Capture. There is no
// worktree read, project configuration loader, or ecosystem process launch.
func Evaluate(snapshot *Snapshot) Result {
	r := baseResult()
	files := []map[string]string{}
	for _, file := range snapshot.Files {
		if len(files) == maxReportedFindings {
			break
		}
		files = append(files, map[string]string{"path": file.Path, "mode": file.Mode, "oid": file.ObjectID})
	}
	r.Checks = append(r.Checks, Check{ID: "git.snapshot", Status: "passed", Summary: "Captured staged changes without changing the repository.",
		Details: map[string]any{"complete": true, "source": "index", "snapshotID": snapshot.ID,
			"head": snapshot.Head, "branch": snapshot.Branch, "indexSHA256": snapshot.IndexSHA256,
			"changedFiles": len(snapshot.Files), "deletedFiles": len(snapshot.Deleted), "files": files,
			"filesTruncated": len(snapshot.Files) > len(files), "omittedFileMetadata": len(snapshot.Files) - len(files)}})
	if snapshot.Head != "" && snapshot.Branch == "" {
		r.Findings = append(r.Findings, Finding{Check: "git.snapshot", Severity: "warning", Message: "HEAD is detached; confirm the intended branch before committing.", Details: []string{}})
		r.Checks[0].Status = "advisory"
	}
	inspected, excluded, markerCount, pythonFiles, reportedMarkers := 0, 0, 0, 0, 0
	gaps := []map[string]string{}
	for _, file := range snapshot.Files {
		if strings.HasSuffix(strings.ToLower(file.Path), ".py") {
			pythonFiles++
		}
		reason := file.Unavailable
		if reason == "" && !utf8.Valid(file.Data) {
			reason = "invalid-utf8"
		}
		if reason == "" && bytes.IndexByte(file.Data, 0) >= 0 {
			reason = "binary"
		}
		if reason != "" {
			excluded++
			if len(gaps) < maxReportedFindings {
				gaps = append(gaps, map[string]string{"path": file.Path, "reason": reason})
			}
			continue
		}
		inspected++
		// Full changed blobs are intentionally scanned, not just added lines.
		// This is a labeled text heuristic, not a parser or a merge validator.
		remaining := file.Data
		for lineNumber := 0; len(remaining) != 0; lineNumber++ {
			line, rest, _ := bytes.Cut(remaining, []byte{'\n'})
			remaining = rest
			line = bytes.TrimSuffix(line, []byte{'\r'})
			if lineNumber == 0 {
				line = bytes.TrimPrefix(line, []byte{0xef, 0xbb, 0xbf})
			}
			if !(bytes.HasPrefix(line, []byte("<<<<<<< ")) || bytes.HasPrefix(line, []byte("||||||| ")) ||
				bytes.Equal(line, []byte("=======")) || bytes.HasPrefix(line, []byte(">>>>>>> "))) {
				continue
			}
			markerCount++
			if len(r.Findings) < maxReportedFindings {
				reportedMarkers++
				r.Findings = append(r.Findings, Finding{Check: "text.conflict-markers", Severity: "warning",
					Message: "Possible unresolved conflict marker in staged text.",
					Details: []string{file.Path, fmt.Sprintf("line:%d", lineNumber+1), "blob:" + file.ObjectID}})
			}
		}
	}
	status := "passed"
	if len(snapshot.Files) == 0 {
		status = "skipped"
	} else if markerCount != 0 || excluded != 0 {
		status = "advisory"
	}
	r.Checks = append(r.Checks, Check{ID: "text.conflict-markers", Status: status,
		Summary: "Bounded UTF-8 conflict-marker heuristic on changed staged blobs.",
		Details: map[string]any{"complete": excluded == 0, "inspectedFiles": inspected, "excludedFiles": excluded,
			"coverageGaps": gaps, "gapsTruncated": excluded > len(gaps), "markerCount": markerCount,
			"findingsTruncated": markerCount > reportedMarkers,
			"scope":             "full changed staged blobs", "confidence": "heuristic"}})
	r.Checks = append(r.Checks, Check{ID: "ecosystem.tools", Status: "skipped", Summary: "Ruff, formatters, linters and tests are unavailable in this prototype.",
		Details: map[string]any{"complete": false, "reason": "not-implemented", "executed": false,
			"pythonFilesByExtension": pythonFiles, "trustGrant": false}})
	if len(r.Findings) != 0 || excluded != 0 {
		r.Status = "advisory"
		r.Summary = "Commit allowed with advisories or coverage gaps; ecosystem lint and tests were not run."
	}
	return r
}

// Human never prints unescaped repository-controlled values or source text.
func Human(result Result) string {
	var out strings.Builder
	fmt.Fprintln(&out, result.Summary)
	for _, check := range result.Checks {
		fmt.Fprintf(&out, "%s: %s — %s\n", check.ID, check.Status, check.Summary)
	}
	for _, finding := range result.Findings {
		fmt.Fprintln(&out, finding.Message)
		for _, detail := range finding.Details {
			fmt.Fprintf(&out, "  %s\n", strconv.QuoteToASCII(detail))
		}
	}
	return out.String()
}
