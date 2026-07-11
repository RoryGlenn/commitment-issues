// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import spawn from "cross-spawn";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { loadPrecommitConfig } from "./config.mjs";

const require = createRequire(import.meta.url);

// Default ceiling for any tool the hooks spawn, so a hung tool can never wedge a
// commit indefinitely. Override with precommitChecks.timeoutMs (positive number).
const configuredTimeout = Number(loadPrecommitConfig().timeoutMs);
export const TOOL_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 120000;

/**
 * Run a command synchronously, capturing utf8 output. Uses cross-spawn so bare
 * command names (git, npx, node) resolve on Windows without a shell, which also
 * avoids the Node DEP0190 warning and shell arg-quoting pitfalls.
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {object} [options] - Extra spawnSync options.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Result.
 */
export function run(command, args, options = {}) {
  return spawn.sync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

// Resolve a tool's CLI entry from the nearest node_modules (via its package.json
// `bin` field) so it can be run with the current Node directly. This skips npx's
// per-call resolution/startup cost — a meaningful win on slow machines.
function resolveTool(name) {
  try {
    const pkgPath = require.resolve(`${name}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const rel =
      typeof pkg.bin === "string" ? pkg.bin : pkg.bin && pkg.bin[name];
    if (!rel) {
      return null;
    }
    return path.join(path.dirname(pkgPath), rel);
  } catch {
    return null;
  }
}

/**
 * Build a spawn invocation for a tool, preferring a direct `node <bin>` call and
 * falling back to npx when the tool can't be resolved locally.
 * @param {string} name - Package/bin name (e.g. "eslint").
 * @param {string[]} args - Tool arguments.
 * @returns {{command: string, args: string[]}} Invocation parts.
 */
export function toolInvocation(name, args) {
  const bin = resolveTool(name);
  if (bin) {
    return { command: process.execPath, args: [bin, ...args] };
  }
  return { command: "npx", args: [name, ...args] };
}

/**
 * Synchronous tool run via toolInvocation, with the standard timeout.
 * @param {string} name - Package/bin name.
 * @param {string[]} args - Tool arguments.
 * @param {object} [options] - Extra spawnSync options.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Result.
 */
export function runTool(name, args, options = {}) {
  const { command, args: fullArgs } = toolInvocation(name, args);
  return spawn.sync(command, fullArgs, {
    timeout: TOOL_TIMEOUT_MS,
    ...options,
  });
}

/**
 * Whether a package is installed in a project, i.e. present in a node_modules
 * reachable from that project's root. commitment-issues orchestrates peer tools
 * (eslint, prettier) it does not bundle; this lets `doctor`
 * advise when one is absent before {@link toolInvocation} silently degrades to a
 * slow npx fallback. It walks node_modules upward (as Node resolution does) and
 * checks for the package folder directly, so it stays correct for packages whose
 * `exports` map hides `package.json` and regardless of where
 * commitment-issues itself is installed.
 * @param {string} name - Package name (e.g. "eslint").
 * @param {string} [cwd] - Project root to resolve from (defaults to cwd).
 * @returns {boolean} True when the package is installed in the project.
 */
export function isPackageInstalled(name, cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, "node_modules", name, "package.json"))) {
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return false;
    }
    dir = parent;
  }
}

/**
 * Asynchronous spawn that resolves a spawnSync-shaped result
 * ({ error, status, signal, stdout, stderr }). Pass `echo: true` to tee the
 * child's output to this process live while still capturing it.
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {object} [options] - spawn options plus optional `echo`.
 * @returns {Promise<{error?: Error, status: number|null, signal: string|null, stdout: string, stderr: string}>} Result.
 */
export function spawnAsync(command, args, options = {}) {
  const { echo = false, ...spawnOptions } = options;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, spawnOptions);
    } catch (error) {
      resolve({ error, status: null, signal: null, stdout: "", stderr: "" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    // Cap runtime ourselves with an unref'd timer so a failed/errored spawn can
    // never keep the event loop alive (spawn's built-in timeout can linger).
    const timer = setTimeout(() => {
      child.kill();
      finish({
        error: undefined,
        status: null,
        signal: "SIGTERM",
        stdout,
        stderr,
      });
    }, TOOL_TIMEOUT_MS);
    timer.unref?.();

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (echo) {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (echo) {
          process.stderr.write(chunk);
        }
      });
    }

    child.on("error", (error) => {
      finish({ error, status: null, signal: null, stdout, stderr });
    });
    child.on("close", (status, signal) => {
      finish({ error: undefined, status, signal, stdout, stderr });
    });
  });
}
