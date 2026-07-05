import fs from "node:fs";
import path from "node:path";

// Lockfiles map a project to the package manager that produced them. Order does
// not matter — each lockfile is unique to one manager. `npm` is the fallback.
const LOCKFILES = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "package-lock.json": "npm",
};

const KNOWN = new Set(["npm", "pnpm", "yarn", "bun"]);

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
