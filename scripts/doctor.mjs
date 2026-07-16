#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { printBoxModel } from "./lib/ui.mjs";
import { run, isPackageInstalled, isToolInstalled } from "./lib/process.mjs";
import {
  BIN,
  classifyHook,
  effectiveHooksDir,
  gitWorkTreeState,
  gitHooksDir,
  hookInvocation,
  hookNamesForConfig,
  hooksPathConfigState,
  isHuskyHooksPath,
  legacyHuskyDirectoryState,
  leftoverHuskyHooks,
  writeHook,
} from "./lib/hooks.mjs";
import { devInstallCommand, runScript } from "./lib/package-manager.mjs";
import {
  loadPrecommitConfig,
  precommitConfigWarningMessages,
  resolveCommitMessageConfig,
} from "./lib/config.mjs";
import { localToolInvocation } from "./lib/local-tool.mjs";
import { escapeTerminalText } from "./lib/terminal.mjs";

// Diagnose and self-heal the git hook wiring. Hooks are plain `.git/hooks`
// files — git's default location, no hook manager — but `.git/hooks` is not
// committed, so a fresh clone or a reinstall that skipped `prepare` starts with
// no hooks at all. This restores them without clobbering anything, migrates
// husky-era wiring from pre-3.0 setups, and is safe to run anytime.
//
// With `--quiet` it runs from the generated or composed `prepare` script
// on every install: it stays silent when healthy, prints a one-line notice only
// when it repairs something, and never exits non-zero (so it can never break
// `npm install`, including CI/Docker with no `.git`).

const args = process.argv.slice(2);
const unknownOption = args.find((argument) => argument !== "--quiet");
if (unknownOption) {
  printBoxModel({
    severity: "error",
    lines: [
      pc.bold(`Unknown doctor option: ${escapeTerminalText(unknownOption)}`),
      "",
      pc.dim("Supported option: --quiet."),
      pc.dim("No hooks were changed."),
    ],
  });
  process.exit(1);
}
const quiet = args.includes("--quiet");
const advisorySections = [];

function quietWarning(message) {
  console.warn(pc.yellow(escapeTerminalText(message)));
}

function quietNotice(message) {
  console.log(pc.dim(escapeTerminalText(message)));
}

function finishBox(severity, lines, exitCode) {
  const hasAdvisories = advisorySections.length > 0;
  const combinedLines = hasAdvisories
    ? [...lines, ...advisorySections.flatMap((section) => ["", ...section])]
    : lines;
  printBoxModel({
    severity:
      severity === "error" ? "error" : hasAdvisories ? "warning" : severity,
    lines: combinedLines,
  });
  process.exit(exitCode);
}

// Peer tools commitment-issues runs but deliberately does not bundle. They are
// declared as peerDependencies (an install-time nudge); this same list drives
// the runtime advisory below for a tool that is still absent when hooks run.
const REQUIRED_TOOLS = ["eslint", "prettier"];

// Prerequisite missing (no package.json / not a git repo). Interactive: explain
// and fail. Quiet: skip silently and succeed so installs never break.
function notApplicable(lines) {
  if (!quiet) {
    finishBox("error", lines, 1);
  }
  process.exit(0);
}

// Repair could not complete. Interactive: explain and fail. Quiet: warn in one
// line and still succeed so the install isn't broken.
function repairFailed(lines) {
  if (quiet) {
    quietWarning(
      `commitment-issues: could not wire up git hooks — run \`${runScript("doctor")}\`.`,
    );
    process.exit(0);
  }
  finishBox("error", lines, 1);
}

if (!fs.existsSync("package.json")) {
  notApplicable([
    pc.bold("No package.json found."),
    "",
    pc.dim("Run this from your project root."),
  ]);
}

const gitState = gitWorkTreeState();
if (!gitState.inside) {
  notApplicable([
    pc.bold(gitState.bare ? "Bare git repository." : "Not a git repository."),
    "",
    pc.dim(
      gitState.bare
        ? "Run this from a non-bare working tree; local commit and push hooks do not run here."
        : "Run this from inside your git project.",
    ),
  ]);
}

const hooksPathState = hooksPathConfigState();
if (hooksPathState.error) {
  repairFailed([
    pc.bold("Could not determine core.hooksPath."),
    "",
    pc.dim("Git could not identify the effective hooks directory."),
    pc.dim("Fix the Git configuration error, then retry."),
  ]);
}

const config = loadPrecommitConfig();
const configWarnings = precommitConfigWarningMessages(config);
const commitMessage = resolveCommitMessageConfig(config);
const hookNames = hookNamesForConfig(config);
const hookSummary =
  hookNames.length === 3
    ? "pre-commit, pre-push, and commit-msg are wired up and active."
    : "pre-commit and pre-push are wired up and active.";
if (configWarnings.length > 0) {
  if (quiet) {
    for (const message of configWarnings) {
      quietWarning(`commitment-issues: ${message}`);
    }
  } else {
    advisorySections.push([
      pc.bold("Configuration needs attention."),
      "",
      ...configWarnings.map((message) =>
        pc.dim(`• ${escapeTerminalText(message)}`),
      ),
    ]);
  }
}

// Advisory peer-tool check, independent of hook wiring. commitment-issues
// orchestrates eslint and prettier without bundling them; peerDependencies
// nudge at install time, but a tool can still be absent at runtime (removed
// later, installed with --no-save, or hoisted oddly in a monorepo). Surface it
// here before a hook needs it. Runtime resolution is deliberately local-only:
// no implicit npx/registry fallback is attempted. This never fails: a missing
// tool is reported, never treated as a repairable problem or a non-zero exit.
const missingTools = REQUIRED_TOOLS.filter((name) => !isToolInstalled(name));
if (missingTools.length > 0) {
  const installHint = devInstallCommand(missingTools);
  if (quiet) {
    quietWarning(
      `commitment-issues: missing required tool(s): ${missingTools.join(
        ", ",
      )} — install with \`${installHint}\`.`,
    );
  } else {
    advisorySections.push([
      pc.bold("Some required tools are not installed."),
      "",
      ...missingTools.map((name) => pc.dim(`• ${escapeTerminalText(name)}`)),
      "",
      pc.dim(
        "commitment-issues only runs project-local copies of these tools.",
      ),
      pc.dim("Hooks never ask npx to download a missing peer dependency."),
      pc.dim(`Install them: ${escapeTerminalText(installHint)}`),
    ]);
  }
}

// commitlint is deliberately optional and is never resolved through npx or a
// global PATH entry. Once the feature is enabled, diagnose a missing local bin
// before the first commit without turning install-time doctor into a blocker.
if (commitMessage.enabled && !localToolInvocation("commitlint", [])) {
  const installHint = devInstallCommand(["@commitlint/cli"]);
  if (quiet) {
    quietWarning(
      `commitment-issues: commit-message linting is enabled but project-local commitlint is missing — install with \`${installHint}\`.`,
    );
  } else {
    advisorySections.push([
      pc.bold("Commit-message linting is not ready."),
      "",
      pc.dim("precommitChecks.commitMessage.enabled is true, but the"),
      pc.dim("project-local commitlint CLI is not installed."),
      "",
      pc.dim(`Install it: ${escapeTerminalText(installHint)}`),
      pc.dim("Then add a commitlint config with your chosen rules."),
    ]);
  }
}

const configuredHooksPath = hooksPathState.value;
const huskyEraHooksPath = isHuskyHooksPath(configuredHooksPath);
// A husky-era hooksPath with the husky package still installed is LIVE
// wiring: the user is keeping husky deliberately (e.g. for a commit-msg
// hook), and husky's own prepare would fight an automatic unset anyway.
// Respect it and only nudge; `init` performs the explicit migration. Once
// husky is out of the dependency tree (the v3 upgrade path — by `prepare`
// time the install has already pruned it), the wiring is a dead end: hooks
// point at shims nothing maintains, so migrating automatically only helps.
const huskyEraLive = huskyEraHooksPath && isPackageInstalled("husky");
const legacyHuskyState = legacyHuskyDirectoryState();
if (legacyHuskyState.status === "uninspectable") {
  if (quiet) {
    quietWarning(
      "commitment-issues: the legacy .husky path could not be safely inspected and was left unchanged — review it manually.",
    );
  } else {
    advisorySections.push([
      pc.bold("The legacy .husky path needs manual review."),
      "",
      pc.dim("It could not be safely inspected and was left unchanged."),
      pc.dim(
        "If it is a symbolic link or non-directory path, review it manually.",
      ),
    ]);
  }
}

// Human-friendly path for reporting a hook file (absolute only when the hooks
// dir lives outside the project, e.g. a linked worktree's common dir).
function displayHookPath(hooksDir, name) {
  const rel = path
    .relative(process.cwd(), path.join(hooksDir, name))
    .replace(/\\/g, "/");
  return rel && !rel.startsWith("..")
    ? rel
    : path.join(hooksDir, name).replace(/\\/g, "/");
}

// These commands are copy/pasted into a POSIX shell. Always single-quote the
// pathname, escaping embedded single quotes with the standard close/quote/open
// sequence, so spaces and shell metacharacters remain one literal argument.
function executableFixCommand(hooksDir, name) {
  let hookPath = displayHookPath(hooksDir, name);
  // Quoting preserves a leading dash, but chmod would still parse it as an
  // option. Keep relative paths relative while making the first argument safe.
  if (!path.isAbsolute(hookPath) && hookPath.startsWith("-")) {
    hookPath = `./${hookPath}`;
  }
  const quotedPath = `'${hookPath.replaceAll("'", `'"'"'`)}'`;
  return `chmod +x ${quotedPath}`;
}

// A foreign core.hooksPath (another hook manager, or the user's own hooks dir)
// means git never reads `.git/hooks`. That configuration is the user's — never
// unset or write into it. It counts as healthy when its hook files already
// invoke commitment-issues; otherwise report exactly what to add. Live
// husky-era wiring gets the same respect, except the hook files git ultimately
// runs live in `.husky/` (husky's `_` shims delegate there) and the suggested
// fix is the `init` migration.
if (configuredHooksPath && (!huskyEraHooksPath || huskyEraLive)) {
  const checkDir = huskyEraLive ? path.resolve(".husky") : effectiveHooksDir();
  if (!checkDir) {
    repairFailed([
      pc.bold("Could not locate the configured git hooks directory."),
      "",
      pc.dim("Git could not resolve the effective core.hooksPath."),
      pc.dim("Fix the Git configuration error, then retry."),
    ]);
  }
  const hookReports = hookNames.map((name) => ({
    name,
    // Husky's shim sources `.husky/<name>` with `sh`; the delegated file does
    // not itself need an executable bit. Native/foreign Git hook files do.
    status: classifyHook(checkDir, name, {
      requireExecutable: !huskyEraLive,
    }),
  }));
  const inactive = hookReports.filter((report) =>
    [
      "missing",
      "custom-without-command",
      "non-executable",
      "uninspectable",
    ].includes(report.status),
  );
  if (inactive.length === 0) {
    if (!quiet) {
      finishBox(
        "success",
        [
          pc.bold("Git hooks are healthy."),
          "",
          pc.dim(`core.hooksPath → ${escapeTerminalText(configuredHooksPath)}`),
          pc.dim(hookSummary),
          ...(huskyEraLive
            ? [
                "",
                pc.dim(
                  "This is husky-era wiring. Migrate to native .git/hooks",
                ),
                pc.dim(`anytime with: npx ${BIN} init`),
              ]
            : []),
        ],
        0,
      );
    }
    process.exit(0);
  }
  if (quiet) {
    quietWarning(
      `commitment-issues: core.hooksPath is set to ${configuredHooksPath} ` +
        `and its hooks are missing, inactive, or do not invoke ` +
        `commitment-issues — run \`${runScript("doctor")}\`.`,
    );
    process.exit(0);
  }
  finishBox(
    "warning",
    [
      pc.bold("core.hooksPath points somewhere else."),
      "",
      pc.dim(
        `git core.hooksPath is set to ${escapeTerminalText(configuredHooksPath)}, so git only`,
      ),
      pc.dim(
        huskyEraLive
          ? "runs hooks managed by husky. These hooks are not wired up:"
          : "runs hooks from that directory. Add these commands there:",
      ),
      "",
      ...(huskyEraLive
        ? inactive.map((report) => `  .husky/${report.name}`)
        : inactive.map((report) =>
            report.status === "uninspectable"
              ? `  ${escapeTerminalText(displayHookPath(checkDir, report.name))} ${pc.dim("(could not be inspected)")}`
              : report.status === "non-executable"
                ? `  ${escapeTerminalText(executableFixCommand(checkDir, report.name))}`
                : `  ${hookInvocation(report.name)}   ${pc.dim(`(${report.name})`)}`,
          )),
      "",
      ...(huskyEraLive
        ? [pc.dim(`Migrate to native .git/hooks wiring: npx ${BIN} init`)]
        : [
            pc.dim("Or unset it to use native .git/hooks wiring:"),
            pc.dim("  git config --unset core.hooksPath"),
          ]),
    ],
    1,
  );
}

const hooksDir = gitHooksDir();
if (!hooksDir) {
  repairFailed([
    pc.bold("Could not locate the git hooks directory."),
    "",
    pc.dim("Check that this is a working git repository, then retry."),
  ]);
}

// Classify every hook once so existence, content, and "is it actually wired"
// are all considered — reporting healthy on the mere presence of a hook file
// was the bug this addresses.
const hookReports = hookNames.map((name) => ({
  name,
  status: classifyHook(hooksDir, name),
}));
const missingHooks = hookReports
  .filter((report) => report.status === "missing")
  .map((report) => report.name);
const staleHooks = hookReports
  .filter((report) => report.status === "stale-wired")
  .map((report) => report.name);
const unwiredHooks = hookReports
  .filter((report) => report.status === "custom-without-command")
  .map((report) => report.name);
const nonExecutableHooks = hookReports
  .filter((report) => report.status === "non-executable")
  .map((report) => report.name);
const uninspectableHooks = hookReports
  .filter((report) => report.status === "uninspectable")
  .map((report) => report.name);

const problems = [];
if (huskyEraHooksPath) {
  problems.push(`husky-era core.hooksPath (${configuredHooksPath}) is set`);
}
if (missingHooks.length > 0) {
  problems.push(`missing hook file(s): ${missingHooks.join(", ")}`);
}
if (staleHooks.length > 0) {
  problems.push(`outdated generated hook file(s): ${staleHooks.join(", ")}`);
}
if (unwiredHooks.length > 0) {
  problems.push(
    `hook(s) not invoking commitment-issues: ${unwiredHooks
      .map((name) => displayHookPath(hooksDir, name))
      .join(", ")}`,
  );
}
if (nonExecutableHooks.length > 0) {
  problems.push(
    `non-executable hook(s): ${nonExecutableHooks
      .map((name) => displayHookPath(hooksDir, name))
      .join(", ")}`,
  );
}
if (uninspectableHooks.length > 0) {
  problems.push(
    `uninspectable hook(s): ${uninspectableHooks
      .map((name) => displayHookPath(hooksDir, name))
      .join(", ")}`,
  );
}

// User-authored hooks stranded in `.husky/` no longer run once hooksPath stops
// pointing there. Purely advisory (like the missing-tools check): reported on
// every run until the user moves or deletes them, never a repair target.
const strandedHuskyHooks = leftoverHuskyHooks();
function reportStrandedHuskyHooks() {
  if (strandedHuskyHooks.length === 0) {
    return;
  }
  if (quiet) {
    quietWarning(
      `commitment-issues: ${strandedHuskyHooks.join(", ")} no longer run ` +
        `(husky wiring was retired) — move them to .git/hooks or delete them.`,
    );
    return;
  }
  advisorySections.push([
    pc.bold("Leftover .husky hooks no longer run."),
    "",
    ...strandedHuskyHooks.map((hook) =>
      pc.dim(`• ${escapeTerminalText(hook)}`),
    ),
    "",
    pc.dim("Git hooks now live in .git/hooks, so these files are inert."),
    pc.dim("Move the logic into .git/hooks, or delete the files."),
  ]);
}

if (problems.length === 0) {
  reportStrandedHuskyHooks();
  if (!quiet) {
    finishBox(
      "success",
      [
        pc.bold("Git hooks are healthy."),
        "",
        pc.dim(".git/hooks is active — no hook manager needed."),
        pc.dim(hookSummary),
      ],
      0,
    );
  }
  process.exit(0);
}

// --- Repair ---
const repaired = [];

// Retire husky-era wiring: while core.hooksPath points at `.husky/_`, git
// ignores `.git/hooks` entirely, so native hooks would be dead on arrival.
if (huskyEraHooksPath) {
  const unset = run("git", ["config", "--unset", "core.hooksPath"]);
  if (unset.error || (unset.status || 0) !== 0) {
    repairFailed([
      pc.bold("Could not repair the git hook wiring."),
      "",
      pc.dim("Unsetting the husky-era core.hooksPath failed. Run:"),
      pc.dim("  git config --unset core.hooksPath"),
      pc.dim(`Then rerun ${runScript("doctor")}.`),
    ]);
  }
  repaired.push("retired husky-era core.hooksPath");
}

// Recreate missing hooks and refresh only exact older generated bodies. A
// customized hook never receives the stale-wired classification.
for (const name of [...missingHooks, ...staleHooks]) {
  try {
    writeHook(hooksDir, name);
  } catch {
    repairFailed([
      pc.bold("Could not repair the git hook wiring."),
      "",
      pc.dim(
        `Writing ${escapeTerminalText(displayHookPath(hooksDir, name))} failed.`,
      ),
      pc.dim("Check file permissions on .git/hooks, then retry."),
    ]);
  }
  repaired.push(displayHookPath(hooksDir, name));
}

const repairedHooksPathState = hooksPathConfigState();
if (
  repairedHooksPathState.error ||
  repairedHooksPathState.value !== "" ||
  hookNames.some((name) =>
    ["missing", "stale-wired"].includes(classifyHook(hooksDir, name)),
  )
) {
  repairFailed([
    pc.bold("Hook wiring still looks broken after repair."),
    "",
    pc.dim("Confirm core.hooksPath is unset: git config --get core.hooksPath"),
    pc.dim(`Then confirm these hooks exist: ${hookNames.join(", ")}.`),
  ]);
}

// A user-owned hook that never calls commitment-issues, is not executable, or
// cannot be inspected cannot be repaired without changing the user's path or
// file. Surface it instead of silently claiming health. Quiet mode still exits
// 0 (an install must never break); interactive mode explains the manual fix and
// exits non-zero because the tool is genuinely not wired in.
if (
  unwiredHooks.length > 0 ||
  nonExecutableHooks.length > 0 ||
  uninspectableHooks.length > 0
) {
  if (quiet) {
    const inactivePaths = [
      ...unwiredHooks,
      ...nonExecutableHooks,
      ...uninspectableHooks,
    ].map((name) => displayHookPath(hooksDir, name));
    quietWarning(
      `commitment-issues: ${inactivePaths.join(", ")} are inactive or do not ` +
        `invoke commitment-issues — run ` +
        `\`${runScript("doctor")}\`.`,
    );
    process.exit(0);
  }
  finishBox(
    "warning",
    [
      pc.bold(
        uninspectableHooks.length > 0
          ? "A git hook could not be inspected."
          : nonExecutableHooks.length > 0
            ? "A git hook is inactive."
            : "A git hook does not invoke commitment-issues.",
      ),
      "",
      ...unwiredHooks.map((name) =>
        pc.dim(
          `${escapeTerminalText(displayHookPath(hooksDir, name))} never runs \`${escapeTerminalText(hookInvocation(name))}\`.`,
        ),
      ),
      ...nonExecutableHooks.flatMap((name) => [
        pc.dim(
          `${escapeTerminalText(displayHookPath(hooksDir, name))} is not executable.`,
        ),
        pc.dim(
          `Run: ${escapeTerminalText(executableFixCommand(hooksDir, name))}`,
        ),
      ]),
      ...uninspectableHooks.map((name) =>
        pc.dim(
          `${escapeTerminalText(displayHookPath(hooksDir, name))} could not be inspected; it was left unchanged.`,
        ),
      ),
      "",
      ...(unwiredHooks.length > 0
        ? [
            pc.dim("Add the command above to each unwired hook, or delete the"),
            pc.dim("hook file so doctor can recreate it."),
          ]
        : []),
      ...(uninspectableHooks.length > 0
        ? [
            pc.dim("Replace each path with a readable hook file, then rerun"),
            pc.dim(`${runScript("doctor")}.`),
          ]
        : []),
      pc.dim(
        "Existing hooks are never overwritten or made executable for you.",
      ),
      ...(repaired.length > 0
        ? [
            "",
            pc.dim(
              `Also repaired: ${escapeTerminalText(repaired.join(", "))}.`,
            ),
          ]
        : []),
    ],
    1,
  );
}

reportStrandedHuskyHooks();

if (quiet) {
  quietNotice(
    `commitment-issues: repaired git hooks (${repaired.join(", ")}).`,
  );
} else {
  finishBox(
    "warning",
    [
      pc.bold("Repaired the git hook wiring."),
      "",
      pc.dim(`Was broken: ${escapeTerminalText(problems.join("; "))}.`),
      pc.dim(`Fixed: ${escapeTerminalText(repaired.join(", "))}.`),
      "",
      pc.dim(hookSummary.replace("wired up and ", "")),
    ],
    0,
  );
}

process.exit(0);
