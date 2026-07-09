// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const integrationDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(integrationDir, "..", "..");
const SUPPORTED_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const packageManager = process.env.COMMITMENT_ISSUES_LIFECYCLE_PM ?? "npm";

test(`${packageManager} installs packed package and runs generated lifecycle hooks`, () => {
  assert.ok(
    SUPPORTED_MANAGERS.has(packageManager),
    `unsupported lifecycle package manager: ${packageManager}`,
  );

  const result = spawnSync(
    process.execPath,
    ["scripts/ci-lifecycle-smoke.mjs", packageManager],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  assert.equal(
    result.status,
    0,
    [
      `lifecycle integration failed for ${packageManager}`,
      result.stdout ? `\nstdout:\n${result.stdout}` : "",
      result.stderr ? `\nstderr:\n${result.stderr}` : "",
    ].join(""),
  );
});
