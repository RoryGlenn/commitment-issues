function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

const COVERAGE_ROW_RE =
  /^\s*(?:\S+\s+)?all files\s+\|\s+[0-9.]+\s+\|\s+([0-9.]+)\s+\|\s+[0-9.]+\s+\|/m;

const README_COVERAGE_BADGE_RE =
  /^\[!\[Coverage: .*%\]\(https:\/\/img\.shields\.io\/badge\/coverage-.*%25-([a-z]+)\.svg\)\]\(docs\/scenario-coverage\.md\)$/m;

export function parseBranchCoverageFromNodeTestOutput(output) {
  const clean = stripAnsi(output || "");
  const match = clean.match(COVERAGE_ROW_RE);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function updateReadmeCoverageBadge(readmeContent, branchCoverage) {
  const existing = readmeContent.match(README_COVERAGE_BADGE_RE);
  if (!existing) {
    throw new Error("Could not find README coverage badge line.");
  }

  const color = existing[1];
  const rounded = branchCoverage.toFixed(2);
  const replacement = `[![Coverage: ${rounded}%](https://img.shields.io/badge/coverage-${rounded}%25-${color}.svg)](docs/scenario-coverage.md)`;
  return readmeContent.replace(README_COVERAGE_BADGE_RE, replacement);
}
