// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

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

test("surfaces the detected package manager in command hints", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A pnpm lockfile with no package-manager env (as at hook time) makes the
  // command hints resolve to pnpm instead of the npm default.
  writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");
  const file = path.join(tempDir, "src", "partial.js");
  writeFile(file, "export const value = 1;\n");
  run("git", ["add", "src/partial.js"], tempDir);
  writeFile(file, "export const value = 2;\n");

  const env = { ...process.env };
  delete env.npm_config_user_agent;

  const result = runFixStaged(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Cannot safely fix partially staged files/);
  assert.match(output, /pnpm run fix:staged/);
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

test("handles shell-sensitive staged filenames safely", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const files = [
    "src/has space.js",
    "src/quote'file.js",
    "src/semi;colon.js",
    "src/unicode-猫.js",
    "src/glob[abc].js",
  ];

  for (const file of files) {
    writeFile(
      path.join(tempDir, ...file.split("/")),
      "export const value = 1;\n",
    );
  }
  run("git", ["add", ...files], tempDir);

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  const stagedAfter = run(
    "git",
    ["-c", "core.quotePath=false", "diff", "--cached", "--name-only"],
    tempDir,
  );

  assert.equal(result.status, 0);
  assert.match(output, /Checked 5 staged files/);
  assert.match(output, /src\/has space\.js/);
  assert.match(output, /src\/quote'file\.js/);
  assert.match(output, /src\/semi;colon\.js/);
  assert.match(output, /src\/unicode-猫\.js/);
  assert.match(output, /src\/glob\[abc\]\.js/);
  assert.deepEqual(stagedAfter.stdout.trim().split("\n").sort(), files.sort());
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

test("errors when staged pathname output is malformed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const env = fakeGitEnv(
    tempDir,
    "--name-only -z --diff-filter=ACMRT",
    0,
    "src/unterminated.js",
  );
  const result = runFixStaged(tempDir, { env });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Unable to inspect staged files/,
  );
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

test("errors when automatically fixed files cannot be restaged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "restage.json"), '{"ok":true}\n');
  run("git", ["add", "src/restage.json"], tempDir);

  const result = runFixStaged(tempDir, {
    env: fakeGitEnv(tempDir, "add --"),
  });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Unable to restage fixed files/,
  );
});

test("tolerates an unreadable index snapshot and still reports clean", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Already-clean file so the fixers make no changes and exit 0.
  writeFile(path.join(tempDir, "src", "clean.js"), 'console.log("x");\n');
  run("git", ["add", "src/clean.js"], tempDir);

  // `git ls-files --stage -z` fails, so both index snapshots are null.
  const env = fakeGitEnv(tempDir, "ls-files --stage -z --");
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

test("reports already clean and pluralizes for multiple unchanged files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Two already-clean files: the fixers make no change, so the index snapshot
  // is unchanged (both snapshots non-null and equal).
  writeFile(path.join(tempDir, "src", "a.js"), "export const a = 1;\n");
  writeFile(path.join(tempDir, "src", "b.js"), "export const b = 2;\n");
  run("git", ["add", "src/a.js", "src/b.js"], tempDir);

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Checked 2 staged files/);
});

test("applied-fix summary pluralizes multiple changed files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "a.json"), '{"a":1}\n');
  writeFile(path.join(tempDir, "src", "b.json"), '{"b":2}\n');
  run("git", ["add", "src/a.json", "src/b.json"], tempDir);

  const result = runFixStaged(tempDir);
  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Refreshed the index for 2 staged files/,
  );
});

test(
  "fixes the exact NUL-delimited path containing legal whitespace and Unicode",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    const file = "src/ leading\t猫\ntrailing /data.json";
    writeFile(path.join(tempDir, ...file.split("/")), '{"alpha":1}\n');
    run("git", ["add", "--", file], tempDir);

    const result = runFixStaged(tempDir);
    const staged = run(
      "git",
      ["diff", "--cached", "--name-only", "-z"],
      tempDir,
    );

    assert.equal(result.status, 0);
    assert.equal(readFile(tempDir, file), '{ "alpha": 1 }\n');
    assert.equal(staged.stdout, `${file}\0`);
  },
);

test("reports local install guidance when fixer peer tools are missing", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "src", "missing-tools.js"),
    "export const x=1;\n",
  );
  run("git", ["add", "src/missing-tools.js"], tempDir);
  fs.unlinkSync(path.join(tempDir, "node_modules"));
  fs.mkdirSync(path.join(tempDir, "node_modules"));

  const result = runFixStaged(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Missing local tool\(s\): eslint, prettier/);
  assert.match(output, /npm install -D eslint@\^9 prettier@\^3/);
});
