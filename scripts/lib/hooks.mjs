// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Shared hook-wiring constants and helpers so init, doctor, and the hooks
// themselves all agree on how a consuming project invokes this tool. Hooks are
// plain `.git/hooks` files (git's default location — no core.hooksPath, no
// hook manager) whose bodies run the published `commitment-issues` bin from
// node_modules/.bin, so consumers never vendor scripts or reference
// node_modules paths.
import fs from "node:fs";
import path from "node:path";
import { run } from "./process.mjs";

export const BIN = "commitment-issues";

// Hook name → bin subcommand it runs.
export const HOOK_SUBCOMMANDS = {
  "pre-commit": "precommit",
  "pre-push": "prepush",
  "commit-msg": "commit-msg",
};

export const HOOK_NAMES = Object.keys(HOOK_SUBCOMMANDS);
export const ALWAYS_HOOK_NAMES = ["pre-commit", "pre-push"];

/**
 * Hooks that should be active for a sanitized project configuration.
 * Commit-message linting is the only optional hook and requires an explicit
 * `enabled: true`; uninstall still uses HOOK_NAMES to find every artifact this
 * package may own.
 * @param {object} config - Sanitized precommitChecks configuration.
 * @returns {string[]} Active hook names.
 */
export function hookNamesForConfig(config) {
  return config?.commitMessage?.enabled === true
    ? [...ALWAYS_HOOK_NAMES, "commit-msg"]
    : [...ALWAYS_HOOK_NAMES];
}

/**
 * The bin invocation a hook must contain to count as wired.
 * @param {string} name - Hook name (e.g. "pre-commit").
 * @returns {string} e.g. "commitment-issues precommit".
 */
export function hookCommand(name) {
  const command = `${BIN} ${HOOK_SUBCOMMANDS[name]}`;
  // Git supplies the message file as $1. Keep it quoted in both generated and
  // suggested custom-hook wiring so repositories with unusual paths are safe.
  return name === "commit-msg" ? `${command} "$1"` : command;
}

/**
 * The full generated hook body. POSIX sh (Git for Windows runs hooks through
 * its bundled sh, so this works on every supported platform). The body:
 * - honors COMMITMENT_ISSUES=0 (and HUSKY=0 for pre-3.0 CI recipes) as a skip;
 * - puts node_modules/.bin on PATH (git runs hooks from the repo root);
 * - self-neutralizes when the bin is gone (uninstalling the package must never
 *   break commits or pushes).
 * @param {string} name - Hook name (e.g. "pre-commit" or "commit-msg").
 * @returns {string} Hook file contents.
 */
export function hookBody(name) {
  return `#!/bin/sh
# Installed by commitment-issues. Recreate anytime with: ${BIN} doctor
if [ "$COMMITMENT_ISSUES" = "0" ] || [ "$HUSKY" = "0" ]; then
  exit 0
fi
export PATH="node_modules/.bin:$PATH"
if ! command -v ${BIN} >/dev/null 2>&1; then
  echo "${BIN}: command not found; skipping ${name} checks." >&2
  exit 0
fi
${hookCommand(name)}
`;
}

/**
 * The configured core.hooksPath value, or "" when unset. When this is set, git
 * ignores .git/hooks entirely, so wiring must account for it.
 * @param {string} [cwd] - Repo directory to read config from.
 * @returns {string} Configured value, trimmed, or "".
 */
export function hooksPathConfig(cwd = process.cwd()) {
  const result = run("git", ["config", "--get", "core.hooksPath"], { cwd });
  if (result.error || result.status !== 0) {
    return "";
  }
  return (result.stdout || "").trim();
}

/**
 * Whether a core.hooksPath value is husky-era wiring this tool used before
 * v3 (husky v9 sets `.husky/_`; husky v8 used `.husky`). These are safe to
 * migrate away from automatically; any other value belongs to another hook
 * manager and must be left alone.
 * @param {string} value - core.hooksPath value.
 * @returns {boolean} True for husky-created hooksPath values.
 */
export function isHuskyHooksPath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return normalized === ".husky/_" || normalized === ".husky";
}

/**
 * The directory git reads native hooks from, independent of core.hooksPath:
 * `<common dir>/hooks` (linked worktrees share the main repo's hooks).
 * @param {string} [cwd] - Repo directory to resolve from.
 * @returns {string|null} Hooks directory path, or null outside a repo.
 */
export function gitHooksDir(cwd = process.cwd()) {
  const result = run("git", ["rev-parse", "--git-common-dir"], { cwd });
  if (result.error || result.status !== 0) {
    return null;
  }
  const commonDir = (result.stdout || "").trim();
  if (!commonDir) {
    return null;
  }
  return path.join(commonDir, "hooks");
}

/**
 * Classify a hook file so repair logic can react appropriately:
 *   missing                → recreate from hookBody
 *   wired                  → our exact generated body; healthy
 *   custom-with-command    → user's own hook that still calls us; healthy
 *   custom-without-command → user's own hook that never calls us; a problem to
 *                            report but never overwrite.
 * @param {string} hooksDir - Directory containing the hook files.
 * @param {string} name - Hook name (e.g. "pre-commit").
 * @returns {"missing"|"wired"|"custom-with-command"|"custom-without-command"} Classification.
 */
export function classifyHook(hooksDir, name) {
  const hookPath = path.join(hooksDir, name);
  if (!fs.existsSync(hookPath)) {
    return "missing";
  }
  const content = fs.readFileSync(hookPath, "utf8");
  if (content === hookBody(name)) {
    return "wired";
  }
  const command = hookCommand(name);
  const invokesCommand = content.split(/\r?\n/).some((line) => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("#") && line.includes(command);
  });
  return invokesCommand ? "custom-with-command" : "custom-without-command";
}

/**
 * Write the generated hook file (creating the hooks dir if needed) and mark it
 * executable. Callers decide when writing is safe; this never checks content.
 * @param {string} hooksDir - Directory to write into.
 * @param {string} name - Hook name (e.g. "pre-commit").
 */
export function writeHook(hooksDir, name) {
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, name);
  fs.writeFileSync(hookPath, hookBody(name));
  fs.chmodSync(hookPath, 0o755);
}

// Exact hook bodies this tool generated into `.husky/` before v3 (2.x ran the
// bin; 1.x ran vendored scripts). Files matching these are OUR artifacts —
// safe to clean up — while anything else in `.husky/` is user-authored.
export const LEGACY_HUSKY_HOOK_BODIES = {
  "pre-commit": [
    "commitment-issues precommit\n",
    "node scripts/precommit-unified.mjs\n",
  ],
  "pre-push": ["commitment-issues prepush\n", "node scripts/prepush.mjs\n"],
};

/**
 * User-authored hook files still sitting in `.husky/` that git no longer runs
 * once core.hooksPath stops pointing there. Our own generated legacy wiring
 * and husky's runtime (`_`, `.gitignore`) are not the user's work, so they are
 * excluded.
 * @param {string} [cwd] - Project root to inspect.
 * @returns {string[]} Repo-relative paths (e.g. ".husky/commit-msg").
 */
export function leftoverHuskyHooks(cwd = process.cwd()) {
  const dir = path.join(cwd, ".husky");
  if (!fs.existsSync(dir)) {
    return [];
  }
  const leftovers = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === ".gitignore") {
      continue;
    }
    const ourBodies = LEGACY_HUSKY_HOOK_BODIES[entry.name];
    if (ourBodies) {
      const content = fs.readFileSync(path.join(dir, entry.name), "utf8");
      if (ourBodies.includes(content)) {
        continue;
      }
    }
    leftovers.push(`.husky/${entry.name}`);
  }
  return leftovers;
}

/**
 * The husky-era artifacts this tool generated that {@link removeLegacyHuskyWiring}
 * would delete: exact-match `.husky` hook files plus husky's runtime dir.
 * Exposed separately so a dry run can preview the exact same decision.
 * @param {string} [cwd] - Project root to inspect.
 * @returns {string[]} Repo-relative paths (e.g. ".husky/pre-commit").
 */
export function legacyHuskyWiringPaths(cwd = process.cwd()) {
  const dir = path.join(cwd, ".husky");
  if (!fs.existsSync(dir)) {
    return [];
  }
  const targets = [];
  for (const [name, bodies] of Object.entries(LEGACY_HUSKY_HOOK_BODIES)) {
    const hookPath = path.join(dir, name);
    if (
      fs.existsSync(hookPath) &&
      bodies.includes(fs.readFileSync(hookPath, "utf8"))
    ) {
      targets.push(`.husky/${name}`);
    }
  }
  if (fs.existsSync(path.join(dir, "_"))) {
    targets.push(".husky/_");
  }
  return targets;
}

/**
 * Delete the husky-era wiring this tool created: `.husky` hook files whose
 * bodies exactly match what we generated, husky's runtime dir (`.husky/_`),
 * and the `.husky` dir itself once empty. User-authored files are never
 * touched.
 * @param {string} [cwd] - Project root to clean.
 * @returns {string[]} Repo-relative paths that were removed.
 */
export function removeLegacyHuskyWiring(cwd = process.cwd()) {
  const removed = legacyHuskyWiringPaths(cwd);
  for (const target of removed) {
    fs.rmSync(path.join(cwd, target), { recursive: true, force: true });
  }
  if (removed.length > 0) {
    const dir = path.join(cwd, ".husky");
    const remaining = fs
      .readdirSync(dir)
      .filter((name) => name !== ".gitignore");
    if (remaining.length === 0) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return removed;
}
