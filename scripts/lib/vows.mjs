// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

/**
 * Build the deterministic message model for the opt-in vows Easter egg.
 * @returns {{lines: string[]}} Lines to render in the command's single box.
 */
export function buildVowsMessage() {
  return {
    lines: [
      "💍 The commitment-issues vows",
      "",
      "Warn before blocking.",
      "Fix only with consent.",
      "Keep your code local.",
      "Never rewrite what we cannot prove is safe.",
    ],
  };
}
