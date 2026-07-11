#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES,
  BRANCH_COVERAGE_SOURCE_FILES,
  BRANCH_COVERAGE_TEST_PATTERNS,
  BRANCH_COVERAGE_THRESHOLD,
} from "./lib/coverage-badge.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function topLevelTests() {
  const suffixes = BRANCH_COVERAGE_TEST_PATTERNS.map((pattern) =>
    pattern.replace(/^test\/\*/, ""),
  );
  return fs
    .readdirSync(path.join(root, "test"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        suffixes.some((suffix) => entry.name.endsWith(suffix)),
    )
    .map((entry) => path.join("test", entry.name))
    .sort();
}

function repoPath(source) {
  const absolute = path.isAbsolute(source)
    ? source
    : path.resolve(root, source);
  return path.relative(root, absolute).split(path.sep).join("/");
}

function lcovSources(lcov) {
  return new Set(
    lcov
      .split(/\r?\n/)
      .filter((line) => line.startsWith("SF:"))
      .map((line) => repoPath(line.slice(3))),
  );
}

const reportDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-coverage-"),
);
const lcovPath = path.join(reportDir, "runtime.info");
let exitCode = 1;

try {
  const args = [
    "--test",
    "--experimental-test-coverage",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    `--test-reporter-destination=${lcovPath}`,
    `--test-coverage-branches=${BRANCH_COVERAGE_THRESHOLD}`,
    ...BRANCH_COVERAGE_SOURCE_FILES.map(
      (file) => `--test-coverage-include=${file}`,
    ),
    ...BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES.map(
      (file) => `--test-coverage-exclude=${file}`,
    ),
    ...topLevelTests(),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  } else {
    const covered = lcovSources(fs.readFileSync(lcovPath, "utf8"));
    const intended = new Set(BRANCH_COVERAGE_SOURCE_FILES);
    const missing = BRANCH_COVERAGE_SOURCE_FILES.filter(
      (file) => !covered.has(file),
    );
    const unexpected = [...covered].filter((file) => !intended.has(file));

    if (missing.length > 0 || unexpected.length > 0) {
      console.error("Branch coverage source scope mismatch.");
      if (missing.length > 0) {
        console.error(`Missing from LCOV: ${missing.join(", ")}`);
      }
      if (unexpected.length > 0) {
        console.error(`Unexpected in LCOV: ${unexpected.join(", ")}`);
      }
      exitCode = 1;
    } else {
      exitCode = 0;
    }
  }
} finally {
  fs.rmSync(reportDir, { recursive: true, force: true });
}

process.exit(exitCode);
