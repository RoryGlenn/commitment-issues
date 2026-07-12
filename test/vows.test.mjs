// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { buildVowsMessage } from "../scripts/lib/vows.mjs";

test("buildVowsMessage returns a fresh deterministic message model", () => {
  const expected = {
    lines: [
      "💍 The commitment-issues vows",
      "",
      "Warn before blocking.",
      "Fix only with consent.",
      "Keep your code local.",
      "Never rewrite what we cannot prove is safe.",
    ],
  };

  const first = buildVowsMessage();
  assert.deepEqual(first, expected);
  first.lines[0] = "changed by caller";
  assert.deepEqual(buildVowsMessage(), expected);
});
