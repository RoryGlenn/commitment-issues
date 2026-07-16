// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeStyledTerminalText,
  escapeTerminalText,
} from "../scripts/lib/terminal.mjs";

test("escapeTerminalText preserves ordinary Unicode and punctuation", () => {
  assert.equal(
    escapeTerminalText("spaces 猫 café — punctuation!"),
    "spaces 猫 café — punctuation!",
  );
  assert.equal(escapeTerminalText(null), "");
});

test("escapeTerminalText names line controls and hex-escapes other controls", () => {
  assert.equal(
    escapeTerminalText("a\r\n\tb\b\0\x7f\x85"),
    "a\\r\\n\\tb\\x08\\x00\\x7f\\x85",
  );
});

test("escapeTerminalText strips complete CSI and OSC sequences", () => {
  assert.equal(
    escapeTerminalText(
      "before\u001b[2Jafter \u001b[31mred\u001b[39m \u001b]8;;https://evil.invalid\u0007link\u001b]8;;\u0007",
    ),
    "beforeafter red link",
  );
});

test("escapeStyledTerminalText keeps product SGR but removes other controls", () => {
  assert.equal(escapeStyledTerminalText(null), "");
  assert.equal(
    escapeStyledTerminalText(
      "\u001b[1mtrusted\u001b[22m\r\u001b[2Juntrusted\u001b]8;;https://evil.invalid\u0007link\u001b]8;;\u0007",
    ),
    "\u001b[1mtrusted\u001b[22m\\runtrustedlink",
  );
});
