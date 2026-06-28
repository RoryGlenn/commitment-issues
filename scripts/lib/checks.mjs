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
