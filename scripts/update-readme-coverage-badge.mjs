#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { run } from "./lib/process.mjs";
import {
  parseBranchCoverageFromNodeTestOutput,
  updateReadmeCoverageBadge,
} from "./lib/coverage-badge.mjs";

const root = process.cwd();
const readmePath = path.join(root, "README.md");

const result = run("npm", ["run", "test:coverage"], { cwd: root });

// stdout/stderr are null when the spawn itself failed or was signal-killed.
const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
process.stdout.write(stdout);
process.stderr.write(stderr);

if (result.error) {
  throw result.error;
}

// A signal-killed run reports status null — treat it as a failure (exit 1),
// never as a successful run with unparseable output.
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const branchCoverage = parseBranchCoverageFromNodeTestOutput(
  `${stdout}\n${stderr}`,
);

if (branchCoverage === null) {
  throw new Error("Could not parse branch coverage from test output.");
}

const currentReadme = fs.readFileSync(readmePath, "utf8");
const updatedReadme = updateReadmeCoverageBadge(currentReadme, branchCoverage);

if (updatedReadme === currentReadme) {
  console.log(
    `README coverage badge already up to date (${branchCoverage.toFixed(2)}%).`,
  );
  process.exit(0);
}

fs.writeFileSync(readmePath, updatedReadme);
console.log(`Updated README coverage badge to ${branchCoverage.toFixed(2)}%.`);
