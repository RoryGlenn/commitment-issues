// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Pure helpers for interpreting tool output (no child processes here).

import path from "node:path";

/**
 * Totals ESLint JSON results into issue and auto-fixable counts.
 * @param {string} stdout - ESLint `--format json` output.
 * @returns {{issueCount: number, fixableCount: number}} Aggregated counts.
 */
export function summarizeEslintJson(stdout) {
  try {
    const parsed = JSON.parse(stdout || "[]");
    const issueCount = parsed.reduce(
      (sum, fileResult) =>
        sum + (fileResult.errorCount || 0) + (fileResult.warningCount || 0),
      0,
    );
    const fixableCount = parsed.reduce(
      (sum, fileResult) =>
        sum +
        (fileResult.fixableErrorCount || 0) +
        (fileResult.fixableWarningCount || 0),
      0,
    );
    return { issueCount, fixableCount };
  } catch {
    return { issueCount: 0, fixableCount: 0 };
  }
}

/**
 * Interpret Prettier's documented `--list-different` exit status before its
 * human-readable output: 0 means clean, 1 means the stdout paths differ, and
 * any other status means Prettier could not complete. Output text is never used
 * to infer a crash, so a legitimate filename containing "[error]" is safe.
 * @param {number|null} status - Prettier exit status.
 * @param {string} stdout - Prettier `--list-different` stdout.
 * @returns {{failed: boolean, files: string[]}} Classification and paths.
 */
export function parsePrettierList(status, stdout = "") {
  if (status !== 0 && status !== 1) {
    return { failed: true, files: [] };
  }

  return {
    failed: false,
    files:
      status === 1
        ? stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
  };
}

/**
 * Extracts the non-auto-fixable ESLint messages so the hook can point at the
 * exact file, location, and rule a developer must fix by hand. A message is
 * manual when ESLint did not attach an automatic `fix`.
 * @param {string} stdout - ESLint `--format json` output.
 * @returns {Array<{filePath: string, line: number, column: number, ruleId: string|null}>} Manual issues.
 */
export function eslintManualIssues(stdout) {
  try {
    const parsed = JSON.parse(stdout || "[]");
    const issues = [];
    for (const fileResult of parsed) {
      for (const message of fileResult.messages || []) {
        if (message.fix) {
          continue;
        }
        issues.push({
          filePath: fileResult.filePath,
          line: message.line,
          column: message.column,
          ruleId: message.ruleId,
        });
      }
    }
    return issues;
  } catch {
    return [];
  }
}

/**
 * Format one manual ESLint finding as a stable repo-relative location.
 * @param {{filePath: string, line?: number, column?: number, ruleId?: string|null}} issue - Parsed ESLint issue.
 * @param {string} cwd - Repository root.
 * @returns {string} Human-readable file, location, and optional rule.
 */
export function formatEslintManualIssue(issue, cwd) {
  const relative = path.relative(cwd, issue.filePath);
  const file = relative || issue.filePath;
  const location = issue.line ? `${file}:${issue.line}:${issue.column}` : file;
  return issue.ruleId ? `${location} (${issue.ruleId})` : location;
}

/**
 * Best-effort parse of a `node --test` run summary. Handles the TAP reporter
 * ("# pass 46") and spec reporter ("i pass 46"), and strips ANSI first.
 * @param {string} output - Test runner output.
 * @returns {{passed: number, failed: number}|null} Counts, or null if unrecognized.
 */
export function parseNodeTestSummary(output) {
  // Strip ANSI color codes so colored reporter output still parses.
  const clean = (output || "").replace(/\u001b\[[0-9;]*m/g, "");
  const pass = clean.match(/^[#\u2139\s]*pass\s+(\d+)\s*$/m);
  const fail = clean.match(/^[#\u2139\s]*fail\s+(\d+)\s*$/m);
  if (!pass && !fail) {
    return null;
  }
  return {
    passed: pass ? Number(pass[1]) : 0,
    failed: fail ? Number(fail[1]) : 0,
  };
}
