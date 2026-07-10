// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Subprocess coverage for the staged-secrets guard. Secret fixtures are
// assembled at runtime and written only into temp repos, never this source.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";

const AWS_KEY = ["AKIA", "ABCDEFGH", "IJKLMNOP"].join("");

function runPrecommit(tempDir, options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "precommit.mjs")],
    tempDir,
    options,
  );
}

function stageSecretFile(tempDir) {
  writeFile(
    path.join(tempDir, "src", "auth.notjs"),
    `const key = "${AWS_KEY}";\n`,
  );
  run("git", ["add", "src/auth.notjs"], tempDir);
}

test("precommit warns about a staged secret by default", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  stageSecretFile(tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /1 possible secret staged/);
  assert.match(output, /src\/auth\.notjs:1 \(AWS access key ID\)/);
  assert.match(output, /rotate anything already exposed/);
});

test("precommit warns about a staged .env file", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, ".env"), "APP_MODE=dev\n");
  run("git", ["add", "-f", ".env"], tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /1 possible secret staged/);
  assert.match(output, /\.env \(\.env file\)/);
});

test("blockOnSecrets refuses the commit and names the finding", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { blockOnSecrets: true });
  stageSecretFile(tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Commit blocked: possible secret staged\./);
  assert.match(output, /src\/auth\.notjs:1 \(AWS access key ID\)/);
  assert.match(output, /git commit --no-verify/);
});

test("scanSecrets: false disables the scan entirely", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { scanSecrets: false, blockOnSecrets: true });
  stageSecretFile(tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /possible secret/);
});

test("secretExempt globs silence fixture paths", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, {
    blockOnSecrets: true,
    secretExempt: ["src/**"],
  });
  stageSecretFile(tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /possible secret/);
});

test("deleting a secret is never flagged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Commit the secret first (bypassing hooks is irrelevant here — the hook
  // script is invoked directly), then stage its removal.
  writeFile(
    path.join(tempDir, "src", "auth.notjs"),
    `const key = "${AWS_KEY}";\n`,
  );
  run("git", ["add", "src/auth.notjs"], tempDir);
  run("git", ["commit", "-m", "add secret"], tempDir);
  run("git", ["rm", "src/auth.notjs"], tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /possible secret/);
});

test("a failing diff probe skips the scan without blocking", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { blockOnSecrets: true });
  stageSecretFile(tempDir);

  const env = fakeGitEnv(tempDir, "diff --cached -U0");
  const result = runPrecommit(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /Commit blocked/);
});

test("secrets keep the fun tone", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { tone: "fun" });
  stageSecretFile(tempDir);

  const result = runPrecommit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /1 possible secret this commit can't keep/);
});
