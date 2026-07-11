#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { infoBox, successBox, warningBox, errorBox } from "./lib/ui.mjs";
import {
  BIN,
  HOOK_NAMES,
  classifyHook,
  gitHooksDir,
  hooksPathConfig,
  isHuskyHooksPath,
} from "./lib/hooks.mjs";
import { removeCommand } from "./lib/package-manager.mjs";
import { run } from "./lib/process.mjs";

// Remove only setup that commitment-issues can identify as its own. Exact
// generated scripts and hook bodies are safe to delete; customized scripts,
// custom hooks, dependencies, lockfiles, and shared .gitignore entries are
// deliberately preserved.

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-n");

if (!fs.existsSync("package.json")) {
  errorBox([
    pc.bold("No package.json found."),
    "",
    pc.dim("Run this from your project root."),
  ]);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
} catch {
  errorBox([
    pc.bold("Invalid package.json."),
    "",
    pc.dim("Fix package.json so it contains valid JSON, then try again."),
  ]);
  process.exit(1);
}

const managedScripts = {
  prepare: [`${BIN} doctor --quiet`, "node scripts/doctor.mjs --quiet"],
  postprepare: [`${BIN} doctor --quiet`, "node scripts/doctor.mjs --quiet"],
  "commit:fix": [`${BIN} commit-fix`, "node scripts/commit-fix.mjs"],
  "fix:staged": [`${BIN} fix-staged`, "node scripts/fix-staged.mjs"],
  "test:precommit": [`${BIN} precommit`, "node scripts/precommit-unified.mjs"],
  doctor: [`${BIN} doctor`, "node scripts/doctor.mjs"],
};
const repairSuffix = ` && ${BIN} doctor --quiet`;

const plannedPackageChanges = [];
for (const [name, values] of Object.entries(managedScripts)) {
  if (values.includes(pkg.scripts?.[name])) {
    delete pkg.scripts[name];
    plannedPackageChanges.push(`package.json script ${name}`);
  }
}
if (pkg.scripts?.prepare?.endsWith(repairSuffix)) {
  pkg.scripts.prepare = pkg.scripts.prepare.slice(0, -repairSuffix.length);
  plannedPackageChanges.push("package.json prepare repair");
}

if (pkg.scripts && Object.keys(pkg.scripts).length === 0) {
  delete pkg.scripts;
}

if (Object.hasOwn(pkg, "precommitChecks")) {
  delete pkg.precommitChecks;
  plannedPackageChanges.push("package.json precommitChecks config");
}

const insideRepo = run("git", ["rev-parse", "--is-inside-work-tree"]);
const isGitRepo = !insideRepo.error && insideRepo.status === 0;
const hookCandidates = [];
const manualCleanup = [];

function displayPath(filePath) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  return relative && !relative.startsWith("..")
    ? relative
    : filePath.replace(/\\/g, "/");
}

function inspectHookDirectory(directory) {
  for (const name of HOOK_NAMES) {
    const hookPath = path.resolve(directory, name);
    let status;
    try {
      status = classifyHook(directory, name);
    } catch {
      manualCleanup.push(
        `${displayPath(hookPath)} could not be inspected; it was left unchanged.`,
      );
      continue;
    }
    if (status === "wired" || status === "stale-wired") {
      hookCandidates.push(hookPath);
    } else if (status === "custom-with-command") {
      manualCleanup.push(
        `${displayPath(hookPath)} is customized; remove its ${BIN} command manually.`,
      );
    }
  }
}

if (isGitRepo) {
  const inspected = new Set();
  const nativeHooksDir = gitHooksDir();
  if (nativeHooksDir) {
    const absolute = path.resolve(nativeHooksDir);
    inspected.add(absolute);
    inspectHookDirectory(absolute);
  }

  const configuredHooksPath = hooksPathConfig();
  if (configuredHooksPath) {
    const configuredDir = path.resolve(
      isHuskyHooksPath(configuredHooksPath) ? ".husky" : configuredHooksPath,
    );
    if (!inspected.has(configuredDir)) {
      inspectHookDirectory(configuredDir);
    }
  }
} else {
  manualCleanup.push(
    "This is not a git repository, so local hook files could not be inspected.",
  );
}

const planned = [...plannedPackageChanges, ...hookCandidates.map(displayPath)];
const removed = [];

if (!dryRun) {
  if (plannedPackageChanges.length > 0) {
    fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
    removed.push(...plannedPackageChanges);
  }
  for (const hookPath of hookCandidates) {
    try {
      fs.rmSync(hookPath);
      removed.push(displayPath(hookPath));
    } catch {
      manualCleanup.push(`Could not remove ${displayPath(hookPath)}.`);
    }
  }
}

const actions = dryRun ? planned : removed;
const summary =
  actions.length > 0
    ? [
        pc.dim(dryRun ? "Would remove:" : "Removed:"),
        ...actions.map((item) => pc.dim(`- ${item}`)),
      ]
    : [pc.dim("No generated setup was found to remove.")];

const preservedIgnores = [
  ".eslintcache",
  ".prettiercache",
  "node_modules/",
].filter(
  (entry) =>
    fs.existsSync(".gitignore") &&
    fs
      .readFileSync(".gitignore", "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(entry),
);

const body = [
  pc.bold(
    dryRun
      ? "Commitment Issues uninstall preview."
      : "Commitment Issues setup was removed.",
  ),
  "",
  ...summary,
  ...(preservedIgnores.length > 0
    ? [
        "",
        pc.dim("Preserved shared .gitignore entries:"),
        ...preservedIgnores.map((entry) => pc.dim(`- ${entry}`)),
      ]
    : []),
  "",
  ...(dryRun
    ? [
        pc.dim("No files were written."),
        pc.dim("Run again without --dry-run to apply these changes."),
      ]
    : [
        pc.dim("Finish by removing the package and updating the lockfile:"),
        pc.dim(`  ${removeCommand([BIN])}`),
      ]),
];

if (dryRun) {
  infoBox(body);
} else {
  successBox(body);
}

if (manualCleanup.length > 0) {
  warningBox([
    pc.bold("Manual cleanup may still be needed."),
    "",
    ...manualCleanup.map((line) => pc.dim(line)),
  ]);
}
