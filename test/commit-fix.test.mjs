// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  addBareRemote,
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readHeadFile,
  run,
  setPrecommitConfig,
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

test("refuses to amend when the pushed check cannot run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Fail only `git branch -r --contains HEAD`; the command must fail closed
  // rather than assume the commit is unpushed.
  const env = fakeGitEnv(tempDir, "branch -r --contains");
  const result = runCommitFix(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unable to verify the latest commit is unpushed\./);
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

test("commit-fix timeout cleans up fixer descendants", async (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { timeoutMs: 1500 });
  writeFile(path.join(tempDir, "src", "slow.js"), "export const slow = 1;\n");

  // Replace the shared dependency link with local fixture packages. The fake
  // ESLint starts a heartbeat grandchild and hangs; Prettier exits cleanly so
  // the timeout path remains isolated to one tool.
  fs.unlinkSync(path.join(tempDir, "node_modules"));
  const heartbeat = path.join(tempDir, "fixer-heartbeat");
  const parentPidFile = path.join(tempDir, "fixer-parent-pid");
  const childPidFile = path.join(tempDir, "fixer-child-pid");
  const worker = [
    'const fs = require("node:fs");',
    "let beat = 0;",
    "fs.writeFileSync(process.env.FIXER_CHILD_PID, String(process.pid));",
    "fs.writeFileSync(process.env.FIXER_HEARTBEAT, String(beat));",
    "setInterval(() => fs.writeFileSync(process.env.FIXER_HEARTBEAT, String(++beat)), 40);",
  ].join("\n");
  writeFile(
    path.join(tempDir, "node_modules", "eslint", "package.json"),
    `${JSON.stringify({ name: "eslint", bin: "bin/eslint.mjs" })}\n`,
  );
  writeFile(
    path.join(tempDir, "node_modules", "eslint", "bin", "eslint.mjs"),
    [
      'import fs from "node:fs";',
      'import { spawn } from "node:child_process";',
      "process.stdout.destroy();",
      "process.stderr.destroy();",
      "fs.writeFileSync(process.env.FIXER_PARENT_PID, String(process.pid));",
      `spawn(process.execPath, ["-e", ${JSON.stringify(worker)}], { stdio: "ignore" });`,
      "setInterval(() => {}, 1000);",
    ].join("\n"),
  );
  writeFile(
    path.join(tempDir, "node_modules", "prettier", "package.json"),
    `${JSON.stringify({ name: "prettier", bin: "bin/prettier.mjs" })}\n`,
  );
  writeFile(
    path.join(tempDir, "node_modules", "prettier", "bin", "prettier.mjs"),
    "process.exit(0);\n",
  );
  // The fixture repo tracks its original node_modules symlink. Remove that
  // link from the index in this commit; the replacement directory stays
  // ignored, leaving commit-fix a clean worktree to inspect.
  run("git", ["rm", "--cached", "--force", "node_modules"], tempDir);
  run("git", ["add", "src/slow.js", "package.json"], tempDir);
  run("git", ["commit", "-m", "slow fixer"], tempDir);

  const env = {
    ...process.env,
    FIXER_HEARTBEAT: heartbeat,
    FIXER_PARENT_PID: parentPidFile,
    FIXER_CHILD_PID: childPidFile,
  };
  let heartbeatContinued = false;
  let cleanupNeeded = true;
  try {
    const result = runCommitFix(tempDir, { env });
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /Manual attention/);
    assert.equal(fs.existsSync(childPidFile), true, "grandchild should start");

    const beatAtTimeout = fs.readFileSync(heartbeat, "utf8");
    await delay(300);
    const beatAfterTimeout = fs.readFileSync(heartbeat, "utf8");
    heartbeatContinued = beatAfterTimeout !== beatAtTimeout;
    cleanupNeeded = heartbeatContinued;
  } finally {
    for (const pidFile of cleanupNeeded ? [parentPidFile, childPidFile] : []) {
      if (!fs.existsSync(pidFile)) {
        continue;
      }
      try {
        process.kill(Number(fs.readFileSync(pidFile, "utf8")), "SIGKILL");
      } catch {
        // Expected after successful process-tree cleanup.
      }
    }
  }

  assert.equal(heartbeatContinued, false, "fixer grandchild survived timeout");
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

test("guides the user when the fixes would empty the commit", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Base commit with a clean file, then a commit whose ONLY change is a
  // formatting issue (a trailing space) that Prettier reverts — so amending
  // after the fix would leave an empty commit.
  writeFile(path.join(tempDir, "src", "ws.js"), "export const x = 1;\n");
  run("git", ["add", "src/ws.js"], tempDir);
  run("git", ["commit", "-m", "base"], tempDir);
  writeFile(path.join(tempDir, "src", "ws.js"), "export const x = 1; \n");
  run("git", ["add", "src/ws.js"], tempDir);
  run("git", ["commit", "-m", "whitespace only"], tempDir);

  const result = runCommitFix(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /emptied the latest commit/);
  assert.match(output, /git reset --soft HEAD\^/);
});
