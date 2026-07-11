// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

const COVERAGE_ROW_RE =
  /^\s*(?:\S+\s+)?all files\s+\|\s+[0-9.]+\s+\|\s+([0-9.]+)\s+\|\s+[0-9.]+\s+\|/m;

const README_COVERAGE_BADGE_RE =
  /^\[!\[(?:Branch coverage|Coverage): .*%\]\(https:\/\/img\.shields\.io\/badge\/(?:branch%20coverage|coverage)-.*%25-[a-z]+\.svg\)\]\(docs\/(?:branch-coverage|scenario-coverage)\.md\)$/m;

export const BRANCH_COVERAGE_THRESHOLD = 90;

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

function scriptSources(dir = path.join(moduleRoot, "scripts")) {
  const sources = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sources.push(...scriptSources(file));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      sources.push(path.relative(moduleRoot, file).split(path.sep).join("/"));
    }
  }
  return sources;
}

/**
 * Derive the complete public-runtime denominator. New scripts enter coverage
 * automatically unless they are deliberately classified as maintenance-only.
 * @param {string[]} sources - Repository-relative .mjs paths under scripts.
 * @param {string[]} [excluded] - Exact maintenance-only paths.
 * @returns {string[]} Sorted, de-duplicated runtime source paths.
 */
export function deriveBranchCoverageSourceFiles(
  sources,
  excluded = BRANCH_COVERAGE_EXCLUDED_SOURCE_FILES,
) {
  const excludedSet = new Set(excluded);
  return [...new Set(sources)].filter((file) => !excludedSet.has(file)).sort();
}

export const BRANCH_COVERAGE_SOURCE_FILES = Object.freeze(
  deriveBranchCoverageSourceFiles(scriptSources()),
);

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

export function formatCoverageBadgePercentage(branchCoverage) {
  coverageBadgeColor(branchCoverage); // validate before rounding
  return (Math.round(branchCoverage * 10) / 10).toFixed(1);
}

export function updateReadmeCoverageBadge(readmeContent, branchCoverage) {
  const existing = readmeContent.match(README_COVERAGE_BADGE_RE);
  if (!existing) {
    throw new Error("Could not find README branch coverage badge line.");
  }

  const rounded = formatCoverageBadgePercentage(branchCoverage);
  const color = coverageBadgeColor(Number(rounded));
  const replacement = `[![Branch coverage: ${rounded}%](https://img.shields.io/badge/branch%20coverage-${rounded}%25-${color}.svg)](docs/branch-coverage.md)`;
  return readmeContent.replace(README_COVERAGE_BADGE_RE, replacement);
}
