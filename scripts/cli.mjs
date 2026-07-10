#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Single entry point for the `commitment-issues` bin. It dispatches a
// subcommand to the matching script that lives alongside it inside the
// installed package, so consumers run `commitment-issues <command>` from their
// hooks and npm scripts — no vendoring, no node_modules paths.

const COMMANDS = {
  init: "init.mjs",
  doctor: "doctor.mjs",
  precommit: "precommit.mjs",
  prepush: "prepush.mjs",
  "commit-fix": "commit-fix.mjs",
  "fix-staged": "fix-staged.mjs",
  "fix-staged-js": "fix-staged-js.mjs",
};

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(path.dirname(scriptsDir), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const [subcommand, ...rest] = process.argv.slice(2);

function printUsage(stream) {
  const names = Object.keys(COMMANDS).join(", ");
  stream(`commitment-issues <command> [args]

Commands: ${names}

Version:    commitment-issues --version

Get started:  commitment-issues init`);
}

if (subcommand === "-v" || subcommand === "--version") {
  console.log(packageJson.version);
  process.exit(0);
}

if (!subcommand || subcommand === "-h" || subcommand === "--help") {
  printUsage(subcommand ? console.log : console.error);
  process.exit(subcommand ? 0 : 1);
}

const file = COMMANDS[subcommand];
if (!file) {
  console.error(
    `commitment-issues: unknown command '${subcommand}'. Run 'commitment-issues --help'.`,
  );
  process.exit(1);
}

// Run the target script in this same process: rewrite argv so it sees only its
// own arguments, then import it. The scripts call process.exit themselves, which
// propagates the correct exit code (and stdin stays connected for pre-push).
const target = path.join(scriptsDir, file);
process.argv = [process.argv[0], target, ...rest];
// The dispatch import is exercised by the subcommand tests; the catch only
// fires if a bundled script is missing or corrupt (unreachable in a healthy
// install), so this dispatch wrapper is excluded from coverage.
/* node:coverage disable */
try {
  await import(pathToFileURL(target).href);
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
/* node:coverage enable */
