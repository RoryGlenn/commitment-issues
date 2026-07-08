// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  repoRoot,
  run,
} from "./helpers/temp-repo.mjs";

function cli(tempDir, args, options = {}) {
  const { cwd = tempDir, ...runOptions } = options;
  return run(
    "node",
    [path.join(tempDir, "scripts", "cli.mjs"), ...args],
    cwd,
    runOptions,
  );
}

function sourceCli(cwd, args, options = {}) {
  return run(
    "node",
    [path.join(repoRoot, "scripts", "cli.mjs"), ...args],
    cwd,
    options,
  );
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("cli prints usage and exits 0 for --help", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);

  for (const command of [
    "init",
    "doctor",
    "precommit",
    "prepush",
    "commit-fix",
    "fix-staged",
    "fix-staged-js",
  ]) {
    assert.match(result.stdout, new RegExp(`\\b${escapeRegExp(command)}\\b`));
  }
});

test("cli prints the package version for --version and -v", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const expectedVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;

  for (const flag of ["--version", "-v"]) {
    const result = cli(tempDir, [flag]);
    assert.equal(result.status, 0);
    assert.equal(combinedOutput(result).trim(), expectedVersion);
  }
});

test("cli errors on an unknown command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["bogus"]);
  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /unknown command 'bogus'/);
});

test("cli preserves shell-sensitive unknown command tokens", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  for (const token of [
    "has space",
    "quote'file",
    "semi;colon",
    "glob*value",
    String.raw`windows\\path`,
  ]) {
    const result = cli(tempDir, [token]);
    assert.equal(result.status, 1);
    assert.match(combinedOutput(result), new RegExp(escapeRegExp(token)));
  }
});

test("cli dispatches to init", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["init"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /Commitment Issues is set up/);
});

test("cli dispatches to doctor", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["doctor"]);
  assert.equal(result.status, 0);
  assert.match(
    combinedOutput(result),
    /Repaired the git hook wiring|Git hooks are healthy/,
  );
});

test("cli dispatches to precommit", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Nothing is staged in a fresh temp repo, so precommit is a clean no-op.
  const result = cli(tempDir, ["precommit"]);
  assert.equal(result.status, 0);
});

test("cli dispatches to prepush", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["prepush"], {
    env: { ...process.env, COMMITMENT_ISSUES_ASSUME_TTY: "1" },
  });
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /No tests to run before push/);
});

test("cli dispatches to commit-fix", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["commit-fix"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /Latest commit already clean/);
});

test("cli dispatches to fix-staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["fix-staged"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /No staged files to fix/);
});

test("cli dispatches to fix-staged-js", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["fix-staged-js"]);
  assert.equal(result.status, 0);
  assert.equal(combinedOutput(result).trim(), "");
});

test("cli forwards arguments to the subcommand", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  cli(tempDir, ["doctor"]); // establish healthy wiring
  const result = cli(tempDir, ["doctor", "--quiet"]);
  assert.equal(result.status, 0);
  // `--quiet` reached doctor: silent when already healthy.
  assert.equal(combinedOutput(result).trim(), "");
});

test("cli runs from a project subdirectory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const nested = path.join(tempDir, "nested", "deeper");
  fs.mkdirSync(nested, { recursive: true });

  const result = cli(tempDir, ["precommit"], { cwd: nested });
  assert.equal(result.status, 0);
});

test("cli help works outside a git repo and node project", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-cli-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const result = sourceCli(tempDir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);
});

test("cli reports subcommand errors outside a node project", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-cli-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const result = sourceCli(tempDir, ["doctor"]);
  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /No package.json found/);
});

test("cli prints usage to stderr and exits 1 when given no command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commitment-issues <command>/);
});

test("cli treats -h like --help", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["-h"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);
});
