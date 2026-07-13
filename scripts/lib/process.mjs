// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import spawn from "cross-spawn";
import fs from "node:fs";
import path from "node:path";
import { loadPrecommitConfig, MAX_TIMEOUT_MS } from "./config.mjs";

// Default ceiling for any tool the hooks spawn, so a hung tool can never wedge a
// commit indefinitely. Override with precommitChecks.timeoutMs (positive number
// no greater than Node's maximum timer delay).
const configuredTimeout = Number(loadPrecommitConfig().timeoutMs);
export const TOOL_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 120000;

/**
 * @typedef {"success" | "nonzero" | "signal" | "timeout" | "spawn-error" | "missing-tool"} ProcessOutcome
 */

/**
 * Add one stable outcome to a child-process result. Consumers should branch on
 * `outcome` instead of inferring timeouts from a signal or spawn failures from
 * a null status.
 * @param {object} result - Raw process fields.
 * @param {boolean} [result.timedOut] - Whether our deadline fired.
 * @param {Error} [result.error] - Spawn error.
 * @param {number|null} [result.status] - Exit status.
 * @param {string|null} [result.signal] - Terminating signal.
 * @param {string} [result.stdout] - Captured stdout.
 * @param {string} [result.stderr] - Captured stderr.
 * @returns {object & {outcome: ProcessOutcome, timedOut: boolean}} Structured result.
 */
function withOutcome(result) {
  const timedOut =
    result.timedOut === true || result.error?.code === "ETIMEDOUT";
  let outcome;
  if (result.missingTool) {
    outcome = "missing-tool";
  } else if (timedOut) {
    outcome = "timeout";
  } else if (result.error) {
    outcome = "spawn-error";
  } else if (result.signal) {
    outcome = "signal";
  } else if (result.status === 0) {
    outcome = "success";
  } else if (typeof result.status === "number") {
    outcome = "nonzero";
  } else {
    outcome = "spawn-error";
  }
  return { ...result, outcome, timedOut };
}

/**
 * Run a command synchronously, capturing utf8 output. Uses cross-spawn so bare
 * command names (git, node) resolve on Windows without a shell, which also
 * avoids the Node DEP0190 warning and shell arg-quoting pitfalls.
 *
 * Long-running tool and configurable-command paths use {@link spawnAsync}, whose
 * timeout can clean up descendants. `run` is retained for short Git probes.
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {object} [options] - Extra spawnSync options.
 * @returns {import("node:child_process").SpawnSyncReturns<string> & {outcome: ProcessOutcome, timedOut: boolean}} Result.
 */
export function run(command, args, options = {}) {
  return withOutcome(
    spawn.sync(command, args, {
      encoding: "utf8",
      ...options,
    }),
  );
}

/**
 * Find a package manifest in the project's reachable node_modules tree.
 * Resolution deliberately starts at the project cwd, not this package's own
 * install directory, so a bundled/development copy cannot mask a missing peer.
 * @param {string} name - Package name.
 * @param {string} cwd - Project root.
 * @returns {string|null} Manifest path.
 */
function findPackageManifest(name, cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const manifest = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(manifest)) {
      return manifest;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

// Resolve a tool's CLI entry from the project's nearest node_modules (via its
// package.json `bin` field) so it can be run with the current Node directly.
// There is intentionally no npx fallback: a missing peer must never turn a Git
// hook into an implicit registry query or install.
function resolveTool(name, cwd) {
  try {
    const pkgPath = findPackageManifest(name, cwd);
    if (!pkgPath) {
      return null;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const rel =
      typeof pkg.bin === "string" ? pkg.bin : pkg.bin && pkg.bin[name];
    if (!rel) {
      return null;
    }
    const bin = path.resolve(path.dirname(pkgPath), rel);
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

/**
 * Build a local-only spawn invocation for a peer tool.
 * @param {string} name - Package/bin name (e.g. "eslint").
 * @param {string[]} args - Tool arguments.
 * @param {string} [cwd] - Project root used for node_modules resolution.
 * @returns {{command: string, args: string[], missingTool?: undefined} | {command: null, args: [], missingTool: string}} Invocation parts or a structured missing-tool result.
 */
export function toolInvocation(name, args, cwd = process.cwd()) {
  const bin = resolveTool(name, cwd);
  if (bin) {
    return { command: process.execPath, args: [bin, ...args] };
  }
  return { command: null, args: [], missingTool: name };
}

/**
 * Whether a package is installed in a project, i.e. present in a node_modules
 * reachable from that project's root. commitment-issues orchestrates peer tools
 * (eslint, prettier) but does not bundle or download them.
 * @param {string} name - Package name (e.g. "eslint").
 * @param {string} [cwd] - Project root to resolve from (defaults to cwd).
 * @returns {boolean} True when the package is installed in the project.
 */
export function isPackageInstalled(name, cwd = process.cwd()) {
  return findPackageManifest(name, cwd) !== null;
}

/**
 * Whether a project-local package exposes an existing executable bin.
 * @param {string} name - Package/bin name.
 * @param {string} [cwd] - Project root to resolve from.
 * @returns {boolean} True when the tool can be invoked locally.
 */
export function isToolInstalled(name, cwd = process.cwd()) {
  return resolveTool(name, cwd) !== null;
}

/**
 * Whether a configured command invokes Node's built-in test runner.
 * @param {string[]} command - Executable plus configured arguments.
 * @returns {boolean} True for node/node.exe commands containing --test.
 */
export function isNodeTestCommand(command) {
  return (
    Array.isArray(command) &&
    /(^|[/\\])node(\.exe)?$/i.test(command[0] || "") &&
    command.includes("--test")
  );
}

/**
 * Build Node test-runner arguments with discovered paths behind `--`. This
 * prevents a legal repository pathname beginning with `-` from being parsed as
 * a Node option. An existing separator is normalized so injected reporter
 * options remain before it and configured positional arguments remain after it.
 * @param {string[]} command - Node executable plus configured arguments.
 * @param {string[]} files - Discovered test paths.
 * @param {string[]} [injectedOptions] - Additional Node options.
 * @returns {string[]} Arguments excluding the Node executable.
 */
export function nodeTestArguments(command, files, injectedOptions = []) {
  const configured = command.slice(1);
  const separator = configured.indexOf("--");
  const options =
    separator === -1 ? configured : configured.slice(0, separator);
  const positionals = separator === -1 ? [] : configured.slice(separator + 1);
  // Node's test runner can still mis-handle a leading-hyphen relative pathname
  // after `--`; an absolute path is unambiguously positional on every platform.
  const safeFiles = files.map((file) =>
    file.startsWith("-") ? path.resolve(file) : file,
  );
  return [...options, ...injectedOptions, "--", ...positionals, ...safeFiles];
}

/**
 * Force-terminate a spawned process and its still-attached descendants.
 * POSIX children are launched as process-group leaders, so a negative pid kills
 * the group. Windows uses the built-in taskkill tree operation. Both paths fall
 * back to killing the direct child if the tree operation is unavailable.
 * @param {import("node:child_process").ChildProcess} child - Spawned child.
 * @param {NodeJS.Platform} [platform] - Platform strategy to use.
 * @param {Function} [taskkill] - Synchronous taskkill runner.
 * @param {Function} [killGroup] - POSIX process-group signal function.
 * @returns {"process-group" | "taskkill-tree" | "direct-child" | "already-exited"} Cleanup method.
 */
export function terminateProcessTree(
  child,
  platform = process.platform,
  taskkill = spawn.sync,
  killGroup = process.kill,
) {
  if (!child.pid) {
    return "already-exited";
  }

  if (platform === "win32") {
    const killed = taskkill(
      "taskkill",
      ["/pid", String(child.pid), "/t", "/f"],
      { stdio: "ignore", windowsHide: true },
    );
    if (!killed.error && killed.status === 0) {
      return "taskkill-tree";
    }
  } else {
    try {
      killGroup(-child.pid, "SIGKILL");
      return "process-group";
    } catch (error) {
      if (error?.code === "ESRCH") {
        return "already-exited";
      }
    }
  }

  try {
    child.kill("SIGKILL");
    return "direct-child";
  } catch {
    return "already-exited";
  }
}

/**
 * Whether a spawned child should lead a dedicated POSIX process group.
 * Windows uses taskkill for descendant cleanup instead.
 * @param {NodeJS.Platform} platform - Runtime platform.
 * @returns {boolean} True when the child should be detached.
 */
export function detachedForPlatform(platform) {
  return platform !== "win32";
}

/**
 * Asynchronous spawn with a structured outcome. Pass `echo: true` to tee the
 * child's output live while still capturing it. `timeoutMs` overrides the
 * configured tool deadline for a single call and is not forwarded to spawn.
 *
 * On POSIX, the child leads a new process group so timeout cleanup includes its
 * descendants. On Windows, timeout cleanup uses `taskkill /t /f`.
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {object} [options] - spawn options plus optional `echo`/`timeoutMs`.
 * @returns {Promise<{outcome: ProcessOutcome, timedOut: boolean, error?: Error, status: number|null, signal: string|null, stdout: string, stderr: string, cleanup?: string}>} Result.
 */
export function spawnAsync(command, args, options = {}) {
  const {
    echo = false,
    timeoutMs = TOOL_TIMEOUT_MS,
    ...spawnOptions
  } = options;
  return new Promise((resolve) => {
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > MAX_TIMEOUT_MS
    ) {
      const error = new RangeError(
        `timeoutMs must be a positive finite number no greater than ${MAX_TIMEOUT_MS}`,
      );
      error.code = "ERR_OUT_OF_RANGE";
      resolve(
        withOutcome({
          error,
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      );
      return;
    }

    let child;
    try {
      child = spawn(command, args, {
        ...spawnOptions,
        // A dedicated process group is required for safe descendant cleanup on
        // macOS/Linux. Windows process trees are handled by taskkill instead.
        detached: detachedForPlatform(process.platform),
        windowsHide: true,
      });
    } catch (error) {
      resolve(
        withOutcome({
          error,
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      );
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
      resolve(withOutcome(payload));
    };
    const timer = setTimeout(() => {
      const cleanup = terminateProcessTree(child);
      finish({
        error: undefined,
        status: null,
        signal: null,
        stdout,
        stderr,
        timedOut: true,
        cleanup,
      });
    }, timeoutMs);

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

/**
 * Run a project-local peer tool with the standard timeout and structured result.
 * Missing tools return immediately; they are never delegated to npx.
 * @param {string} name - Package/bin name.
 * @param {string[]} args - Tool arguments.
 * @param {object} [options] - Extra spawn options.
 * @returns {Promise<object & {outcome: ProcessOutcome}>} Structured result.
 */
export function runTool(name, args, options = {}) {
  const invocation = toolInvocation(name, args, options.cwd ?? process.cwd());
  if (invocation.missingTool) {
    return Promise.resolve(
      withOutcome({
        missingTool: name,
        error: undefined,
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
      }),
    );
  }
  return spawnAsync(invocation.command, invocation.args, options);
}
