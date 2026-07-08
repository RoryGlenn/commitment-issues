// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectTestsForFiles,
  findTestFile,
  isInTestDir,
  isTestFile,
  normalizeRepoPath,
} from "../scripts/lib/files.mjs";

function useTempProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "path-normalization-"));
  const cwd = process.cwd();

  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  process.chdir(dir);
}

function writeModule(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "export {};\n");
}

test("normalizeRepoPath converts repo paths to Git-style POSIX separators", () => {
  assert.equal(
    normalizeRepoPath("src\\widget.test.mjs"),
    "src/widget.test.mjs",
  );
  assert.equal(
    normalizeRepoPath(".\\src\\nested//widget.test.mjs"),
    "src/nested/widget.test.mjs",
  );
  assert.equal(
    normalizeRepoPath("./src//has space\\unicode-猫.test.mjs"),
    "src/has space/unicode-猫.test.mjs",
  );
});

test("file classifiers accept Windows-style separators", () => {
  assert.equal(isTestFile("src\\widget.test.mjs"), true);
  assert.equal(isInTestDir("src\\__tests__\\widget.test.mjs"), true);
});

test("findTestFile accepts POSIX, Windows, and mixed-separator inputs", (t) => {
  useTempProject(t);
  writeModule("src/widget.mjs");
  writeModule("src/widget.test.mjs");
  writeModule("src/nested/tool.mjs");
  writeModule("src/nested/tool.test.mjs");

  assert.equal(findTestFile("src/widget.mjs"), "src/widget.test.mjs");
  assert.equal(findTestFile("src\\widget.mjs"), "src/widget.test.mjs");
  assert.equal(
    findTestFile("src/nested\\tool.mjs"),
    "src/nested/tool.test.mjs",
  );
});

test("findTestFile preserves spaces and Unicode while returning POSIX paths", (t) => {
  useTempProject(t);
  writeModule("src/has space.mjs");
  writeModule("src/has space.test.mjs");
  writeModule("src/unicode-猫.mjs");
  writeModule("src/unicode-猫.test.mjs");

  assert.equal(findTestFile("src\\has space.mjs"), "src/has space.test.mjs");
  assert.equal(findTestFile("src\\unicode-猫.mjs"), "src/unicode-猫.test.mjs");
});

test("collectTestsForFiles normalizes and dedupes equivalent test paths", (t) => {
  useTempProject(t);
  writeModule("src/widget.mjs");
  writeModule("src/widget.test.mjs");

  assert.deepEqual(
    collectTestsForFiles([
      "src/widget.mjs",
      "src\\widget.test.mjs",
      "src/widget.test.mjs",
    ]),
    ["src/widget.test.mjs"],
  );
});
