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
  findTestFile,
  collectTestsForFiles,
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
  assert.equal(shortFileList(["a", "b", "c", "d"]), "a, b, c (+1 more)");
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
