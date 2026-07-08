#!/usr/bin/env node
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

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

if (result.error) {
  throw result.error;
}

if ((result.status || 0) !== 0) {
  process.exit(result.status || 1);
}

const branchCoverage = parseBranchCoverageFromNodeTestOutput(
  `${result.stdout || ""}\n${result.stderr || ""}`,
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
