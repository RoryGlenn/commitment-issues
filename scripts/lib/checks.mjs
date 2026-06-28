// Pure helpers for interpreting tool output (no child processes here).

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

export function parsePrettierList(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Extracts the non-auto-fixable ESLint messages so the hook can point at the
// exact file, location, and rule a developer must fix by hand. A message is
// considered manual when ESLint did not attach an automatic `fix`.
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

// Best-effort parse of a `node --test` run summary into { passed, failed }.
// Matches both the TAP reporter ("# pass 46") and the spec reporter
// ("ℹ pass 46"). Returns null when the output isn't recognizable (e.g. a
// custom pushTestCommand running jest/vitest), so callers can fall back to a
// generic message.
export function parseNodeTestSummary(output) {
  const pass = (output || "").match(/^[#ℹ\s]*pass\s+(\d+)\s*$/m);
  const fail = (output || "").match(/^[#ℹ\s]*fail\s+(\d+)\s*$/m);
  if (!pass && !fail) {
    return null;
  }
  return {
    passed: pass ? Number(pass[1]) : 0,
    failed: fail ? Number(fail[1]) : 0,
  };
}
