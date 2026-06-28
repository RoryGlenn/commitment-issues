import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runHook(tempDir) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "precommit-unified.mjs")],
    tempDir,
  );
}

test("shows commit:fix for fully auto-fixable warnings", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "format-only.json"), '{"alpha":1}\n');
  run("git", ["add", "src/format-only.json"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /npm run commit:fix/);
  assert.doesNotMatch(
    output,
    /Manual warnings above will still need your attention\./,
  );
});

test("shows commit:fix and manual warning note for mixed safe warnings", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "mixed.js"), "const value=1\n");
  run("git", ["add", "src/mixed.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /npm run commit:fix/);
  assert.match(
    output,
    /Manual warnings above will still need your attention\./,
  );
});

test("suppresses commit:fix when tracked worktree changes would block amend", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "README.md"), "dirty\n");
  writeFile(path.join(tempDir, "src", "format-only.json"), '{"alpha":1}\n');
  run("git", ["add", "src/format-only.json"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /npm run commit:fix/);
  assert.match(
    output,
    /Other tracked changes will still be present after commit/,
  );
});

test("labels non-fixable ESLint issues as manual and omits commit:fix", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Prettier-clean file whose only problem is an unfixable no-unused-vars error.
  writeFile(
    path.join(tempDir, "src", "manual.js"),
    "const unusedValue = 123;\n",
  );
  run("git", ["add", "src/manual.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /ESLint issue needing manual fixes/);
  assert.doesNotMatch(output, /npm run commit:fix/);
});

test("does not flag files that live inside a test directory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "test", "helpers", "util.mjs"),
    "export const u = 1;\n",
  );
  run("git", ["add", "test/helpers/util.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("does not flag source files that have a matching test in test/", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "src", "widget.mjs"),
    "export const widget = () => 1;\n",
  );
  writeFile(path.join(tempDir, "test", "widget.test.mjs"), "export {};\n");
  run("git", ["add", "src/widget.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});
