// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES,
  BRANCH_COVERAGE_SOURCE_FILES,
  BRANCH_COVERAGE_TEST_PATTERNS,
  RUNTIME_COVERAGE_THRESHOLD,
} from "../scripts/lib/coverage-badge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "scripts", "run-branch-coverage.mjs");

function scopeList(title, values) {
  return [
    `${title} (${values.length}):`,
    ...[...values].sort().map((value) => `  ${value}`),
  ];
}

function expectedScopeOutput() {
  return [
    "Runtime coverage scope",
    "",
    ...scopeList("Measured runtime source files", BRANCH_COVERAGE_SOURCE_FILES),
    "",
    ...scopeList(
      "Explicitly excluded maintenance source files",
      BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES,
    ),
    "",
    ...scopeList("Test file patterns", BRANCH_COVERAGE_TEST_PATTERNS),
    "",
    "Required coverage threshold:",
    `  lines: ${RUNTIME_COVERAGE_THRESHOLD}%`,
    `  branches: ${RUNTIME_COVERAGE_THRESHOLD}%`,
    `  functions: ${RUNTIME_COVERAGE_THRESHOLD}%`,
    "",
  ].join("\n");
}

function readOnlyEnvironment(t) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-scope-test-"),
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const tempFile = path.join(tempDir, "not-a-directory");
  fs.writeFileSync(tempFile, "coverage scope must not write here\n");
  return {
    ...process.env,
    TMPDIR: tempFile,
    TMP: tempFile,
    TEMP: tempFile,
  };
}

function runScope(args, env) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

test("coverage scope reports the exact sorted coverage constants", (t) => {
  const env = readOnlyEnvironment(t);
  const first = runScope(["--scope"], env);
  const second = runScope(["--scope"], env);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, expectedScopeOutput());
  assert.doesNotMatch(
    first.stdout,
    /\\/u,
    "reported paths and patterns must use forward slashes",
  );
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
});

test("coverage scope is exposed as a read-only npm command", (t) => {
  const env = readOnlyEnvironment(t);
  const before = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const pkg = JSON.parse(before);
  const result = runScope(["--scope"], env);

  assert.equal(
    pkg.scripts["coverage:scope"],
    "node scripts/run-branch-coverage.mjs --scope",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
    before,
  );
});

test("coverage runner rejects unknown options before creating a report", (t) => {
  const env = readOnlyEnvironment(t);
  const result = runScope(["--unknown"], env);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unknown option: --unknown/u);
  assert.match(
    result.stderr,
    /Usage: node scripts\/run-branch-coverage\.mjs \[--scope\]/u,
  );
  assert.doesNotMatch(result.stderr, /ENOTDIR|coverage report/u);
});
