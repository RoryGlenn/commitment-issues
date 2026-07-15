// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

export const SUPPORTED_LIFECYCLE_MANAGERS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
]);

export function formatLifecycleManagers() {
  return [...SUPPORTED_LIFECYCLE_MANAGERS].join(", ");
}

export function hasExactOutputLine(output, expected) {
  return String(output ?? "")
    .split(/\r?\n/u)
    .some((line) => line.trim() === expected);
}

export function shouldEnforcePosixPackageModes(platform = process.platform) {
  return platform !== "win32";
}
