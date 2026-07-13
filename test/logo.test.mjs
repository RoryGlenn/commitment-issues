// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { logoLines } from "../scripts/lib/logo.mjs";
import { stripAnsi } from "./helpers/output.mjs";

const expected = [
  "  ▄██▄   ▄██▄  ",
  " ██████ ██████ ",
  " ▀█████ █████▀   commitment-issues",
  "   ▀███ ███▀     For developers who overthink every commit.",
  "     ▀█ █▀     ",
];

test("logoLines returns the complete branded header as a fresh value", () => {
  const first = logoLines();

  assert.deepEqual(first.map(stripAnsi), expected);
  first[0] = "changed by caller";
  assert.deepEqual(logoLines().map(stripAnsi), expected);
});
