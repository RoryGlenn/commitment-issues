// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package main_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

var cliBinary, gitBinary, helperBinary string

// The fixture executable is native Go, so deadline and unexpected-launch tests
// do not depend on a shell, Node, Python, Ruff, or an external network service.
func TestMain(m *testing.M) {
	if mode := os.Getenv("COMMITMENT_GO_ACCEPTANCE_HELPER"); mode != "" {
		if marker := os.Getenv("COMMITMENT_GO_ACCEPTANCE_MARKER"); marker != "" {
			if err := os.WriteFile(marker, []byte(mode), 0o600); err != nil {
				os.Exit(98)
			}
		}
		if mode == "slow-git" {
			time.Sleep(2 * time.Second)
			os.Exit(0)
		}
		os.Exit(97)
	}
	var err error
	gitBinary, err = exec.LookPath("git")
	if err != nil {
		fmt.Fprintln(os.Stderr, "CLI acceptance tests require Git:", err)
		os.Exit(1)
	}
	helperBinary, err = os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	// Packaged-artifact verification can select already built bytes explicitly.
	// This variable is test-only and is removed from the CLI fixture environment.
	if candidate, provided := os.LookupEnv("COMMITMENT_GO_BINARY"); provided {
		info, err := os.Lstat(candidate)
		if !filepath.IsAbs(candidate) || err != nil || !info.Mode().IsRegular() {
			fmt.Fprintln(os.Stderr, "COMMITMENT_GO_BINARY must name an existing absolute regular file")
			os.Exit(1)
		}
		cliBinary = candidate
		fmt.Fprintln(os.Stderr, "CLI acceptance artifact:", cliBinary)
		os.Exit(m.Run())
	}
	goBinary, err := exec.LookPath("go")
	if err != nil {
		fmt.Fprintln(os.Stderr, "CLI acceptance tests require the local Go toolchain:", err)
		os.Exit(1)
	}
	buildDirectory, err := os.MkdirTemp("", "commitment-go-cli-build-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	cliBinary = filepath.Join(buildDirectory, "commitment-issues-go")
	if runtime.GOOS == "windows" {
		cliBinary += ".exe"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	build := exec.CommandContext(ctx, goBinary, "build", "-trimpath", "-o", cliBinary, ".")
	build.Env = environment(os.Environ(), map[string]string{
		"GOTOOLCHAIN": "local", "GOPROXY": "off", "GOSUMDB": "off", "GOWORK": "off",
	})
	output, err := build.CombinedOutput()
	cancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "build CLI: %v\n%s", err, output)
		_ = os.RemoveAll(buildDirectory)
		os.Exit(1)
	}
	code := m.Run()
	_ = os.RemoveAll(buildDirectory)
	os.Exit(code)
}

func environment(base []string, values map[string]string) []string {
	result := make([]string, 0, len(base)+len(values))
	for _, item := range base {
		key, _, _ := strings.Cut(item, "=")
		if _, replaced := values[key]; !replaced {
			result = append(result, item)
		}
	}
	for key, value := range values {
		result = append(result, key+"="+value)
	}
	return result
}

type fixture struct {
	t    *testing.T
	root string
	env  []string
	path string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("restricted executable-path acceptance fixtures currently require POSIX symlinks")
	}
	f := &fixture{t: t, root: t.TempDir(), path: t.TempDir()}
	config := filepath.Join(t.TempDir(), "empty-gitconfig")
	if err := os.WriteFile(config, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	base := []string{}
	for _, item := range os.Environ() {
		key, _, _ := strings.Cut(item, "=")
		if !strings.HasPrefix(key, "GIT_") && key != "COMMITMENT_ISSUES" && key != "HUSKY" && key != "COMMITMENT_GO_BINARY" && !strings.HasPrefix(key, "COMMITMENT_GO_ACCEPTANCE_") {
			base = append(base, item)
		}
	}
	f.env = environment(base, map[string]string{
		"GIT_CONFIG_GLOBAL": config, "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0",
		"GIT_OPTIONAL_LOCKS": "0", "GIT_AUTHOR_NAME": "acceptance-fixture",
		"GIT_AUTHOR_EMAIL": "fixture@example.invalid", "GIT_COMMITTER_NAME": "acceptance-fixture",
		"GIT_COMMITTER_EMAIL": "fixture@example.invalid", "NO_COLOR": "1",
	})
	for name, source := range map[string]string{"git": gitBinary, "commitment-issues-go": cliBinary} {
		if err := os.Symlink(source, filepath.Join(f.path, name)); err != nil {
			t.Fatal(err)
		}
	}
	f.git("init", "--initial-branch=fixture-main")
	f.write("app.py", []byte("print('base')\n"))
	f.git("add", "--", "app.py")
	f.commit()
	if _, err := os.Stat(filepath.Join(f.root, "package.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Python-only fixture unexpectedly has package.json: %v", err)
	}
	return f
}

func (f *fixture) write(name string, data []byte) {
	f.t.Helper()
	file := filepath.Join(f.root, name)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		f.t.Fatal(err)
	}
	if err := os.WriteFile(file, data, 0o644); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) git(args ...string) string {
	f.t.Helper()
	return f.gitWith(nil, args...)
}

func (f *fixture) gitWith(extra map[string]string, args ...string) string {
	f.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, gitBinary, args...)
	command.Dir, command.Env = f.root, environment(f.env, extra)
	output, err := command.CombinedOutput()
	if err != nil {
		f.t.Fatalf("fixture Git %q: %v\n%s", args, err, output)
	}
	return strings.TrimSpace(string(output))
}

func (f *fixture) commit() {
	f.t.Helper()
	// Only fixture setup commits. Empty hooks avoid executing user or host code;
	// the checker itself must leave history and every other repository file alone.
	f.git("-c", "core.hooksPath="+f.t.TempDir(), "-c", "commit.gpgSign=false", "commit", "--no-gpg-sign", "-m", "fixture baseline")
}

func (f *fixture) runtimeEnv(extra map[string]string) []string {
	return environment(environment(f.env, map[string]string{"PATH": f.path}), extra)
}

type invocation struct {
	code   int
	stdout string
	stderr string
}

func (f *fixture) run(extra map[string]string, args ...string) invocation {
	f.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, cliBinary, args...)
	command.Dir, command.Env = f.root, f.runtimeEnv(extra)
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	err := command.Run()
	if ctx.Err() != nil {
		f.t.Fatalf("CLI exceeded acceptance watchdog: %v", ctx.Err())
	}
	return invocation{code: exitCode(f.t, err), stdout: stdout.String(), stderr: stderr.String()}
}

func exitCode(t *testing.T, err error) int {
	t.Helper()
	if err == nil {
		return 0
	}
	var exit *exec.ExitError
	if !errors.As(err, &exit) {
		t.Fatalf("cannot start CLI: %v", err)
	}
	return exit.ExitCode()
}

type result struct {
	SchemaVersion int          `json:"schemaVersion"`
	Command       string       `json:"command"`
	Mode          string       `json:"mode"`
	Status        string       `json:"status"`
	ExitCode      int          `json:"exitCode"`
	Summary       string       `json:"summary"`
	Checks        []check      `json:"checks"`
	Findings      []finding    `json:"findings"`
	Suggestions   []suggestion `json:"suggestions"`
	Diagnostics   []diagnostic `json:"diagnostics"`
}

type check struct {
	ID      string         `json:"id"`
	Status  string         `json:"status"`
	Summary string         `json:"summary"`
	Details map[string]any `json:"details"`
}

type finding struct {
	Check       string   `json:"check"`
	Severity    string   `json:"severity"`
	Message     string   `json:"message"`
	AutoFixable bool     `json:"autoFixable"`
	Details     []string `json:"details"`
}

type suggestion struct {
	Command     string `json:"command"`
	Description string `json:"description"`
}

type diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

func decode(t *testing.T, output invocation, expectedCode int) result {
	t.Helper()
	if output.code != expectedCode {
		t.Fatalf("exit %d, want %d; stdout=%s stderr=%s", output.code, expectedCode, output.stdout, output.stderr)
	}
	if output.stderr != "" {
		t.Fatalf("unexpected stderr: %s", output.stderr)
	}
	if !strings.HasSuffix(output.stdout, "\n") || strings.ContainsRune(output.stdout, '\x1b') {
		t.Fatalf("JSON must have one final newline and no raw ANSI: %q", output.stdout)
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal([]byte(output.stdout), &keys); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"schemaVersion", "command", "mode", "status", "exitCode", "summary", "checks", "findings", "suggestions", "diagnostics"} {
		if value, exists := keys[key]; !exists || string(value) == "null" {
			t.Fatalf("missing/null JSON v1 field %q", key)
		}
	}
	decoder := json.NewDecoder(strings.NewReader(output.stdout))
	decoder.DisallowUnknownFields()
	var r result
	if err := decoder.Decode(&r); err != nil {
		t.Fatal(err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		t.Fatalf("stdout must contain exactly one JSON value, got %v", err)
	}
	if r.SchemaVersion != 1 || r.Command != "precommit" || r.Mode != "advisory" || r.ExitCode != expectedCode || r.Summary == "" {
		t.Fatalf("invalid JSON v1 envelope: %+v", r)
	}
	allowedStatus := map[string]bool{"clean": true, "advisory": true, "blocked": true, "skipped": true, "error": true}
	if !allowedStatus[r.Status] {
		t.Fatalf("invalid result status: %q", r.Status)
	}
	for _, c := range r.Checks {
		if c.ID == "" || c.Summary == "" || c.Details == nil || !map[string]bool{"passed": true, "advisory": true, "failed": true, "skipped": true}[c.Status] {
			t.Fatalf("invalid check: %+v", c)
		}
	}
	for _, f := range r.Findings {
		if f.Check == "" || f.Message == "" || f.AutoFixable || f.Details == nil || (f.Severity != "warning" && f.Severity != "error") {
			t.Fatalf("invalid/read-write finding: %+v", f)
		}
	}
	return r
}

func findCheck(t *testing.T, r result, id string) check {
	t.Helper()
	for _, c := range r.Checks {
		if c.ID == id {
			return c
		}
	}
	t.Fatalf("missing check %q in %+v", id, r)
	return check{}
}

func noEcosystemExecution(t *testing.T, r result) {
	t.Helper()
	c := findCheck(t, r, "ecosystem.tools")
	if c.Status != "skipped" || c.Details["executed"] != false || c.Details["complete"] != false {
		t.Fatalf("unimplemented ecosystem checks must remain visibly unexecuted: %+v", c)
	}
}

func fileDigest(t *testing.T, file string) string {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

// Include .git/objects, the index, refs, hooks and worktree files. Comparing
// bytes and modes catches index refreshes and hidden object writes as well as
// source edits; no post-check Git command can refresh the index for this check.
func repositoryState(t *testing.T, root string) map[string]string {
	t.Helper()
	state := map[string]string{}
	err := filepath.WalkDir(root, func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		identity := info.Mode().String()
		if info.Mode().IsRegular() {
			identity += ":" + fileDigest(t, name)
		} else if info.Mode()&os.ModeSymlink != 0 {
			target, err := os.Readlink(name)
			if err != nil {
				return err
			}
			identity += ":" + target
		}
		state[filepath.ToSlash(relative)] = identity
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func assertUnchanged(t *testing.T, f *fixture, before map[string]string) {
	t.Helper()
	if after := repositoryState(t, f.root); !reflect.DeepEqual(before, after) {
		for file, old := range before {
			if after[file] != old {
				t.Errorf("repository file changed: %q", file)
			}
		}
		for file := range after {
			if _, existed := before[file]; !existed {
				t.Errorf("checker created repository path: %q", file)
			}
		}
		t.FailNow()
	}
}

func TestPythonOnlyStagedSnapshotIgnoresWorktree(t *testing.T) {
	for _, stagedBad := range []bool{true, false} {
		t.Run(fmt.Sprintf("staged-conflict-%t", stagedBad), func(t *testing.T) {
			f := newFixture(t)
			clean := []byte("print('changed clean source')\n")
			bad := []byte("print('source must stay private')\n<<<<<<< DO_NOT_PRINT_THIS_SOURCE\n")
			staged, worktree := clean, bad
			if stagedBad {
				staged, worktree = bad, clean
			}
			f.write("app.py", staged)
			f.git("add", "--", "app.py")
			oid := f.git("rev-parse", ":app.py")
			head := f.git("rev-parse", "HEAD")
			indexHash := fileDigest(t, filepath.Join(f.root, ".git", "index"))
			f.write("app.py", worktree)
			before := repositoryState(t, f.root)
			output := f.run(nil, "precommit", "--json")
			r := decode(t, output, 0)
			assertUnchanged(t, f, before)
			if strings.Contains(output.stdout, "DO_NOT_PRINT_THIS_SOURCE") || strings.Contains(output.stdout, "source must stay private") {
				t.Fatal("result disclosed source excerpts")
			}
			c := findCheck(t, r, "git.snapshot")
			snapshotID, hasSnapshotID := c.Details["snapshotID"].(string)
			if c.Status != "passed" || c.Details["source"] != "index" || c.Details["head"] != head || c.Details["indexSHA256"] != indexHash || !hasSnapshotID || snapshotID == "" {
				t.Fatalf("snapshot identity does not match active index: %+v", c)
			}
			files, ok := c.Details["files"].([]any)
			if !ok || len(files) != 1 {
				t.Fatalf("expected one exact staged file, got %#v", c.Details["files"])
			}
			file, ok := files[0].(map[string]any)
			if !ok || file["path"] != "app.py" || file["mode"] != "100644" || file["oid"] != oid {
				t.Fatalf("incorrect file provenance: %#v", file)
			}
			text := findCheck(t, r, "text.conflict-markers")
			if stagedBad {
				if r.Status != "advisory" || text.Status != "advisory" || len(r.Findings) != 1 || r.Findings[0].Details[0] != "app.py" {
					t.Fatalf("staged conflict not reported: %+v", r)
				}
			} else if text.Status != "passed" || len(r.Findings) != 0 {
				t.Fatalf("unstaged conflict affected staged result: %+v", r)
			}
			noEcosystemExecution(t, r)
		})
	}
}

func TestAlternateIndexIsTheSource(t *testing.T) {
	f := newFixture(t)
	alternate := filepath.Join(t.TempDir(), "alternate-index")
	data, err := os.ReadFile(filepath.Join(f.root, ".git", "index"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(alternate, data, 0o600); err != nil {
		t.Fatal(err)
	}
	extra := map[string]string{"GIT_INDEX_FILE": alternate}
	f.write("app.py", []byte("<<<<<<< alternate-only\n"))
	f.gitWith(extra, "add", "--", "app.py")
	f.write("app.py", []byte("print('working clean')\n"))
	before, alternateHash := repositoryState(t, f.root), fileDigest(t, alternate)
	r := decode(t, f.run(extra, "precommit", "--json"), 0)
	if len(r.Findings) != 1 || findCheck(t, r, "git.snapshot").Details["indexSHA256"] != alternateHash {
		t.Fatalf("alternate index was not inspected: %+v", r)
	}
	defaultResult := decode(t, f.run(nil, "precommit", "--json"), 0)
	if len(defaultResult.Findings) != 0 || findCheck(t, defaultResult, "text.conflict-markers").Status != "skipped" {
		t.Fatalf("default index unexpectedly absorbed alternate changes: %+v", defaultResult)
	}
	assertUnchanged(t, f, before)
	if fileDigest(t, alternate) != alternateHash {
		t.Fatal("alternate index changed")
	}
}

func TestUnknownTextAndControlledFilenamePresentation(t *testing.T) {
	f := newFixture(t)
	name := "unknown\nline\t\x1b[31m.custom"
	f.write(name, []byte("<<<<<<< PRIVATE_MARKER_LABEL\n"))
	f.git("add", "--", name)
	before := repositoryState(t, f.root)
	jsonOutput := f.run(nil, "precommit", "--json")
	r := decode(t, jsonOutput, 0)
	if len(r.Findings) != 1 || r.Findings[0].Details[0] != name {
		t.Fatalf("JSON did not preserve exact filename: %+v", r.Findings)
	}
	human := f.run(nil, "precommit")
	if human.code != 0 || strings.Contains(human.stdout, name) || strings.ContainsAny(human.stdout, "\x1b\t") || !strings.Contains(human.stdout, `\n`) || !strings.Contains(human.stdout, `\t`) || !strings.Contains(human.stdout, `\x1b`) {
		t.Fatalf("unsafe/unrecognizable terminal filename: %q", human.stdout)
	}
	if strings.Contains(jsonOutput.stdout+human.stdout, "PRIVATE_MARKER_LABEL") {
		t.Fatal("source excerpt leaked into output")
	}
	assertUnchanged(t, f, before)
}

func TestBinaryAndInvalidUTF8ProduceCoverageGaps(t *testing.T) {
	f := newFixture(t)
	f.write("opaque.bin", []byte("\x00<<<<<<< opaque\n"))
	f.write("invalid.py", []byte{0xff, '\n', '<', '<', '<', '<', '<', '<', '<', ' ', 'x'})
	f.git("add", "--", "opaque.bin", "invalid.py")
	before := repositoryState(t, f.root)
	r := decode(t, f.run(nil, "precommit", "--json"), 0)
	c := findCheck(t, r, "text.conflict-markers")
	if r.Status != "advisory" || c.Status != "advisory" || c.Details["complete"] != false || c.Details["excludedFiles"] != float64(2) || len(r.Findings) != 0 {
		t.Fatalf("excluded input falsely reported inspected: %+v", r)
	}
	gaps, ok := c.Details["coverageGaps"].([]any)
	if !ok || len(gaps) != 2 {
		t.Fatalf("missing per-file coverage gaps: %#v", c.Details)
	}
	reasons := map[string]string{}
	for _, raw := range gaps {
		gap, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("invalid gap: %#v", raw)
		}
		name, _ := gap["path"].(string)
		reason, _ := gap["reason"].(string)
		reasons[name] = reason
	}
	if reasons["opaque.bin"] != "binary" || reasons["invalid.py"] != "invalid-utf8" {
		t.Fatalf("wrong coverage-gap classifications: %#v", reasons)
	}
	assertUnchanged(t, f, before)
}

func TestDeletionOnlyDoesNotInventTextCoverage(t *testing.T) {
	f := newFixture(t)
	f.git("rm", "--", "app.py")
	before := repositoryState(t, f.root)
	r := decode(t, f.run(nil, "precommit", "--json"), 0)
	if findCheck(t, r, "text.conflict-markers").Status != "skipped" || len(r.Findings) != 0 || findCheck(t, r, "git.snapshot").Details["deletedFiles"] != float64(1) {
		t.Fatalf("deletion-only result invented findings/coverage: %+v", r)
	}
	noEcosystemExecution(t, r)
	assertUnchanged(t, f, before)
}

func TestProjectConfigAndEcosystemToolsAreNeverExecuted(t *testing.T) {
	f := newFixture(t)
	marker := filepath.Join(t.TempDir(), "unexpected-execution")
	for _, name := range []string{"node", "npm", "npx", "ruff", "python", "python3", "pip", "uv", "go", "curl", "wget", "unexpected-fsmonitor"} {
		if err := os.Symlink(helperBinary, filepath.Join(f.path, name)); err != nil {
			t.Fatal(err)
		}
	}
	f.write("app.py", []byte("<<<<<<< staged-only\n"))
	f.git("add", "--", "app.py")
	f.write(".commitmentrc.json", []byte("deliberately invalid project configuration\n"))
	f.write("pyproject.toml", []byte("[tool.ruff]\ninvalid = [\n"))
	f.git("config", "core.fsmonitor", filepath.Join(f.path, "unexpected-fsmonitor"))
	if err := os.Symlink(helperBinary, filepath.Join(f.root, ".git", "hooks", "pre-commit")); err != nil {
		t.Fatal(err)
	}
	before := repositoryState(t, f.root)
	r := decode(t, f.run(map[string]string{"COMMITMENT_GO_ACCEPTANCE_HELPER": "unexpected-tool", "COMMITMENT_GO_ACCEPTANCE_MARKER": marker}, "precommit", "--json"), 0)
	if len(r.Findings) != 1 || findCheck(t, r, "git.snapshot").Status != "passed" {
		t.Fatalf("project configuration affected static inspection: %+v", r)
	}
	noEcosystemExecution(t, r)
	if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("checker executed a project hook/tool or network acquisition command: %v", err)
	}
	assertUnchanged(t, f, before)
}

func TestUsageHelpAndMissingGit(t *testing.T) {
	f := newFixture(t)
	before := repositoryState(t, f.root)
	for _, args := range [][]string{{"unknown", "--json"}, {"precommit", "--json", "--ruff"}, {"precommit", "--json", "extra"}, {"precommit", "--json", "--timeout", "0s"}, {"precommit", "--json", "--timeout", "31s"}, {"precommit", "--json", "--timeout", "not-a-duration"}} {
		r := decode(t, f.run(nil, args...), 2)
		if r.Status != "error" {
			t.Fatalf("invalid usage did not return an error: %+v", r)
		}
	}
	emptyPath := t.TempDir()
	for _, args := range [][]string{{"--help"}, {"--version"}} {
		output := f.run(map[string]string{"PATH": emptyPath}, args...)
		if output.code != 0 || output.stdout == "" || output.stderr != "" {
			t.Fatalf("standalone metadata command failed: %+v", output)
		}
	}
	r := decode(t, f.run(map[string]string{"PATH": emptyPath}, "precommit", "--json"), 0)
	if r.Status != "advisory" || findCheck(t, r, "git.snapshot").Details["complete"] != false || len(r.Findings) != 0 || len(r.Diagnostics) == 0 {
		t.Fatalf("missing Git falsely passed: %+v", r)
	}
	assertUnchanged(t, f, before)
}

func slowGitEnvironment(t *testing.T) map[string]string {
	t.Helper()
	directory := t.TempDir()
	if err := os.Symlink(helperBinary, filepath.Join(directory, "git")); err != nil {
		t.Fatal(err)
	}
	return map[string]string{"PATH": directory, "COMMITMENT_GO_ACCEPTANCE_HELPER": "slow-git", "COMMITMENT_GO_ACCEPTANCE_MARKER": filepath.Join(t.TempDir(), "started")}
}

func TestDeadlineReturnsIncompleteResultWithoutMutation(t *testing.T) {
	f := newFixture(t)
	before := repositoryState(t, f.root)
	r := decode(t, f.run(slowGitEnvironment(t), "precommit", "--json", "--timeout", "20ms"), 130)
	if r.Status != "error" || findCheck(t, r, "git.snapshot").Details["complete"] != false {
		t.Fatalf("deadline falsely returned a complete result: %+v", r)
	}
	assertUnchanged(t, f, before)
}

func TestInterruptReturnsIncompleteResultWithoutMutation(t *testing.T) {
	f := newFixture(t)
	extra := slowGitEnvironment(t)
	before := repositoryState(t, f.root)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, cliBinary, "precommit", "--json", "--timeout", "30s")
	command.Dir, command.Env = f.root, f.runtimeEnv(extra)
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	ready := false
	for deadline := time.Now().Add(time.Second); time.Now().Before(deadline); {
		if _, err := os.Stat(extra["COMMITMENT_GO_ACCEPTANCE_MARKER"]); err == nil {
			ready = true
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if !ready {
		cancel()
		_ = command.Wait()
		t.Fatal("fixture Git did not start before interruption")
	}
	if err := command.Process.Signal(os.Interrupt); err != nil {
		cancel()
		_ = command.Wait()
		t.Fatal(err)
	}
	err := command.Wait()
	if ctx.Err() != nil {
		t.Fatal("CLI did not terminate after interruption")
	}
	r := decode(t, invocation{code: exitCode(t, err), stdout: stdout.String(), stderr: stderr.String()}, 130)
	if r.Status != "error" || findCheck(t, r, "git.snapshot").Details["complete"] != false {
		t.Fatalf("interruption falsely returned a complete result: %+v", r)
	}
	assertUnchanged(t, f, before)
}
