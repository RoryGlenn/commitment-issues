// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES,
  BRANCH_COVERAGE_SOURCE_FILES,
  BRANCH_COVERAGE_TEST_PATTERNS,
  BRANCH_COVERAGE_THRESHOLD,
  coverageBadgeColor,
  deriveBranchCoverageSourceFiles,
  parseBranchCoverageFromNodeTestOutput,
  updateReadmeCoverageBadge,
} from "../scripts/lib/coverage-badge.mjs";

function scriptSources(dir = "scripts") {
  const sources = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sources.push(...scriptSources(file));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      sources.push(file.split(path.sep).join("/"));
    }
  }
  return sources.sort();
}

test("parseBranchCoverageFromNodeTestOutput reads all files branch coverage", () => {
  const output = [
    "info start of coverage report",
    "info ------------------------------------------------------------------------",
    "info all files               |  98.89 |    92.55 |  100.00 |",
    "info ------------------------------------------------------------------------",
    "info end of coverage report",
  ].join("\n");

  assert.equal(parseBranchCoverageFromNodeTestOutput(output), 92.55);
});

test("parseBranchCoverageFromNodeTestOutput returns null for unrecognized output", () => {
  assert.equal(
    parseBranchCoverageFromNodeTestOutput("no coverage table"),
    null,
  );
  assert.equal(parseBranchCoverageFromNodeTestOutput(""), null);
  assert.equal(parseBranchCoverageFromNodeTestOutput(undefined), null);
});

test("parseBranchCoverageFromNodeTestOutput returns null for a malformed percentage", () => {
  assert.equal(
    parseBranchCoverageFromNodeTestOutput("all files | 1.00 | .... | 1.00 |"),
    null,
  );
});

test("updateReadmeCoverageBadge replaces alt text and badge URL percentage", () => {
  const readme =
    "[![Coverage: 93.13%](https://img.shields.io/badge/coverage-93.13%25-brightgreen.svg)](docs/scenario-coverage.md)\n";

  const updated = updateReadmeCoverageBadge(readme, 82.55);
  assert.match(
    updated,
    /^\[!\[Branch coverage: 82\.55%\]\(https:\/\/img\.shields\.io\/badge\/branch%20coverage-82\.55%25-green\.svg\)\]\(docs\/branch-coverage\.md\)$/m,
  );
});

test("coverageBadgeColor derives stable colors from the percentage", () => {
  assert.equal(coverageBadgeColor(100), "brightgreen");
  assert.equal(coverageBadgeColor(90), "brightgreen");
  assert.equal(coverageBadgeColor(89.99), "green");
  assert.equal(coverageBadgeColor(80), "green");
  assert.equal(coverageBadgeColor(70), "yellowgreen");
  assert.equal(coverageBadgeColor(60), "yellow");
  assert.equal(coverageBadgeColor(50), "orange");
  assert.equal(coverageBadgeColor(49.99), "red");
  assert.equal(coverageBadgeColor(0), "red");
  assert.throws(() => coverageBadgeColor(-1), /between 0 and 100/);
  assert.throws(() => coverageBadgeColor(101), /between 0 and 100/);
  assert.throws(() => coverageBadgeColor(Number.NaN), /between 0 and 100/);
});

test("updateReadmeCoverageBadge throws when badge line is missing", () => {
  assert.throws(
    () => updateReadmeCoverageBadge("# no badge here\n", 92.55),
    /Could not find README branch coverage badge line/,
  );
});

test("badge color follows the displayed rounded value", () => {
  const readme =
    "[![Branch coverage: 80.00%](https://img.shields.io/badge/branch%20coverage-80.00%25-green.svg)](docs/branch-coverage.md)\n";
  assert.match(
    updateReadmeCoverageBadge(readme, 89.999),
    /Branch coverage: 90\.00%.*90\.00%25-brightgreen/,
  );
});

test("branch coverage scope partitions every scripts source exactly once", () => {
  const included = new Set(BRANCH_COVERAGE_SOURCE_FILES);
  const excluded = new Set(BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES);
  const overlap = [...included].filter((file) => excluded.has(file));

  const sources = scriptSources();

  assert.deepEqual(overlap, []);
  assert.deepEqual(
    BRANCH_COVERAGE_SOURCE_FILES,
    sources.filter((file) => !excluded.has(file)),
    "every non-maintenance scripts/**/*.mjs file belongs to runtime coverage",
  );
  assert.deepEqual(
    [...excluded].filter((file) => !sources.includes(file)),
    [],
    "every maintenance exclusion must name an existing script",
  );
  assert.deepEqual(
    deriveBranchCoverageSourceFiles([
      ...sources,
      "scripts/future-hook.mjs",
      "scripts/future-hook.mjs",
    ]),
    [...BRANCH_COVERAGE_SOURCE_FILES, "scripts/future-hook.mjs"].sort(),
    "a future runtime script enters the denominator automatically",
  );
  assert.equal(BRANCH_COVERAGE_THRESHOLD, 90);
  assert.deepEqual(BRANCH_COVERAGE_TEST_PATTERNS, [
    "test/*.test.mjs",
    "test/*.test.js",
  ]);
});
