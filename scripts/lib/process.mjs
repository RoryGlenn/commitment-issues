import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { loadPrecommitConfig } from "./config.mjs";

const require = createRequire(import.meta.url);

export const isWindows = process.platform === "win32";

// Default ceiling for any tool the hooks spawn, so a hung tool can never wedge a
// commit indefinitely. Override with precommitChecks.timeoutMs (positive number).
const configuredTimeout = Number(loadPrecommitConfig().timeoutMs);
export const TOOL_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 120000;

/**
 * Run a command synchronously, capturing utf8 output (shell on Windows).
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {object} [options] - Extra spawnSync options.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Result.
 */
export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: isWindows,
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
 * @returns {{command: string, args: string[], shell: boolean}} Invocation parts.
 */
export function toolInvocation(name, args) {
  const bin = resolveTool(name);
  if (bin) {
    return { command: process.execPath, args: [bin, ...args], shell: false };
  }
  return { command: "npx", args: [name, ...args], shell: isWindows };
}

/**
 * Synchronous tool run via toolInvocation, with the standard timeout.
 * @param {string} name - Package/bin name.
 * @param {string[]} args - Tool arguments.
 * @param {object} [options] - Extra spawnSync options.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Result.
 */
export function runTool(name, args, options = {}) {
  const { command, args: fullArgs, shell } = toolInvocation(name, args);
  return spawnSync(command, fullArgs, {
    shell,
    timeout: TOOL_TIMEOUT_MS,
    ...options,
  });
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
