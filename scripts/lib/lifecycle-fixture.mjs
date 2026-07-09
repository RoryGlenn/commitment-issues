// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

export const SUPPORTED_LIFECYCLE_MANAGERS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
]);

export function lifecycleTestName(packageManager) {
  return `${packageManager} installs packed package and runs generated lifecycle hooks`;
}

export function runLifecycleIntegration(packageManager = "npm") {
  if (!SUPPORTED_LIFECYCLE_MANAGERS.has(packageManager)) {
    throw new Error(`Unsupported package manager: ${packageManager}`);
  }
}
