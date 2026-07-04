import pc from "picocolors";
import { shortFileList } from "./files.mjs";

function normalizeInput(issuesOrOptions, context) {
  if (Array.isArray(issuesOrOptions)) {
    return { issues: issuesOrOptions, context };
  }

  const options =
    issuesOrOptions && typeof issuesOrOptions === "object" ? issuesOrOptions : {};
  const issues = Array.isArray(options.issues) ? options.issues : [];
  const normalizedContext = {
    canInspectUnstagedFiles:
      typeof options.canInspectUnstagedFiles === "boolean"
        ? options.canInspectUnstagedFiles
        : true,
    unstagedTrackedFiles: Array.isArray(options.unstagedTrackedFiles)
      ? options.unstagedTrackedFiles
      : Array.isArray(options.dirtyTrackedFiles)
        ? options.dirtyTrackedFiles
        : [],
  };

  return { issues, context: normalizedContext };
}

function issueMessage(issue) {
  if (issue.message === "ESLint failed before reporting any file issues") {
    return "ESLint failed to complete";
  }

  const match = issue.message.match(/^(\d+) file(s)? need Prettier formatting$/);
  if (!match) {
    return issue.message;
  }

  const count = Number(match[1]);
  return `${count} file${count === 1 ? "" : "s"} with formatting issues`;
}

/**
 * Builds the consolidated advisory message for the pre-commit box. Pure (no
 * I/O), so it can be unit-tested directly.
 * @param {Array<{type: string, message: string, autoFixable: boolean, detail?: string}>|object} issuesOrOptions - Detected issues, or an options object containing issues.
 * @param {{canInspectUnstagedFiles?: boolean, unstagedTrackedFiles?: string[]}} [context] - Worktree context for the commit:fix recommendation.
 * @returns {{severity: string, lines: string[]}} Box severity and lines.
 */
export function buildAdvisoryMessage(issuesOrOptions, context = {}) {
  const normalized = normalizeInput(issuesOrOptions, context);
  const issues = normalized.issues;
  const { canInspectUnstagedFiles = true, unstagedTrackedFiles = [] } =
    normalized.context;

  if (issues.length === 0) {
    return {
      severity: "success",
      lines: [
        pc.bold("All pre-commit checks passed"),
        "",
        pc.dim("No suggestions found. Ready to commit!"),
      ],
    };
  }

  const lines = [
    pc.bold("Pre-commit suggestions found"),
    "",
    pc.dim("Commit will continue. Suggestions:"),
    "",
  ];

  issues.forEach((issue) => {
    lines.push(`${pc.yellow("→")} ${issueMessage(issue)}`);
    if (issue.detail) {
      issue.detail.split("\n").forEach((line) => {
        lines.push(`  ${pc.dim(line)}`);
      });
    }
  });

  const hasFixableIssue = issues.some((issue) => issue.autoFixable);
  const hasNonFixableIssue = issues.some((issue) => !issue.autoFixable);
  const canAmendLatestCommit =
    hasFixableIssue &&
    canInspectUnstagedFiles &&
    unstagedTrackedFiles.length === 0;

  lines.push("");
  if (canAmendLatestCommit) {
    lines.push(
      pc.dim(
        hasNonFixableIssue
          ? "you can still apply automatic fixes and amend it:"
          : "apply automatic fixes and amend it:",
      ),
    );
    lines.push(`  ${pc.bold("npm run commit:fix")}`);

    if (hasNonFixableIssue) {
      lines.push("");
      lines.push(
        pc.dim("commit:fix only auto-fixes formatting and fixable lint."),
      );
      lines.push(pc.dim("Manual items above still need your attention."));
    }
  } else if (hasFixableIssue) {
    if (hasNonFixableIssue) {
      lines.push(pc.dim("Manual items above still need your attention."));
      lines.push("");
    }

    if (!canInspectUnstagedFiles) {
      lines.push(
        pc.dim(
          "The working tree could not be inspected for a safe post-commit amend.",
        ),
      );
    } else if (unstagedTrackedFiles.length > 0) {
      lines.push(
        pc.dim(
          "Other tracked changes will still be present after commit, so no automatic amend command is shown.",
        ),
      );
      lines.push(`  ${pc.dim(shortFileList(unstagedTrackedFiles))}`);
    }
  } else {
    lines.push(`  ${pc.dim("No automatic fix command for these issues.")}`);
  }

  return { severity: "warning", lines };
}
