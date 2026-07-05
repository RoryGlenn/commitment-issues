#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { errorBox, successBox, warningBox } from "./lib/ui.mjs";
import { run } from "./lib/process.mjs";
import { HOOK_BODIES } from "./lib/hooks.mjs";

// Diagnose and self-heal the Husky hook wiring. Both hooks run through the
// gitignored `.husky/_` wrappers and git's `core.hooksPath` — neither of which
// is committed — so a `git clean -fdx`, a stale checkout, or a reinstall that
// skipped `prepare` can silently switch off ALL hooks at once. This restores
// them without clobbering anything, and is safe to run anytime.
//
// With `--quiet` it runs from `prepare` on every install: it stays silent when
// healthy, prints a one-line notice only when it repairs something, and never
// exits non-zero (so it can never break `npm install`, including CI/Docker with
// no `.git`).

const quiet = process.argv.includes("--quiet");

const HOOKS_PATH = ".husky/_";

// Prerequisite missing (no package.json / not a git repo). Interactive: explain
// and fail. Quiet: skip silently and succeed so installs never break.
function notApplicable(lines) {
  if (!quiet) {
    errorBox(lines);
    process.exit(1);
  }
  process.exit(0);
}

// Repair could not complete. Interactive: explain and fail. Quiet: warn in one
// line and still succeed so the install isn't broken.
function repairFailed(lines) {
  if (quiet) {
    console.warn(
      pc.yellow(
        "commitment-issues: could not wire up git hooks — run `npm run doctor`.",
      ),
    );
    process.exit(0);
  }
  errorBox(lines);
  process.exit(1);
}

if (!fs.existsSync("package.json")) {
  notApplicable([
    pc.bold("No package.json found."),
    "",
    pc.dim("Run this from your project root."),
  ]);
}

const insideRepo = run("git", ["rev-parse", "--is-inside-work-tree"]);
if (insideRepo.error || insideRepo.status !== 0) {
  notApplicable([
    pc.bold("Not a git repository."),
    "",
    pc.dim("Run this from inside your git project."),
  ]);
}

function currentHooksPath() {
  const result = run("git", ["config", "--get", "core.hooksPath"]);
  return (result.stdout || "").trim();
}

// The per-hook wrappers git actually executes live under `.husky/_`; if they are
// gone (or hooksPath is unset), git runs nothing and both hooks go silent.
function wiringIntact() {
  return (
    currentHooksPath() === HOOKS_PATH &&
    fs.existsSync(path.join(HOOKS_PATH, "pre-commit")) &&
    fs.existsSync(path.join(HOOKS_PATH, "pre-push"))
  );
}

export function hookContainsExpectedCommand(hookPath, command) {
  if (!fs.existsSync(hookPath)) {
    return false;
  }
  return fs.readFileSync(hookPath, "utf8").includes(command);
}

export function hookStatus(hookPath, expectedCommand) {
  if (!fs.existsSync(hookPath)) {
    return "missing";
  }

  const current = fs.readFileSync(hookPath, "utf8");
  if (current === HOOK_BODIES[hookPath]) {
    return "wired";
  }
  if (hookContainsExpectedCommand(hookPath, expectedCommand)) {
    return "custom-with-command";
  }
  return "custom-without-command";
}

function hookReports() {
  return Object.entries(HOOK_BODIES).map(([hookPath, body]) => ({
    hookPath,
    expectedCommand: body.trim(),
    status: hookStatus(hookPath, body.trim()),
  }));
}

function customHooksWithoutCommand() {
  return hookReports().filter(
    ({ status }) => status === "custom-without-command",
  );
}

function reportUnwiredCustomHooks(unwiredHooks) {
  if (quiet) {
    console.warn(
      pc.yellow(
        "commitment-issues: custom hooks do not invoke commitment-issues — run `npm run doctor`.",
      ),
    );
    process.exit(0);
  }

  const lines = unwiredHooks.flatMap(({ hookPath, expectedCommand }) => [
    pc.dim(`${hookPath} exists but does not invoke commitment-issues.`),
    pc.dim(`Add this command to ${hookPath}: ${expectedCommand}`),
  ]);

  warningBox([
    pc.bold("Commitment Issues is not wired into every hook."),
    "",
    ...lines,
    "",
    pc.dim("Custom hooks were preserved. Add the command manually."),
  ]);
  process.exit(1);
}

const problems = [];
if (currentHooksPath() !== HOOKS_PATH) {
  problems.push("git core.hooksPath is not set to .husky/_");
}
if (
  !fs.existsSync(path.join(HOOKS_PATH, "pre-commit")) ||
  !fs.existsSync(path.join(HOOKS_PATH, "pre-push"))
) {
  problems.push(".husky/_ hook wrappers are missing");
}
const missingHooks = hookReports()
  .filter(({ status }) => status === "missing")
  .map(({ hookPath }) => hookPath);
if (missingHooks.length > 0) {
  problems.push(`missing hook file(s): ${missingHooks.join(", ")}`);
}
const unwiredCustomHooks = customHooksWithoutCommand();
for (const { hookPath, expectedCommand } of unwiredCustomHooks) {
  problems.push(`${hookPath} does not invoke ${expectedCommand}`);
}

if (problems.length === 0) {
  if (!quiet) {
    successBox([
      pc.bold("Git hooks are healthy."),
      "",
      pc.dim("core.hooksPath → .husky/_"),
      pc.dim("pre-commit and pre-push are wired up and active."),
    ]);
  }
  process.exit(0);
}

// --- Repair ---
const repaired = [];

// Rebuild Husky's wiring (core.hooksPath + the gitignored `.husky/_` wrappers).
if (!wiringIntact()) {
  const husky = run("npx", ["husky"]);
  if (husky.error || (husky.status || 0) !== 0) {
    repairFailed([
      pc.bold("Could not repair the Husky wiring."),
      "",
      pc.dim("Check that husky is installed (npm install), then retry."),
    ]);
  }
  repaired.push("husky wiring (core.hooksPath + .husky/_)");
}

// Recreate any missing hook files (never overwrite an existing one).
fs.mkdirSync(".husky", { recursive: true });
for (const [hookPath, body] of Object.entries(HOOK_BODIES)) {
  if (!fs.existsSync(hookPath)) {
    fs.writeFileSync(hookPath, body);
    fs.chmodSync(hookPath, 0o755);
    repaired.push(hookPath);
  }
}

if (
  !wiringIntact() ||
  hookReports().some(({ status }) => status === "missing")
) {
  repairFailed([
    pc.bold("Hook wiring still looks broken after repair."),
    "",
    pc.dim("Try running: npx husky"),
    pc.dim(`Then confirm: git config --get core.hooksPath → ${HOOKS_PATH}`),
  ]);
}

const remainingUnwiredHooks = customHooksWithoutCommand();
if (remainingUnwiredHooks.length > 0) {
  reportUnwiredCustomHooks(remainingUnwiredHooks);
}

if (quiet) {
  console.log(
    pc.dim(`commitment-issues: repaired git hooks (${repaired.join(", ")}).`),
  );
} else {
  warningBox([
    pc.bold("Repaired the git hook wiring."),
    "",
    pc.dim(`Was broken: ${problems.join("; ")}.`),
    pc.dim(`Fixed: ${repaired.join(", ")}.`),
    "",
    pc.dim("pre-commit and pre-push are active again."),
  ]);
}

process.exit(0);
