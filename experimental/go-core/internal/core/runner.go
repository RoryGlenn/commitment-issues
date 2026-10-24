// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

package core

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const metadataLimit = 8 << 20

var errOutputLimit = errors.New("Git output exceeds the capture limit")

// boundedOutput never retains bytes past its limit, including on a failed child.
type boundedOutput struct {
	buffer   bytes.Buffer
	limit    int
	exceeded bool
}

func (b *boundedOutput) Len() int { return b.buffer.Len() }

func (b *boundedOutput) Bytes() []byte { return b.buffer.Bytes() }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.Len() {
		b.exceeded = true
		return 0, errOutputLimit
	}
	return b.buffer.Write(p)
}

type gitRunner struct {
	path              string
	directory         string
	env               []string
	index             string
	metadataRemaining int
}

func newGitRunner(directory string) (*gitRunner, error) {
	git, err := exec.LookPath("git")
	if err != nil || !filepath.IsAbs(git) {
		return nil, errors.New("an installed Git executable is unavailable")
	}
	root, err := filepath.Abs(directory)
	if err != nil {
		return nil, errors.New("repository directory is unavailable")
	}
	env := make([]string, 0, len(os.Environ())+12)
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		upper := strings.ToUpper(key)
		if strings.HasPrefix(upper, "GIT_") || upper == "LC_ALL" || upper == "LANG" {
			continue
		}
		env = append(env, entry)
	}
	env = append(env,
		"LC_ALL=C", "LANG=C", "GIT_OPTIONAL_LOCKS=0",
		"GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_SYSTEM="+os.DevNull,
		"GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_ATTR_NOSYSTEM=1",
		"GIT_NO_REPLACE_OBJECTS=1", "GIT_NO_LAZY_FETCH=1",
		"GIT_TERMINAL_PROMPT=0", "GIT_PROTOCOL_FROM_USER=0", "GIT_ALLOW_PROTOCOL=",
	)
	return &gitRunner{path: git, directory: root, env: env, metadataRemaining: metadataLimit}, nil
}

// run invokes only the resolved Git executable. No shell, filters, attributes,
// optional index locks, fsmonitor, auto-maintenance, or network transports run.
// Callers receive safe labels rather than Git stderr, which may contain paths.
func (g *gitRunner) run(ctx context.Context, limit int, args ...string) ([]byte, int, error) {
	if err := ctx.Err(); err != nil {
		return nil, -1, errors.New("snapshot capture was interrupted")
	}
	isBlob := len(args) > 1 && args[0] == "cat-file" && args[1] == "blob"
	if !isBlob && limit > g.metadataRemaining {
		limit = g.metadataRemaining
	}
	flags := []string{
		"--no-pager", "--no-replace-objects",
		"-c", "core.quotePath=false", "-c", "core.fsmonitor=false",
		"-c", "core.untrackedCache=false", "-c", "core.hooksPath=" + os.DevNull,
		"-c", "core.attributesFile=" + os.DevNull, "-c", "gc.auto=0",
		"-c", "maintenance.auto=false", "-c", "protocol.allow=never",
		"-c", "submodule.recurse=false", "-c", "fetch.recurseSubmodules=false",
	}
	cmd := exec.CommandContext(ctx, g.path, append(flags, args...)...)
	cmd.Dir = g.directory
	cmd.Env = append([]string(nil), g.env...)
	if g.index != "" {
		cmd.Env = append(cmd.Env, "GIT_INDEX_FILE="+g.index)
	}
	cmd.WaitDelay = 250 * time.Millisecond
	configureCancellation(cmd)
	stdout := &boundedOutput{limit: limit}
	stderr := &boundedOutput{limit: 64 << 10}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	err := cmd.Run()
	if !isBlob {
		g.metadataRemaining -= stdout.Len()
	}
	if ctx.Err() != nil {
		return nil, -1, errors.New("snapshot capture was interrupted")
	}
	if stdout.exceeded || stderr.exceeded {
		return nil, -1, errOutputLimit
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return nil, exit.ExitCode(), errors.New("Git could not inspect the captured repository state")
		}
		return nil, -1, errors.New("Git inspection could not complete")
	}
	return stdout.Bytes(), 0, nil
}
