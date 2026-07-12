// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import pc from "picocolors";
import { shortFileList } from "./files.mjs";

function normalizeTone(tone) {
  return tone === "fun" ? "fun" : "standard";
}

function normalizeInput(issuesOrOptions, context) {
  if (Array.isArray(issuesOrOptions)) {
    return {
      issues: issuesOrOptions,
      context: {
        ...context,
        tone: normalizeTone(context?.tone),
      },
    };
  }

  const options =
    issuesOrOptions && typeof issuesOrOptions === "object"
      ? issuesOrOptions
      : {};
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
    tone: normalizeTone(options.tone ?? context?.tone),
    commitCommand: options.commitCommand,
  };

  return { issues, context: normalizedContext };
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return count === 1 ? singular : pluralValue;
}

function funIssueMessage(issue, message) {
  const prettierMatch = issue.message.match(
    /^(\d+) file(s)? need Prettier formatting$/,
  );
  if (prettierMatch) {
    const count = Number(prettierMatch[1]);
    return `${count} ${plural(count, "file")} told Prettier ${count === 1 ? '"this is just how I am"' : '"this is just how we are"'}`;
  }

  const missingTestsMatch = issue.message.match(
    /^(\d+) staged source file(s)? missing unit tests$/,
  );
  if (missingTestsMatch) {
    const count = Number(missingTestsMatch[1]);
    return `${count} staged source ${plural(count, "file")} won't commit to ${count === 1 ? "a unit test" : "unit tests"}`;
  }

  const manualLintMatch = issue.message.match(
    /^(\d+) ESLint issue(s)? needing manual fixes$/,
  );
  if (manualLintMatch) {
    const count = Number(manualLintMatch[1]);
    return `${count} ESLint ${plural(count, "issue")} that flowers won't fix`;
  }

  const autoFixableLintMatch = issue.message.match(
    /^(\d+) auto-fixable ESLint issue(s)? found$/,
  );
  if (autoFixableLintMatch) {
    const count = Number(autoFixableLintMatch[1]);
    return `${count} ESLint ${plural(count, "issue")} ready to take you back, no questions asked`;
  }

  const failingTestsMatch = issue.message.match(
    /^(\d+) staged test file(s)? failing$/,
  );
  if (failingTestsMatch) {
    const count = Number(failingTestsMatch[1]);
    return `${count} staged test ${plural(count, "file")} just said "we need to talk"`;
  }

  const protectedBranchMatch = issue.message.match(
    /^Committing directly to protected branch "(.+)"$/,
  );
  if (protectedBranchMatch) {
    return `"${protectedBranchMatch[1]}" deserves a feature branch, not surprise commits`;
  }

  const largeFilesCommitMatch = issue.message.match(
    /^Large commit: (\d+) staged file(s)? \(limit \d+\)$/,
  );
  if (largeFilesCommitMatch) {
    const count = Number(largeFilesCommitMatch[1]);
    return `${count} staged ${plural(count, "file")} — less a commit, more a lifestyle choice`;
  }

  const largeLinesCommitMatch = issue.message.match(
    /^Large commit: (\d+) changed line(s)? \(limit \d+\)$/,
  );
  if (largeLinesCommitMatch) {
    const count = Number(largeLinesCommitMatch[1]);
    return `${count} changed ${plural(count, "line")} — that's not a commit, that's a memoir`;
  }

  const largeFileMatch = issue.message.match(
    /^(\d+) staged file(s)? over (\d+) MB$/,
  );
  if (largeFileMatch) {
    const count = Number(largeFileMatch[1]);
    return `${count} staged ${plural(count, "file")} that should really be seeing Git LFS`;
  }

  const generatedMatch = issue.message.match(
    /^(\d+) generated file(s)? staged$/,
  );
  if (generatedMatch) {
    const count = Number(generatedMatch[1]);
    return `${count} generated ${plural(count, "file")} trying to sneak into the commit`;
  }

  const behindMatch = issue.message.match(
    /^Branch is (\d+) commit(s)? behind (.+)$/,
  );
  if (behindMatch) {
    const count = Number(behindMatch[1]);
    return `${count} ${plural(count, "commit")} behind ${behindMatch[3]} — stacking more chaos on top`;
  }

  const secretsMatch = issue.message.match(
    /^(\d+) possible secret(s)? staged$/,
  );
  if (secretsMatch) {
    const count = Number(secretsMatch[1]);
    return `${count} possible ${plural(count, "secret")} this commit can't keep`;
  }

  return message;
}

// Fun-tone rewrites for the exact (count-free) tool-failure messages, so a
// fun-toned box never falls back to standard wording mid-relationship-note.
// Standard wording stays the source of truth; keys must match it exactly.
const FUN_EXACT_MESSAGES = {
  "ESLint timed out": "ESLint needed space and never texted back",
  "Prettier timed out": "Prettier needed space and never texted back",
  "Staged tests timed out":
    "The staged tests needed space and never texted back",
  "Unable to run ESLint": "ESLint won't even pick up the phone",
  "Unable to run Prettier": "Prettier won't even pick up the phone",
  "Unable to run staged tests": "The staged tests won't even pick up the phone",
};

function issueMessage(issue, tone = "standard") {
  if (issue.message === "ESLint failed before reporting any file issues") {
    return tone === "fun"
      ? "ESLint stormed off without saying what's wrong"
      : "ESLint failed to complete";
  }

  if (issue.message === "Prettier failed to complete") {
    return tone === "fun" ? "Prettier left you on read" : issue.message;
  }

  if (tone === "fun" && FUN_EXACT_MESSAGES[issue.message]) {
    return FUN_EXACT_MESSAGES[issue.message];
  }

  const match = issue.message.match(
    /^(\d+) file(s)? need Prettier formatting$/,
  );
  const message = match
    ? `${Number(match[1])} ${plural(Number(match[1]), "file")} with formatting issues`
    : issue.message;

  return tone === "fun" ? funIssueMessage(issue, message) : message;
}

/**
 * Builds the consolidated advisory message for the pre-commit box. Pure (no
 * I/O), so it can be unit-tested directly.
 * @param {Array<{type: string, message: string, autoFixable: boolean, detail?: string}>|object} issuesOrOptions - Detected issues, or an options object containing issues.
 * @param {{canInspectUnstagedFiles?: boolean, unstagedTrackedFiles?: string[], tone?: string}} [context] - Worktree context for the commit:fix recommendation.
 * @returns {{severity: string, lines: string[]}} Box severity and lines.
 */
export function buildAdvisoryMessage(issuesOrOptions, context = {}) {
  const normalized = normalizeInput(issuesOrOptions, context);
  const issues = normalized.issues;
  const {
    canInspectUnstagedFiles = true,
    unstagedTrackedFiles = [],
    tone = "standard",
    commitCommand = "npm run commit:fix",
  } = normalized.context;

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
    pc.dim(
      tone === "fun"
        ? "Commit will continue. Relationship notes:"
        : "Commit will continue. Suggestions:",
    ),
    "",
  ];

  issues.forEach((issue) => {
    lines.push(`${pc.yellow("→")} ${issueMessage(issue, tone)}`);
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
          ? tone === "fun"
            ? "patch things up where you can and amend it:"
            : "you can still apply automatic fixes and amend it:"
          : tone === "fun"
            ? "send the apology text and amend it:"
            : "apply automatic fixes and amend it:",
      ),
    );
    lines.push(`  ${pc.bold(commitCommand)}`);

    if (hasNonFixableIssue) {
      lines.push("");
      lines.push(
        pc.dim(
          tone === "fun"
            ? "commit:fix only smooths over the small stuff."
            : "commit:fix only auto-fixes formatting and fixable lint.",
        ),
      );
      lines.push(
        pc.dim(
          tone === "fun"
            ? "The rest can't be fixed over text."
            : "Manual items above still need your attention.",
        ),
      );
    }
  } else if (hasFixableIssue) {
    if (hasNonFixableIssue) {
      lines.push(
        pc.dim(
          tone === "fun"
            ? "The rest can't be fixed over text."
            : "Manual items above still need your attention.",
        ),
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
    lines.push(
      pc.dim(
        tone === "fun"
          ? "No automatic fix command. It's not the code, it's you."
          : "No automatic fix command for these issues.",
      ),
    );
  }

  return { severity: "warning", lines };
}

/**
 * Build the failure/unavailable message for the optional commit-msg check.
 * Successful checks stay silent, matching commitlint's normal hook behavior.
 * @param {{outcome?: "reported"|"missing-tool"|"missing-config"|"unreadable"|"timeout"|"unavailable", blocking?: boolean, tone?: string, detail?: string, installCommand?: string}} options - Result and presentation context.
 * @returns {{severity: "warning"|"error", lines: string[]}} Box model.
 */
export function buildCommitMessageCheckMessage(options = {}) {
  const {
    outcome = "unavailable",
    blocking = false,
    detail = "",
    installCommand = "",
  } = options;
  const tone = normalizeTone(options.tone);
  const fun = tone === "fun";

  const copy = {
    reported: {
      title: fun
        ? "Commit message sent mixed signals"
        : blocking
          ? "Commit blocked: commit message needs attention"
          : "Commit message needs attention",
      summary: fun
        ? "Commitlint found a few relationship rules this message missed."
        : "Commitlint reported a problem with this commit message or its configuration.",
    },
    "missing-tool": {
      title: fun
        ? "Commitlint stood this commit up"
        : "Commit-message check unavailable",
      summary: fun
        ? "The project-local commitlint CLI never showed."
        : "The project-local commitlint CLI is not installed.",
    },
    "missing-config": {
      title: fun
        ? "Commitlint needs relationship rules"
        : "Commitlint configuration not found",
      summary: fun
        ? "There is no project ruleset defining what commitment looks like."
        : "Commitlint requires a project configuration with at least one rule.",
    },
    unreadable: {
      title: fun
        ? "The commit message went missing"
        : "Unable to read the commit message",
      summary: fun
        ? "Git handed over a message file that could not be opened."
        : "The commit-msg hook did not receive a readable message file.",
    },
    timeout: {
      title: fun ? "Commitlint needed space" : "Commitlint timed out",
      summary: fun
        ? "It never texted back before the hook timeout."
        : "Commitlint did not finish before the configured timeout.",
    },
    unavailable: {
      title: fun
        ? "Commitlint left this commit on read"
        : "Commit-message check unavailable",
      summary: fun
        ? "The local CLI was present but could not finish the conversation."
        : "The project-local commitlint CLI could not be executed.",
    },
  }[outcome];

  const lines = [pc.bold(copy.title), "", pc.dim(copy.summary)];

  if (outcome === "missing-tool") {
    lines.push(
      "",
      pc.dim("No npx, network, or global-tool fallback was attempted."),
    );
    if (installCommand) {
      lines.push(pc.dim(`Install it in this project: ${installCommand}`));
    }
  }

  if (outcome === "missing-config") {
    lines.push(
      "",
      pc.dim("Add a commitlint config with your chosen rules."),
      pc.dim("No built-in Conventional Commits rules were substituted."),
    );
  }

  const trimmedDetail = String(detail).trim();
  if (trimmedDetail) {
    lines.push("", ...trimmedDetail.split(/\r?\n/).map((line) => pc.dim(line)));
  }

  lines.push(
    "",
    pc.dim(
      blocking
        ? fun
          ? "This commit is on pause because blocking mode is official."
          : "Commit blocked because commit-message enforcement is enabled."
        : fun
          ? "Commit will continue. Consider this a relationship note."
          : "Commit will continue because commit-message linting is advisory.",
    ),
  );
  if (blocking) {
    lines.push(
      pc.dim(
        "Fix the message or setup, or bypass once: git commit --no-verify",
      ),
    );
  }

  return { severity: blocking ? "error" : "warning", lines };
}

/**
 * Build the single final box for an allowed push with one or more advisory
 * findings. Test-runner output stays outside the box; this is the compact
 * command-level summary printed after it.
 * @param {{warnings?: string[], notes?: string[], details?: string[]}} options - Advisory findings and supporting context.
 * @returns {{severity: "warning", lines: string[]}} Box model.
 */
export function buildPushAllowedMessage(options = {}) {
  const warnings = Array.isArray(options.warnings)
    ? options.warnings.filter(Boolean)
    : [];
  const notes = Array.isArray(options.notes)
    ? options.notes.filter(Boolean)
    : [];
  const details = Array.isArray(options.details)
    ? options.details.filter(Boolean)
    : [];
  const count = warnings.length;
  const lines = [
    pc.bold(`Push allowed with ${count} warning${count === 1 ? "" : "s"}.`),
  ];

  if (warnings.length > 0) {
    lines.push(
      "",
      ...warnings.map((warning) => `${pc.yellow("→")} ${warning}`),
    );
  }
  if (details.length > 0) {
    lines.push("", ...details.map((detail) => pc.dim(detail)));
  }
  if (notes.length > 0) {
    lines.push("", ...notes.map((note) => pc.dim(note)));
  }

  return { severity: "warning", lines };
}

/**
 * Summarize an advisory test failure for the combined push warning model.
 * @param {{passed: number, failed: number}|null} summary - Parsed test counts.
 * @returns {string} Compact advisory finding.
 */
export function advisoryTestFailureWarning(summary) {
  if (!summary) {
    return "Tests failed (advisory)";
  }
  const failedCount = summary.failed;
  return `Tests failed (advisory): ${failedCount} related test${failedCount === 1 ? "" : "s"} failed (${summary.passed} passed, ${failedCount} failed)`;
}

/**
 * Fold secondary push warnings into an existing blocking outcome without
 * weakening its severity or printing another box.
 * @param {{severity: "info"|"success"|"warning"|"error", lines: string[]}} model - Primary push outcome.
 * @param {string[]} warnings - Secondary advisory findings.
 * @returns {{severity: "warning"|"error", lines: string[]}} Combined model.
 */
export function appendPushWarnings(model, warnings = []) {
  const filtered = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (filtered.length === 0) {
    return model;
  }

  return {
    severity: model.severity === "error" ? "error" : "warning",
    lines: [
      ...model.lines,
      "",
      pc.dim(
        filtered.length === 1 ? "Additional warning:" : "Additional warnings:",
      ),
      ...filtered.map((warning) => `${pc.yellow("→")} ${warning}`),
    ],
  };
}
