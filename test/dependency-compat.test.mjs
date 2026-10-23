// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expand = require("brace-expansion");
const minimatch = require("minimatch");

test("upstream brace-expansion preserves the legacy callable export", () => {
  assert.equal(require("brace-expansion/package.json").version, "1.1.21");
  assert.equal(typeof expand, "function");
  assert.deepEqual(expand("file-{1..3}.mjs"), [
    "file-1.mjs",
    "file-2.mjs",
    "file-3.mjs",
  ]);
});

test("legacy brace expansion preserves literal parameter expressions", () => {
  assert.deepEqual(expand("${name}{a,b}"), ["${name}{a,b}"]);
  assert.equal(minimatch("${name}{a,b}", "${name}{a,b}"), true);
  assert.equal(minimatch("${name}a", "${name}{a,b}"), false);
});

test("legacy minimatch consumers retain brace-pattern behavior", () => {
  assert.equal(minimatch("scripts/cli.mjs", "{scripts,test}/**/*.mjs"), true);
  assert.equal(minimatch("test/cli.test.mjs", "{scripts,test}/**/*.mjs"), true);
  assert.equal(minimatch("README.md", "{scripts,test}/**/*.mjs"), false);
});
