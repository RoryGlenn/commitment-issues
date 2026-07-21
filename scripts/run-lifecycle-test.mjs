#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  formatLifecycleManagers,
  isSupportedLifecycleManager,
} from "./lib/lifecycle-managers.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveTarball(input) {
  const resolved = path.resolve(process.cwd(), input);
  if (path.extname(resolved) !== ".tgz") {
    fail(`Lifecycle tarball must use the .tgz extension: ${input}`);
  }
  try {
    if (!fs.lstatSync(resolved).isFile()) {
      fail(`Lifecycle tarball is not a regular file: ${input}`);
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return fs.realpathSync.native(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Lifecycle tarball does not exist: ${input}`);
    }
    if (error?.code === "EACCES") {
      fail(`Lifecycle tarball is not readable: ${input}`);
    }
    throw error;
  }
}

const args = process.argv.slice(2);
const packageManager =
  args[0] && !args[0].startsWith("-") ? args.shift() : "npm";
let tarball;

while (args.length > 0) {
  const option = args.shift();
  if (option !== "--tarball") {
    fail(`Unknown lifecycle option: ${option}`);
  }
  if (tarball) {
    fail("Lifecycle tarball may be provided only once.");
  }
  const value = args.shift();
  if (!value) {
    fail("--tarball requires a path to a packed .tgz file.");
  }
  tarball = resolveTarball(value);
}

if (!isSupportedLifecycleManager(packageManager)) {
  fail(
    `Unsupported package manager "${packageManager}" (expected: ${formatLifecycleManagers()}).`,
  );
}

const childEnv = {
  ...process.env,
  COMMITMENT_ISSUES_LIFECYCLE_PM: packageManager,
};
delete childEnv.COMMITMENT_ISSUES_LIFECYCLE_TARBALL;
if (tarball) {
  childEnv.COMMITMENT_ISSUES_LIFECYCLE_TARBALL = tarball;
}

const result = spawnSync(
  process.execPath,
  ["--test", "test/integration/lifecycle-manager.test.mjs"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: childEnv,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
