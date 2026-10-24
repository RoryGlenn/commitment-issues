// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

//go:build !unix

package core

import "os/exec"

// CommandContext terminates Git itself; WaitDelay bounds inherited pipes.
// Git transport/helper execution is disabled by the shared runner.
func configureCancellation(cmd *exec.Cmd) {}
