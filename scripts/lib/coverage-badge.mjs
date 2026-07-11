// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

const COVERAGE_ROW_RE =
  /^\s*(?:\S+\s+)?all files\s+\|\s+[0-9.]+\s+\|\s+([0-9.]+)\s+\|\s+[0-9.]+\s+\|/m;

const README_COVERAGE_BADGE_RE =
  /^\[!\[(?:Branch coverage|Coverage): .*%\]\(https:\/\/img\.shields\.io\/badge\/(?:branch%20coverage|coverage)-.*%25-[a-z]+\.svg\)\]\(docs\/(?:branch-coverage|scenario-coverage)\.md\)$/m;

export const BRANCH_COVERAGE_THRESHOLD = 90;

// Public CLI entry points and the runtime helpers they load. The coverage
// runner passes every file explicitly and verifies that every one appears in
// the LCOV report, so an unexecuted source cannot silently leave the metric.
export const BRANCH_COVERAGE_SOURCE_FILES = Object.freeze([
  "scripts/cli.mjs",
  "scripts/commit-fix.mjs",
  "scripts/doctor.mjs",
  "scripts/fix-staged-js.mjs",
  "scripts/fix-staged.mjs",
  "scripts/init.mjs",
  "scripts/lib/checks.mjs",
  "scripts/lib/commit-guards.mjs",
  "scripts/lib/config.mjs",
  "scripts/lib/files.mjs",
  "scripts/lib/hooks.mjs",
  "scripts/lib/logo.mjs",
  "scripts/lib/message.mjs",
  "scripts/lib/package-manager.mjs",
  "scripts/lib/process.mjs",
  "scripts/lib/secret-scan.mjs",
  "scripts/lib/ui.mjs",
  "scripts/precommit.mjs",
  "scripts/prepush.mjs",
  "scripts/uninstall.mjs",
]);

// Repository/package-maintenance automation is validated by its own tests and
// lifecycle gates, but it is not part of the user-facing runtime percentage.
export const BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES = Object.freeze([
  "scripts/ci-lifecycle-smoke.mjs",
  "scripts/lib/coverage-badge.mjs",
  "scripts/lib/lifecycle-managers.mjs",
  "scripts/run-branch-coverage.mjs",
  "scripts/run-lifecycle-test.mjs",
  "scripts/update-readme-coverage-badge.mjs",
]);

export const BRANCH_COVERAGE_TEST_PATTERNS = Object.freeze([
  "test/*.test.mjs",
  "test/*.test.js",
]);

export function parseBranchCoverageFromNodeTestOutput(output) {
  const clean = stripAnsi(output || "");
  const match = clean.match(COVERAGE_ROW_RE);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function coverageBadgeColor(branchCoverage) {
  if (
    !Number.isFinite(branchCoverage) ||
    branchCoverage < 0 ||
    branchCoverage > 100
  ) {
    throw new RangeError("Branch coverage must be between 0 and 100.");
  }
  if (branchCoverage >= 90) {
    return "brightgreen";
  }
  if (branchCoverage >= 80) {
    return "green";
  }
  if (branchCoverage >= 70) {
    return "yellowgreen";
  }
  if (branchCoverage >= 60) {
    return "yellow";
  }
  if (branchCoverage >= 50) {
    return "orange";
  }
  return "red";
}

export function updateReadmeCoverageBadge(readmeContent, branchCoverage) {
  const existing = readmeContent.match(README_COVERAGE_BADGE_RE);
  if (!existing) {
    throw new Error("Could not find README branch coverage badge line.");
  }

  coverageBadgeColor(branchCoverage); // validate before rounding
  const rounded = branchCoverage.toFixed(2);
  const color = coverageBadgeColor(Number(rounded));
  const replacement = `[![Branch coverage: ${rounded}%](https://img.shields.io/badge/branch%20coverage-${rounded}%25-${color}.svg)](docs/branch-coverage.md)`;
  return readmeContent.replace(README_COVERAGE_BADGE_RE, replacement);
}
