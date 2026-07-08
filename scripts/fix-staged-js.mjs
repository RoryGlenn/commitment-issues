// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { runTool } from "./lib/process.mjs";

const files = process.argv.slice(2).filter(Boolean);

if (files.length === 0) {
  process.exit(0);
}

let hasRemainingIssues = false;

const eslintResult = runTool(
  "eslint",
  ["--cache", "--cache-strategy", "content", "--fix", "--", ...files],
  { stdio: "inherit" },
);

if (eslintResult.error || (eslintResult.status || 0) !== 0) {
  hasRemainingIssues = true;
}

const prettierResult = runTool(
  "prettier",
  [
    "--cache",
    "--cache-location",
    ".prettiercache",
    "--cache-strategy",
    "content",
    "--write",
    "--ignore-unknown",
    "--",
    ...files,
  ],
  { stdio: "inherit" },
);

if (prettierResult.error || (prettierResult.status || 0) !== 0) {
  hasRemainingIssues = true;
}

if (hasRemainingIssues) {
  process.exit(1);
}

process.exit(0);
