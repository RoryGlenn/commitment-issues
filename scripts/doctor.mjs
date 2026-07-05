#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { errorBox, successBox, warningBox } from "./lib/ui.mjs";
import { run } from "./lib/process.mjs";
import { HOOK_BODIES } from "./lib/hooks.mjs";
import { installCommand, runScript } from "./lib/package-manager.mjs";

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
        `commitment-issues: could not wire up git hooks — run \`${runScript("doctor")}\`.`,
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

// A hook file existing is not the same as it doing anything for us: git will
// happily run a hook whose body is a user's own unrelated script. Checking for
// the subcommand (rather than an exact body match) keeps user-customized hooks
// that still call us classified as healthy.
function hookContainsExpectedCommand(hookPath, command) {
  if (!fs.existsSync(hookPath)) {
    return false;
  }
  return fs.readFileSync(hookPath, "utf8").includes(command);
}

// Four-way classification so the repair logic can react appropriately:
//   missing               → recreate from HOOK_BODIES
//   wired                 → our exact generated body; healthy
//   custom-with-command   → user's own hook that still calls us; healthy
//   custom-without-command→ user's own hook that never calls us; a problem we
//                           report but must never overwrite.
function hookStatus(hookPath, expectedCommand) {
  if (!fs.existsSync(hookPath)) {
    return "missing";
  }
  if (fs.readFileSync(hookPath, "utf8") === HOOK_BODIES[hookPath]) {
    return "wired";
  }
  return hookContainsExpectedCommand(hookPath, expectedCommand)
    ? "custom-with-command"
    : "custom-without-command";
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
// Classify every hook once so existence, content, and "is it actually wired"
// are all considered — reporting healthy on the mere presence of a hook file
// was the bug this addresses.
const hookReports = Object.keys(HOOK_BODIES).map((hookPath) => {
  const command = HOOK_BODIES[hookPath].trim();
  return { hookPath, command, status: hookStatus(hookPath, command) };
});
const missingHooks = hookReports
  .filter((report) => report.status === "missing")
  .map((report) => report.hookPath);
const unwiredHooks = hookReports.filter(
  (report) => report.status === "custom-without-command",
);
if (missingHooks.length > 0) {
  problems.push(`missing hook file(s): ${missingHooks.join(", ")}`);
}
if (unwiredHooks.length > 0) {
  problems.push(
    `hook(s) not invoking commitment-issues: ${unwiredHooks
      .map((report) => report.hookPath)
      .join(", ")}`,
  );
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
      pc.dim(
        `Check that husky is installed (${installCommand()}), then retry.`,
      ),
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
  missingHooks.some((hookPath) => !fs.existsSync(hookPath))
) {
  repairFailed([
    pc.bold("Hook wiring still looks broken after repair."),
    "",
    pc.dim("Try running: npx husky"),
    pc.dim(`Then confirm: git config --get core.hooksPath → ${HOOKS_PATH}`),
  ]);
}

// A user-owned hook that never calls commitment-issues can't be repaired
// without clobbering their script, so surface it instead of silently claiming
// health. Quiet mode still exits 0 (an install must never break) but warns
// rather than staying silent; interactive mode explains the manual fix and
// exits non-zero because the tool is genuinely not wired in.
if (unwiredHooks.length > 0) {
  if (quiet) {
    console.warn(
      pc.yellow(
        `commitment-issues: ${unwiredHooks
          .map((report) => report.hookPath)
          .join(", ")} do not invoke commitment-issues — run ` +
          `\`${runScript("doctor")}\`.`,
      ),
    );
    process.exit(0);
  }
  warningBox([
    pc.bold("A git hook does not invoke commitment-issues."),
    "",
    ...unwiredHooks.map((report) =>
      pc.dim(`${report.hookPath} never runs \`${report.command}\`.`),
    ),
    "",
    pc.dim("Add the command above to each hook, or delete the hook file so"),
    pc.dim("doctor can recreate it. Existing hooks are never overwritten."),
    ...(repaired.length > 0
      ? ["", pc.dim(`Also repaired: ${repaired.join(", ")}.`)]
      : []),
  ]);
  process.exit(1);
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
