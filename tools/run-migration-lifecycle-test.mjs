#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMigrationManagers,
  SUPPORTED_MIGRATION_MANAGERS,
} from "../scripts/lib/lifecycle-managers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveTarball(input, cwd) {
  const resolved = path.resolve(cwd, input);
  if (path.extname(resolved) !== ".tgz") {
    throw new Error(`Migration tarball must use the .tgz extension: ${input}`);
  }
  try {
    if (!fs.lstatSync(resolved).isFile()) {
      throw new Error(`Migration tarball is not a regular file: ${input}`);
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return fs.realpathSync.native(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Migration tarball does not exist: ${input}`);
    }
    if (error?.code === "EACCES") {
      throw new Error(`Migration tarball is not readable: ${input}`);
    }
    throw error;
  }
}

export function parseMigrationArgs(argv, cwd = process.cwd()) {
  const args = [...argv];
  const packageManager =
    args[0] && !args[0].startsWith("-") ? args.shift() : "npm";
  let tarball;

  if (!SUPPORTED_MIGRATION_MANAGERS.has(packageManager)) {
    throw new Error(
      `Unsupported package manager "${packageManager}" (expected: ${formatMigrationManagers()}).`,
    );
  }

  while (args.length > 0) {
    const option = args.shift();
    if (option !== "--tarball") {
      throw new Error(`Unknown migration option: ${option}`);
    }
    if (tarball) {
      throw new Error("Migration tarball may be provided only once.");
    }
    const value = args.shift();
    if (!value) {
      throw new Error("--tarball requires a path to a packed .tgz file.");
    }
    tarball = resolveTarball(value, cwd);
  }

  return { packageManager, tarball };
}

export function runMigrationLifecycle(
  { packageManager, tarball },
  { cwd = root, spawn = spawnSync } = {},
) {
  const env = { ...process.env };
  delete env.COMMITMENT_ISSUES;
  delete env.HUSKY;
  delete env.COMMITMENT_ISSUES_MIGRATION_PM;
  delete env.COMMITMENT_ISSUES_MIGRATION_TARBALL;
  env.COMMITMENT_ISSUES_MIGRATION_PM = packageManager;
  if (tarball) {
    env.COMMITMENT_ISSUES_MIGRATION_TARBALL = tarball;
  }

  return spawn(
    process.execPath,
    ["--test", "test/integration/lifecycle-migration.test.mjs"],
    {
      cwd,
      stdio: "inherit",
      env,
    },
  );
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseMigrationArgs(process.argv.slice(2));
    const result = runMigrationLifecycle(options);
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
