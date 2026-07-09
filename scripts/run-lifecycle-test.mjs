#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import {
  formatLifecycleManagers,
  SUPPORTED_LIFECYCLE_MANAGERS,
} from "./lib/lifecycle-managers.mjs";

const packageManager = process.argv[2] || "npm";

if (!SUPPORTED_LIFECYCLE_MANAGERS.has(packageManager)) {
  console.error(
    `Unsupported package manager "${packageManager}" (expected: ${formatLifecycleManagers()}).`,
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "test/integration/lifecycle-manager.test.mjs"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      COMMITMENT_ISSUES_LIFECYCLE_PM: packageManager,
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
