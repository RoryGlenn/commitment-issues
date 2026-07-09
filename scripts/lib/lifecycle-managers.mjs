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
