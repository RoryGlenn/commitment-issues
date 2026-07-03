import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  addBareRemote,
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readHeadFile,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runCommitFix(tempDir, options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "commit-fix.mjs")],
    tempDir,
    options,
  );
}

test("refuses to amend when tracked worktree changes exist", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "README.md"), "dirty\n");

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Cannot safely amend the latest commit\./);
});

test("shows info when the latest commit has no fixable files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "notes.txt"), "hello\n");
  run("git", ["add", "notes.txt"], tempDir);
  run("git", ["commit", "-m", "notes"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /No fixable files in the latest commit\./);
});

test("amends the latest commit when all fixes are automatic", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "amend.json"), '{"alpha":1}\n');
  run("git", ["add", "src/amend.json"], tempDir);
  run("git", ["commit", "-m", "amend"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Latest commit amended with automatic fixes\./);
  assert.equal(readHeadFile(tempDir, "src/amend.json"), '{ "alpha": 1 }\n');
});

test("amends the latest commit and warns when lint issues remain", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "warn.js"), "const value=1\n");
  run("git", ["add", "src/warn.js"], tempDir);
  run("git", ["commit", "-m", "warn"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Latest commit amended with available fixes\./);
  assert.equal(readHeadFile(tempDir, "src/warn.js"), "const value = 1;\n");
});

test("errors when there is no commit to inspect", (t) => {
  const tempDir = createTempRepo({ commit: false });
  t.after(() => cleanupTempRepo(tempDir));

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect the latest commit\./);
});

test("refuses to amend a commit that has already been pushed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  addBareRemote(tempDir); // HEAD now exists on origin/main

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /already been pushed/);
});

test("reports the latest commit is already clean when nothing changes", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "clean.js"), "export const x = 1;\n");
  run("git", ["add", "src/clean.js"], tempDir);
  run("git", ["commit", "-m", "clean"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Latest commit already clean\./);
});

test("errors when the working tree cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Fail the unstaged `git diff --name-only` probe; earlier calls succeed.
  const env = fakeGitEnv(tempDir, "diff --name-only");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect the current working tree\./);
});

test("errors when the latest commit's files cannot be listed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const env = fakeGitEnv(tempDir, "diff-tree");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect files from the latest commit\./);
});

test("errors when fixed files cannot be staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "amend.json"), '{"alpha":1}\n');
  run("git", ["add", "src/amend.json"], tempDir);
  run("git", ["commit", "-m", "amend"], tempDir);

  // Fixers run, then `git add -- <files>` fails.
  const env = fakeGitEnv(tempDir, "add --");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /files could not be staged/);
});

test("errors when staged fixes cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "amend.json"), '{"alpha":1}\n');
  run("git", ["add", "src/amend.json"], tempDir);
  run("git", ["commit", "-m", "amend"], tempDir);

  // `git add` succeeds, but the follow-up `git diff --cached ... --` fails.
  const env = fakeGitEnv(tempDir, "--cached --name-only --");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to inspect staged fixes/);
});

test("warns when a format-only file cannot be fixed automatically", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Malformed JSON: Prettier fails to parse it, so no automatic fix lands.
  writeFile(path.join(tempDir, "src", "bad.json"), '{"a":}\n');
  run("git", ["add", "src/bad.json"], tempDir);
  run("git", ["commit", "-m", "bad json"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Manual attention still needed\./);
});

test("errors when the amend itself fails", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A fixable file so fixers change it and the flow reaches the amend step.
  writeFile(path.join(tempDir, "src", "amend.json"), '{"alpha":1}\n');
  run("git", ["add", "src/amend.json"], tempDir);
  run("git", ["commit", "-m", "amend"], tempDir);

  const env = fakeGitEnv(tempDir, "commit --amend");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /could not be amended/);
});

test("already-clean summary pluralizes for multiple files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "a.js"), "export const a = 1;\n");
  writeFile(path.join(tempDir, "src", "b.js"), "export const b = 2;\n");
  run("git", ["add", "src/a.js", "src/b.js"], tempDir);
  run("git", ["commit", "-m", "clean"], tempDir);

  const result = runCommitFix(tempDir);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Checked 2 files from the latest commit/,
  );
});

test("amend summary pluralizes for multiple updated files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "a.json"), '{"a":1}\n');
  writeFile(path.join(tempDir, "src", "b.json"), '{"b":2}\n');
  run("git", ["add", "src/a.json", "src/b.json"], tempDir);
  run("git", ["commit", "-m", "unformatted"], tempDir);

  const result = runCommitFix(tempDir);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Updated 2 files from the latest commit/,
  );
});
