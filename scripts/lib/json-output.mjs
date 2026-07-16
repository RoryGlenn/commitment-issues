// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";

export const JSON_OUTPUT_SCHEMA_VERSION = 1;

const CHECK_STATUSES = new Set(["passed", "advisory", "failed", "skipped"]);

const PROCESS_OUTCOMES = new Set([
  "success",
  "nonzero",
  "signal",
  "timeout",
  "spawn-error",
  "missing-tool",
]);

const RETRYABLE_WRITE_ERRORS = new Set(["EAGAIN", "EINTR"]);

/**
 * Write a complete value even when a pipe accepts only part of the buffer.
 * @param {number} fd - Destination file descriptor.
 * @param {string|Buffer} value - Bytes to write.
 * @param {typeof fs.writeSync} [writer=fs.writeSync] - Injectable writer.
 */
export function writeAllSync(fd, value, writer = fs.writeSync) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let offset = 0;
  while (offset < buffer.length) {
    let written;
    try {
      written = writer(fd, buffer, offset, buffer.length - offset);
    } catch (error) {
      if (RETRYABLE_WRITE_ERRORS.has(error.code)) continue;
      throw error;
    }
    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("Synchronous output write made no progress");
    }
    offset += written;
  }
}

/**
 * Allowed hook outcomes become advisory whenever another check has already
 * produced a finding; otherwise the caller's clean/disabled state is retained.
 * @param {object[]} findings - Findings accumulated before the final outcome.
 * @param {"clean"|"skipped"} emptyStatus - Status when there are no findings.
 * @returns {"advisory"|"clean"|"skipped"} Effective allowed status.
 */
export function allowedStatus(findings, emptyStatus) {
  return findings.length > 0 ? "advisory" : emptyStatus;
}

/**
 * Normalize both the legacy spawnSync-shaped result and the structured process
 * result introduced by the hardened runner. This keeps JSON consumers safe
 * while process.mjs changes land independently.
 * @param {object} result - Captured child-process result.
 * @returns {"success"|"nonzero"|"signal"|"timeout"|"spawn-error"|"missing-tool"}
 */
export function normalizeProcessOutcome(result) {
  if (PROCESS_OUTCOMES.has(result?.outcome)) {
    return result.outcome;
  }
  if (result?.timedOut === true || result?.error?.code === "ETIMEDOUT") {
    return "timeout";
  }
  if (result?.missingTool) {
    return "missing-tool";
  }
  if (result?.error) {
    return "spawn-error";
  }
  if (result?.signal) {
    // Legacy spawnAsync used SIGTERM as its timeout marker and did not expose a
    // timedOut flag. Structured results identify external signals explicitly.
    return result.signal === "SIGTERM" ? "timeout" : "signal";
  }
  if (result?.status === 0) {
    return "success";
  }
  if (typeof result?.status === "number") {
    return "nonzero";
  }
  return "spawn-error";
}

function normalizeDetails(detail) {
  if (Array.isArray(detail)) {
    return detail.map(String);
  }
  if (typeof detail === "string") {
    return detail.split("\n");
  }
  return [];
}

/**
 * Parse the opt-in JSON flag without changing legacy handling for invocations
 * that do not request JSON. Pre-push hooks may receive Git's remote name and
 * URL as positional arguments; pre-commit receives none.
 * @param {string[]} args - Entry-point arguments.
 * @param {number} [allowedPositionals=0] - Positional arguments Git supplies.
 * @returns {{enabled: boolean, positionals: string[], error: string|null}}
 */
export function parseJsonOutputArgs(args, allowedPositionals = 0) {
  const jsonCount = args.filter((arg) => arg === "--json").length;
  const invalidJsonForm = args.find((arg) => /^--json=/.test(arg));
  if (invalidJsonForm) {
    return {
      enabled: true,
      positionals: args,
      error: `unknown option '${invalidJsonForm}'; use --json without a value`,
    };
  }
  if (jsonCount > 1) {
    return {
      enabled: true,
      positionals: [],
      error: "--json may only be specified once",
    };
  }

  const enabled = jsonCount === 1;
  const positionals = args.filter((arg) => arg !== "--json");
  const unknownOption = positionals.find((arg) => arg.startsWith("-"));
  if (unknownOption) {
    return {
      enabled,
      positionals,
      error: `unknown option '${unknownOption}'`,
    };
  }
  if (positionals.length > allowedPositionals) {
    return {
      enabled,
      positionals,
      error: `expected at most ${allowedPositionals} positional argument${allowedPositionals === 1 ? "" : "s"}${enabled ? " with --json" : ""}`,
    };
  }
  return { enabled, positionals, error: null };
}

/**
 * Convert an internal advisory issue into the stable public finding shape.
 * @param {object} issue - Internal check issue.
 * @param {"warning"|"error"} [severity="warning"] - Finding severity.
 * @returns {object} JSON finding.
 */
export function issueToJsonFinding(issue, severity = "warning") {
  return {
    check: String(issue?.type || "unknown"),
    severity,
    message: String(issue?.message || "Unknown finding"),
    autoFixable: issue?.autoFixable === true,
    details: normalizeDetails(issue?.detail),
  };
}

/**
 * Stateful collector for a single command result. Human rendering remains in
 * the entry scripts; this module only models and serializes machine output.
 * @param {{command: "precommit"|"prepush", mode: "advisory"|"blocking"|"disabled"}} options
 * @returns {object} Result collector.
 */
export function createJsonOutput(options) {
  const checks = [];
  const diagnostics = [];

  return {
    addCheck(check) {
      const status = CHECK_STATUSES.has(check.status) ? check.status : "failed";
      checks.push({
        id: String(check.id),
        status,
        summary: String(check.summary),
        details:
          check.details && typeof check.details === "object"
            ? check.details
            : {},
      });
    },

    addDiagnostic(diagnostic) {
      diagnostics.push({
        severity: diagnostic.severity === "error" ? "error" : "warning",
        code: String(diagnostic.code),
        message: String(diagnostic.message),
      });
    },

    result({ status, exitCode, summary, findings = [], suggestions = [] }) {
      return {
        schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
        command: options.command,
        mode: options.mode,
        status,
        exitCode,
        summary,
        checks,
        findings,
        suggestions: suggestions.map((suggestion) => ({
          command: String(suggestion.command),
          description: String(suggestion.description),
        })),
        diagnostics,
      };
    },

    emit(resultOptions) {
      const payload = this.result(resultOptions);
      // Entry scripts intentionally use immediate process.exit calls to retain
      // their hook exit semantics. Pipes may accept only part of a synchronous
      // write, so drain the complete result before exiting.
      writeAllSync(process.stdout.fd, `${JSON.stringify(payload)}\n`);
      return payload;
    },
  };
}

/**
 * Emit an argument error using the same result envelope as a completed run.
 * @param {"precommit"|"prepush"} command - Requested command.
 * @param {string} message - Parse failure.
 */
export function emitJsonArgumentError(command, message) {
  const output = createJsonOutput({
    command,
    mode: "disabled",
  });
  output.addDiagnostic({
    severity: "error",
    code: "arguments.invalid",
    message,
  });
  output.emit({
    status: "error",
    exitCode: 1,
    summary: `Invalid ${command} arguments`,
  });
}
