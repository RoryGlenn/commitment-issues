import pc from "picocolors";
import { shortFileList } from "./files.mjs";

// Builds the consolidated advisory message for the pre-commit box from the
// detected issues. Pure: no I/O. Returns { severity, lines }.
//
// Each issue is { type, message, autoFixable, detail? }.
export function buildAdvisoryMessage(issues, context = {}) {
  const { canInspectUnstagedFiles = true, unstagedTrackedFiles = [] } = context;

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
    pc.dim("Commit will continue. Issues detected:"),
    "",
  ];

  issues.forEach((issue) => {
    lines.push(`${pc.yellow("→")} ${issue.message}`);
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
          ? "After this commit completes, you can still apply automatic fixes and amend it:"
          : "After this commit completes, apply automatic fixes and amend it:",
      ),
    );
    lines.push(`  ${pc.bold("npm run commit:fix")}`);

    if (hasNonFixableIssue) {
      lines.push("");
      lines.push(
        pc.dim("Manual warnings above will still need your attention."),
      );
    }
  } else if (hasFixableIssue) {
    if (hasNonFixableIssue) {
      lines.push(
        pc.dim("Manual warnings above will still need your attention."),
      );
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
