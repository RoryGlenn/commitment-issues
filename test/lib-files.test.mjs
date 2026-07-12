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
  findTestFiles,
  collectTestsForFiles,
  parseLsFilesStage,
  parseNameStatusPaths,
  parseNulPaths,
  removeOwnedPath,
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
    "src/original.mjs",
    "src/copied.mjs",
  ]);
});

test("parseNameStatusPaths rejects malformed output", () => {
  assert.deepEqual(parseNameStatusPaths(""), []);
  assert.equal(parseNameStatusPaths("M"), null);
  assert.equal(parseNameStatusPaths("R100\0src/old.mjs"), null);
  assert.equal(parseNameStatusPaths("\0src/path.mjs"), null);
  assert.equal(parseNameStatusPaths("Q\0src/path.mjs\0"), null);
  assert.equal(parseNameStatusPaths("M\0\0"), null);
});

test("parseNulPaths preserves every legal pathname character", () => {
  const paths = [
    "src/ leading.mjs",
    "src/trailing /file.mjs",
    "src/line\nbreak.mjs",
    "src/tab\tname.mjs",
    "src/unicode-猫.mjs",
  ];

  assert.deepEqual(parseNulPaths(`${paths.join("\0")}\0`), paths);
  assert.deepEqual(parseNulPaths(""), []);
  assert.equal(parseNulPaths("src/unterminated.mjs"), null);
  assert.equal(parseNulPaths("src/a.mjs\0\0"), null);
});

test("parseLsFilesStage separates metadata from tab-bearing paths", () => {
  const output =
    "100644 0123456789abcdef 0\tsrc/tab\tand\nnewline.mjs\0" +
    "100755 fedcba9876543210 2\t leading-and-trailing \0";

  assert.deepEqual(parseLsFilesStage(output), [
    {
      mode: "100644",
      object: "0123456789abcdef",
      stage: 0,
      file: "src/tab\tand\nnewline.mjs",
    },
    {
      mode: "100755",
      object: "fedcba9876543210",
      stage: 2,
      file: " leading-and-trailing ",
    },
  ]);
  assert.equal(parseLsFilesStage("100644 bad\tfile\0"), null);
  assert.equal(parseLsFilesStage("100644 bad\tunterminated"), null);
  assert.equal(parseLsFilesStage("100644 deadbeef 0 file\0"), null);
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

test("removeOwnedPath reports successful and failed cleanup", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owned-path-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "owned.json");
  fs.writeFileSync(file, "{}\n");

  assert.deepEqual(removeOwnedPath(file, "owned config"), {
    removed: ["owned config"],
    manualCleanup: [],
  });
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(
    removeOwnedPath(file, "owned config", () => {
      throw new Error("permission denied");
    }),
    {
      removed: [],
      manualCleanup: ["Could not remove owned config."],
    },
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
  fs.mkdirSync("test/src", { recursive: true });
  fs.writeFileSync("src/mirrored.mjs", "export const m = 1;\n");
  fs.writeFileSync("test/src/mirrored.test.mjs", "export {};\n");

  assert.equal(findTestFile("src/widget.mjs"), "src/widget.test.mjs");
  assert.deepEqual(findTestFiles("src/mirrored.mjs"), [
    "test/src/mirrored.test.mjs",
  ]);
  assert.equal(findTestFile("src/missing.mjs"), null);
  assert.deepEqual(findTestFiles("/absolute-orphan.mjs"), []);

  assert.deepEqual(collectTestsForFiles(["src/widget.mjs"]), [
    "src/widget.test.mjs",
  ]);
  assert.deepEqual(collectTestsForFiles(["src/widget.test.mjs"]), [
    "src/widget.test.mjs",
  ]);
  assert.deepEqual(collectTestsForFiles(["src/missing.mjs", "a.png"]), []);
});

test("related-test lookup stays inside the nearest monorepo package", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-monorepo-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.chdir(dir);

  fs.writeFileSync("package.json", '{"workspaces":["packages/*"]}\n');
  for (const workspace of ["a", "b", "c"]) {
    fs.mkdirSync(`packages/${workspace}/src`, { recursive: true });
    fs.writeFileSync(`packages/${workspace}/package.json`, "{}\n");
    fs.writeFileSync(
      `packages/${workspace}/src/index.mjs`,
      `export const workspace = "${workspace}";\n`,
    );
  }
  fs.mkdirSync("test", { recursive: true });
  fs.writeFileSync("test/index.test.mjs", "export {};\n");
  fs.mkdirSync("packages/a/test", { recursive: true });
  fs.writeFileSync("packages/a/test/index.test.mjs", "export {};\n");
  fs.writeFileSync("packages/a/test/index.spec.mjs", "export {};\n");
  fs.mkdirSync("packages/b/tests", { recursive: true });
  fs.writeFileSync("packages/b/tests/index.test.mjs", "export {};\n");

  assert.deepEqual(findTestFiles("packages/a/src/index.mjs"), [
    "packages/a/test/index.test.mjs",
    "packages/a/test/index.spec.mjs",
  ]);
  fs.rmSync("packages/a/package.json");
  assert.deepEqual(findTestFiles("packages/a/src/index.mjs"), [
    "packages/a/test/index.test.mjs",
    "packages/a/test/index.spec.mjs",
  ]);
  assert.deepEqual(collectTestsForFiles(["packages/b/src/index.mjs"]), [
    "packages/b/tests/index.test.mjs",
  ]);
  assert.equal(findTestFile("packages/c/src/index.mjs"), null);
  assert.deepEqual(collectTestsForFiles(["packages/c/src/index.mjs"]), []);
});

test("deleted package discovery supports object-form workspace declarations", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "files-workspaces-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.chdir(dir);

  fs.writeFileSync(
    "package.json",
    JSON.stringify({ workspaces: { packages: ["packages/*"] } }),
  );
  fs.mkdirSync("packages/app/test", { recursive: true });
  fs.writeFileSync("packages/app/test/widget.test.mjs", "export {};\n");

  assert.deepEqual(findTestFiles("packages/app/src/widget.mjs"), [
    "packages/app/test/widget.test.mjs",
  ]);
});
