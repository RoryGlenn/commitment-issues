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
  uninstall: "uninstall.mjs",
  doctor: "doctor.mjs",
  "commit-msg": "commit-msg.mjs",
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

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[right.length];
}

function closestCommand(input) {
  // Bound work for an accidentally pasted argument while keeping every real
  // command typo comfortably inside the comparison window.
  if (input.length > 64) return null;

  let closest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const command of Object.keys(COMMANDS)) {
    const candidateDistance = editDistance(input, command);
    if (candidateDistance < distance) {
      closest = command;
      distance = candidateDistance;
    }
  }

  const threshold = Math.min(3, Math.max(1, Math.floor(closest.length / 3)));
  return distance <= threshold ? closest : null;
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
  const suggestion = closestCommand(subcommand);
  const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
  console.error(
    `commitment-issues: unknown command '${subcommand}'.${hint} Run 'commitment-issues --help'.`,
  );
  process.exit(1);
}

if (
  rest.some((arg) => arg === "--json" || /^--json=/.test(arg)) &&
  !["precommit", "prepush"].includes(subcommand)
) {
  console.error(
    `commitment-issues: --json is only supported by 'precommit' and 'prepush'.`,
  );
  process.exit(1);
}

// Run the target script in this same process: rewrite argv so it sees only its
// own arguments, then import it. The scripts call process.exit themselves, which
// propagates the correct exit code (and stdin stays connected for pre-push).
const target = path.join(scriptsDir, file);
process.argv = [process.argv[0], target, ...rest];
// Package integrity guarantees the mapped entry script exists. Let a corrupt
// installation reject naturally so Node preserves the original module error.
await import(pathToFileURL(target).href);
