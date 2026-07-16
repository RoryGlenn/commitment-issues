// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";

// Lockfiles map a project to the package manager that produced them. A repo
// mid-migration can contain more than one, so insertion order is the tiebreak:
// the first match below wins. `npm` is the fallback when none match.
const LOCKFILES = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "package-lock.json": "npm",
};

const KNOWN = new Set(["npm", "pnpm", "yarn", "bun"]);
const RECOMMENDED_DEV_SPECS = new Map([
  ["eslint", "eslint@^9"],
  ["prettier", "prettier@^3"],
]);

/**
 * Whether package-manager mutations must explicitly target the workspace root.
 * Malformed or absent project metadata stays fail-soft because this helper is
 * used only to format recovery guidance after another check already failed.
 * @param {string} [cwd] - Project root to inspect.
 * @returns {boolean} Whether cwd declares a package-manager workspace.
 */
export function isWorkspaceRoot(cwd = process.cwd()) {
  if (fs.existsSync(path.join(cwd, "pnpm-workspace.yaml"))) {
    return true;
  }
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
    );
    const workspaces = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces?.packages;
    return Array.isArray(workspaces) && workspaces.length > 0;
  } catch {
    return false;
  }
}

/**
 * Whether the active Yarn project uses Yarn Berry rather than Yarn Classic.
 * Supported Berry projects carry `.yarnrc.yml` for `nodeLinker: node-modules`;
 * the user-agent check also keeps manager-invoked guidance accurate before a
 * project configuration file is inspected.
 * @param {string} [cwd] - Project root to inspect.
 * @returns {boolean} Whether the project is using Yarn 2 or newer.
 */
export function isYarnBerry(cwd = process.cwd()) {
  const agent = process.env.npm_config_user_agent || "";
  const major = Number(/^yarn\/(\d+)/u.exec(agent)?.[1] ?? 0);
  return major >= 2 || fs.existsSync(path.join(cwd, ".yarnrc.yml"));
}

/**
 * Detect the package manager driving a project.
 *
 * Prefers `npm_config_user_agent` (set by the manager that invoked the current
 * process, so it is accurate for `run`/`prepare`), then falls back to lockfile
 * presence (reliable at hook time, when Git invokes the hook with no manager in
 * the environment). Defaults to npm.
 * @param {string} [cwd] - Project root to inspect for lockfiles.
 * @returns {"npm" | "pnpm" | "yarn" | "bun"} The detected package manager.
 */
export function detectPackageManager(cwd = process.cwd()) {
  const agent = process.env.npm_config_user_agent || "";
  const fromAgent = agent.split("/")[0];
  if (KNOWN.has(fromAgent)) {
    return fromAgent;
  }

  for (const [lockfile, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(cwd, lockfile))) {
      return manager;
    }
  }

  return "npm";
}

/**
 * The command a user runs to invoke an npm script under their package manager.
 * `<manager> run <script>` is valid for npm, pnpm, yarn (v1 + berry), and bun,
 * so a single form covers every supported manager.
 * @param {string} script - The npm script name (e.g. "commit:fix").
 * @param {string} [cwd] - Project root, forwarded to detectPackageManager.
 * @returns {string} e.g. "pnpm run commit:fix".
 */
export function runScript(script, cwd) {
  return `${detectPackageManager(cwd)} run ${script}`;
}

/**
 * The install command for the detected package manager (e.g. "pnpm install").
 * Every supported manager accepts `<manager> install`.
 * @param {string} [cwd] - Project root, forwarded to detectPackageManager.
 * @returns {string} e.g. "pnpm install".
 */
export function installCommand(cwd) {
  return `${detectPackageManager(cwd)} install`;
}

/**
 * The command to add dev dependencies under the detected package manager, e.g.
 * "npm install -D a b" or "pnpm add -D a b". Baseline ESLint/Prettier hints
 * stay on the majors verified at the exact minimum Node version.
 * @param {string[]} packages - Package names to install.
 * @param {string} [cwd] - Project root, forwarded to detectPackageManager.
 * @returns {string} e.g. "yarn add -D eslint prettier".
 */
export function devInstallCommand(packages, cwd) {
  const list = packages
    .map((name) => RECOMMENDED_DEV_SPECS.get(name) ?? name)
    .join(" ");
  const workspaceRoot = isWorkspaceRoot(cwd);
  switch (detectPackageManager(cwd)) {
    case "pnpm":
      return `pnpm add -D${workspaceRoot ? " --workspace-root" : ""} ${list}`;
    case "yarn":
      return `yarn add -D${workspaceRoot && !isYarnBerry(cwd) ? " --ignore-workspace-root-check" : ""} ${list}`;
    case "bun":
      return `bun add --dev ${list}`;
    default:
      return `npm install -D ${list}`;
  }
}

/**
 * The command to remove packages with the detected package manager.
 *
 * @param {string[]} packages - Package names to remove.
 * @param {string} [cwd] - Project root, forwarded to detectPackageManager.
 * @returns {string} e.g. "pnpm remove commitment-issues".
 */
export function removeCommand(packages, cwd) {
  const manager = detectPackageManager(cwd);
  const workspaceRoot = isWorkspaceRoot(cwd);
  const rootFlag =
    workspaceRoot && manager === "pnpm"
      ? " --workspace-root"
      : workspaceRoot && manager === "yarn" && !isYarnBerry(cwd)
        ? " --ignore-workspace-root-check"
        : "";
  return `${manager} remove${rootFlag} ${packages.join(" ")}`;
}
