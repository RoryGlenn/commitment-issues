// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_ESCAPE, "");
}

export function countTerminalBoxes(value) {
  return (stripAnsi(value).match(/^╭/gmu) || []).length;
}

// Rejoin boxen-wrapped body lines so assertions can inspect a logical value
// independently of terminal width and ANSI styling.
export function compactTerminalBoxText(value) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("│") && line.endsWith("│"))
    .map((line) => line.slice(1, -1).trim())
    .join("");
}
