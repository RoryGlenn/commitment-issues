// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLifecycleManagers,
  isSupportedLifecycleManager,
} from "../../scripts/lib/lifecycle-managers.mjs";
import { createLifecycleIntegration } from "./helpers/lifecycle-fixture.mjs";

const packageManager = process.env.COMMITMENT_ISSUES_LIFECYCLE_PM ?? "npm";

async function runPhase(t, phase) {
  let phaseError;
  await t.test(phase.name, async () => {
    try {
      await phase.run();
    } catch (error) {
      phaseError = error;
      throw error;
    }
  });
  return phaseError === undefined;
}

test(`${packageManager} runs one stateful packed lifecycle across workspaces and worktrees`, async (t) => {
  assert.ok(
    isSupportedLifecycleManager(packageManager),
    `unsupported lifecycle package manager: ${packageManager}; expected ${formatLifecycleManagers()}`,
  );

  const lifecycle = createLifecycleIntegration();
  t.after(() => lifecycle.cleanup());

  for (const phase of lifecycle.phases) {
    if (!(await runPhase(t, phase))) {
      return;
    }
  }
});
