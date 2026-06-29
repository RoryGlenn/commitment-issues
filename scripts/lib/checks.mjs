// Pure helpers for interpreting tool output (no child processes here).

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
 * @param {string} output - Prettier `--list-different` output.
 * @returns {string[]} Trimmed, non-empty file paths.
 */
export function parsePrettierList(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
 * Best-effort parse of a `node --test` run summary. Handles the TAP reporter
 * ("# pass 46") and spec reporter ("ℹ pass 46"), and strips ANSI first.
 * @param {string} output - Test runner output.
 * @returns {{passed: number, failed: number}|null} Counts, or null if unrecognized.
 */
export function parseNodeTestSummary(output) {
  // Strip ANSI color codes so colored reporter output still parses.
  const clean = (output || "").replace(/\u001b\[[0-9;]*m/g, "");
  const pass = clean.match(/^[#ℹ\s]*pass\s+(\d+)\s*$/m);
  const fail = clean.match(/^[#ℹ\s]*fail\s+(\d+)\s*$/m);
  if (!pass && !fail) {
    return null;
  }
  return {
    passed: pass ? Number(pass[1]) : 0,
    failed: fail ? Number(fail[1]) : 0,
  };
}
