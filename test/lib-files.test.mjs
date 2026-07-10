// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  globToRegExp,
  isTestExemptFile,
  isTestFile,
  isInTestDir,
  isConfigFile,
  isThirdPartyPath,
  findTestFile,
  collectTestsForFiles,
  parseNameStatusPaths,
  shortFileList,
} from "../scripts/lib/files.mjs";

// These are fast, pure unit tests (no child processes or temp repos).

test("isTestExemptFile recognizes files that don't need a unit test", () => {
  assert.equal(isTestExemptFile("src/foo.test.ts"), true);
  assert.equal(isTestExemptFile("test/helpers/util.mjs"), true);
  assert.equal(isTestExemptFile("eslint.config.js"), true);
  assert.equal(isTestExemptFile(".prettierrc.cjs"), true);
  assert.equal(isTestExemptFile("src/types.d.ts"), true);
  assert.equal(isTestExemptFile("src/Button.stories.tsx"), true);
  assert.equal(isTestExemptFile("src/api.generated.ts"), true);
  assert.equal(isTestExemptFile("src/generated/schema.ts"), true);
});

test("isTestExemptFile still requires tests for ordinary source files", () => {
  assert.equal(isTestExemptFile("src/widget.ts"), false);
  assert.equal(isTestExemptFile("src/lib/math.js"), false);
});

test("isThirdPartyPath spots node_modules segments in any form", () => {
  assert.equal(isThirdPartyPath("node_modules/pkg/index.js"), true);
  assert.equal(isThirdPartyPath("vendor/node_modules/pkg/a.test.js"), true);
  assert.equal(
    isThirdPartyPath("packages\\app\\node_modules\\dep\\b.js"),
    true,
  );
  assert.equal(isThirdPartyPath("src/node_modules.js"), false);
  assert.equal(isThirdPartyPath("src/widget.js"), false);
});

test("collectTestsForFiles never runs vendored node_modules tests", () => {
  assert.deepEqual(
    collectTestsForFiles(["vendor/node_modules/pkg/foo.test.js"]),
    [],
  );
});

test("parseNameStatusPaths preserves deletions and rename relationships", () => {
  const output = [
    "M",
    "src/changed.mjs",
    "D",
    "src/deleted.mjs",
    "R100",
    "src/old name.mjs",
    "src/new\nname.mjs",
    "C100",
    "src/original.mjs",
    "src/copied.mjs",
    "",
  ].join("\0");

  assert.deepEqual(parseNameStatusPaths(output), [
    "src/changed.mjs",
    "src/deleted.mjs",
    "src/old name.mjs",
    "src/new\nname.mjs",
    "src/copied.mjs",
  ]);
});

test("parseNameStatusPaths rejects malformed output", () => {
  assert.deepEqual(parseNameStatusPaths(""), []);
  assert.equal(parseNameStatusPaths("M"), null);
  assert.equal(parseNameStatusPaths("R100\0src/old.mjs"), null);
  assert.equal(parseNameStatusPaths("\0src/path.mjs"), null);
});

test("isTestExemptFile honors package.json testExempt globs", () => {
  // The repo's package.json exempts scripts/lib/**.
  assert.equal(isTestExemptFile("scripts/lib/util.mjs"), true);
});

test("globToRegExp supports *, ** and ?", () => {
  assert.match("src/legacy/old.js", globToRegExp("src/legacy/**"));
  assert.match("Button.stories.tsx", globToRegExp("*.stories.tsx"));
  assert.doesNotMatch(
    "src/ui/Button.stories.tsx",
    globToRegExp("*.stories.tsx"),
  );
  assert.match("src/ui/Button.stories.tsx", globToRegExp("**/*.stories.tsx"));
  assert.match("a/b.ts", globToRegExp("a/?.ts"));
  assert.doesNotMatch("a/bc.ts", globToRegExp("a/?.ts"));
});

test("predicate helpers classify files", () => {
  assert.equal(isTestFile("src/a.test.js"), true);
  assert.equal(isTestFile("src/a.js"), false);
  assert.equal(isInTestDir("src/__tests__/a.js"), true);
  assert.equal(isInTestDir("src/a.js"), false);
  assert.equal(isConfigFile("vite.config.ts"), true);
  assert.equal(isConfigFile(".eslintrc.cjs"), true);
  assert.equal(isConfigFile("src/a.js"), false);
});

test("shortFileList compacts long lists and handles empty input", () => {
  assert.equal(shortFileList([]), "");
  assert.equal(shortFileList(["a", "b"]), "a, b");
  assert.equal(shortFileList(["a", "b", "c", "d"]), "a, b, c, d");
  assert.equal(
    shortFileList(["a", "b", "c", "d", "e", "f"]),
    "a, b, c, d, e (+1 more)",
  );
});

test("findTestFile and collectTestsForFiles locate sibling tests", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.chdir(dir);
  fs.mkdirSync("src", { recursive: true });
  fs.writeFileSync("src/widget.mjs", "export const w = 1;\n");
  fs.writeFileSync("src/widget.test.mjs", "export {};\n");

  assert.equal(findTestFile("src/widget.mjs"), "src/widget.test.mjs");
  assert.equal(findTestFile("src/missing.mjs"), null);

  assert.deepEqual(collectTestsForFiles(["src/widget.mjs"]), [
    "src/widget.test.mjs",
  ]);
  assert.deepEqual(collectTestsForFiles(["src/widget.test.mjs"]), [
    "src/widget.test.mjs",
  ]);
  assert.deepEqual(collectTestsForFiles(["src/missing.mjs", "a.png"]), []);
});
