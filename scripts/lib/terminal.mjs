// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { stripVTControlCharacters } from "node:util";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/gu;
const SGR_SEQUENCE = /\u001b\[[0-9;]*m/gu;
const NAMED_CONTROLS = new Map([
  ["\t", "\\t"],
  ["\n", "\\n"],
  ["\r", "\\r"],
]);

/**
 * Render untrusted text as one visible terminal line. Complete VT sequences
 * are removed, while remaining C0/C1 controls become unambiguous text.
 * Callers preserve intentional layout by passing separate message-model lines.
 * @param {unknown} value - Repository, configuration, process, or argv value.
 * @returns {string} Terminal-safe visible text.
 */
export function escapeTerminalText(value) {
  const plain = stripVTControlCharacters(String(value ?? ""));
  return plain.replace(CONTROL_CHARACTER, (character) => {
    const named = NAMED_CONTROLS.get(character);
    return (
      named ?? `\\x${character.codePointAt(0).toString(16).padStart(2, "0")}`
    );
  });
}

/**
 * Escape an already assembled product-owned presentation line while retaining
 * only SGR sequences emitted by the product's color helpers. Untrusted values
 * must pass through escapeTerminalText before styling; this final boundary
 * strips every other CSI/OSC sequence and escapes any remaining controls.
 * @param {unknown} value - One styled product message-model line.
 * @returns {string} Terminal-safe styled text.
 */
export function escapeStyledTerminalText(value) {
  const input = String(value ?? "");
  let output = "";
  let offset = 0;

  for (const match of input.matchAll(SGR_SEQUENCE)) {
    output += escapeTerminalText(input.slice(offset, match.index));
    output += match[0];
    offset = match.index + match[0].length;
  }

  return output + escapeTerminalText(input.slice(offset));
}
