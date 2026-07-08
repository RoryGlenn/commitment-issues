import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBranchCoverageFromNodeTestOutput,
  updateReadmeCoverageBadge,
} from "../scripts/lib/coverage-badge.mjs";

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

test("updateReadmeCoverageBadge replaces alt text and badge URL percentage", () => {
  const readme =
    "[![Coverage: 93.13%](https://img.shields.io/badge/coverage-93.13%25-brightgreen.svg)](docs/scenario-coverage.md)\n";

  const updated = updateReadmeCoverageBadge(readme, 92.55);
  assert.match(
    updated,
    /^\[!\[Coverage: 92\.55%\]\(https:\/\/img\.shields\.io\/badge\/coverage-92\.55%25-brightgreen\.svg\)\]\(docs\/scenario-coverage\.md\)$/m,
  );
});

test("updateReadmeCoverageBadge throws when badge line is missing", () => {
  assert.throws(
    () => updateReadmeCoverageBadge("# no badge here\n", 92.55),
    /Could not find README coverage badge line/,
  );
});
