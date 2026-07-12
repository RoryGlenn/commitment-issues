// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_ESCAPE, "");
}

export function countTerminalBoxes(value) {
  return (stripAnsi(value).match(/^╭/gmu) || []).length;
}
