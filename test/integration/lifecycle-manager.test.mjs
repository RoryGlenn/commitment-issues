// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatLifecycleManagers,
  isSupportedLifecycleManager,
} from "../../scripts/lib/lifecycle-managers.mjs";

const integrationDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(integrationDir, "..", "..");
const packageManager = process.env.COMMITMENT_ISSUES_LIFECYCLE_PM ?? "npm";
const tarball = process.env.COMMITMENT_ISSUES_LIFECYCLE_TARBALL;

test(`${packageManager} runs packed lifecycle hooks across workspaces and worktrees`, () => {
  assert.ok(
    isSupportedLifecycleManager(packageManager),
    `unsupported lifecycle package manager: ${packageManager}; expected ${formatLifecycleManagers()}`,
  );

  const smokeArgs = ["scripts/ci-lifecycle-smoke.mjs", packageManager];
  if (tarball) {
    smokeArgs.push("--tarball", tarball);
  }
  const smokeEnv = { ...process.env };
  delete smokeEnv.COMMITMENT_ISSUES_LIFECYCLE_TARBALL;

  const result = spawnSync(process.execPath, smokeArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: smokeEnv,
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(
    result.status,
    0,
    `lifecycle integration failed for ${packageManager}`,
  );
});
