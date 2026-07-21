// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupMigrationContext,
  createMigrationContext,
  runHuskyMigration,
  runNativeMigration,
} from "./helpers/lifecycle-migration.mjs";

const integrationDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(integrationDir, "..", "..");
const packageManager = process.env.COMMITMENT_ISSUES_MIGRATION_PM ?? "npm";
const suppliedTarball = process.env.COMMITMENT_ISSUES_MIGRATION_TARBALL;

test(
  `${packageManager} upgrades immutable historical releases to the candidate package`,
  { timeout: 20 * 60 * 1000 },
  async (t) => {
    const context = await createMigrationContext({
      root: repoRoot,
      packageManager,
      suppliedTarball,
    });

    try {
      for (const fixture of context.fixtures) {
        await t.test(
          `${fixture.version} ${fixture.kind} migration preserves project-owned behavior`,
          { timeout: 6 * 60 * 1000 },
          () => {
            if (fixture.kind === "husky") {
              runHuskyMigration(context, fixture);
            } else {
              runNativeMigration(context, fixture);
            }
          },
        );
      }
    } finally {
      cleanupMigrationContext(context);
    }
  },
);
