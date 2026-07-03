import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readFile,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runFixStaged(tempDir, options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "fix-staged.mjs")],
    tempDir,
    options,
  );
}

test("shows info box when there are no staged fixable files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /No staged files to fix\./);
});

test("refuses to fix partially staged files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "partial.js"), 'console.log("x")\n');
  run("git", ["add", "src/partial.js"], tempDir);
  writeFile(
    path.join(tempDir, "src", "partial.js"),
    'console.log("x")\nconsole.log("y")\n',
  );

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Cannot safely fix partially staged files\./);
});

test("applies staged fixes successfully when all issues are auto-fixable", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "success.js"), 'console.log("x")\n');
  run("git", ["add", "src/success.js"], tempDir);

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Staged fixes applied\./);
  assert.equal(readFile(tempDir, "src/success.js"), 'console.log("x");\n');
});

test("returns warning when fixes apply but lint issues remain", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "warn.js"), "const value=1\n");
  run("git", ["add", "src/warn.js"], tempDir);

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Manual attention still needed\./);
  assert.equal(readFile(tempDir, "src/warn.js"), "const value = 1;\n");
});

test("errors when staged files cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const env = fakeGitEnv(tempDir, "--diff-filter=ACMRT");
  const result = runFixStaged(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect staged files\./);
});

test("errors when unstaged files cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "s.js"), 'console.log("x")\n');
  run("git", ["add", "src/s.js"], tempDir);

  // The staged probe succeeds; the later unstaged `git diff --name-only` fails.
  const env = fakeGitEnv(tempDir, "diff --name-only");
  const result = runFixStaged(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect unstaged files\./);
});

test("tolerates an unreadable index snapshot and still reports clean", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Already-clean file so lint-staged makes no changes and exits 0.
  writeFile(path.join(tempDir, "src", "clean.js"), 'console.log("x");\n');
  run("git", ["add", "src/clean.js"], tempDir);

  // `git ls-files --stage` fails, so the before/after index snapshots are null.
  const env = fakeGitEnv(tempDir, "ls-files --stage --");
  const result = runFixStaged(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /already clean/i);
});

test("refuses to fix a staged file missing from the working tree", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A staged symlink whose target does not exist: fs.existsSync() is false, yet
  // `git diff` sees the symlink entry itself as unchanged, so it is not counted
  // as "partially staged" — exercising the missing-working-tree guard.
  fs.symlinkSync("does-not-exist", path.join(tempDir, "src", "link.js"));
  run("git", ["add", "src/link.js"], tempDir);

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /missing from the working tree/);
});
