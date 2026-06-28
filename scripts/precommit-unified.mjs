import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import boxen from "boxen";
import pc from "picocolors";

const isWindows = process.platform === "win32";
const testSuffixes = [".test.js", ".spec.js", ".test.mjs", ".spec.mjs"];

function printBox(message, color = (value) => value, options = {}) {
  console.log(
    boxen(color(message), {
      padding: 1,
      borderStyle: "round",
      margin: {
        top: 1,
        bottom: 1,
      },
      ...options,
    }),
  );
}

function isTestFile(file) {
  return testSuffixes.some((suffix) => file.endsWith(suffix));
}

function findTestFile(file) {
  const dirname = path.dirname(file);
  const basename = path.basename(file, path.extname(file));

  const candidates = [
    ...testSuffixes.map((suffix) => path.join(dirname, `${basename}${suffix}`)),
    ...testSuffixes.map((suffix) =>
      path.join(dirname, "__tests__", `${basename}${suffix}`),
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function shortFileList(files, max = 3) {
  const shown = files.slice(0, max);
  if (shown.length === 0) {
    return "";
  }

  const extra = files.length - shown.length;
  if (extra > 0) {
    return `${shown.join(", ")} (+${extra} more)`;
  }

  return shown.join(", ");
}

const gitFiles = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"],
  {
    encoding: "utf8",
    shell: isWindows,
  },
);

if (gitFiles.error || gitFiles.status !== 0) {
  printBox(
    [
      pc.bold("Unable to inspect staged files."),
      "",
      pc.dim("Commit will continue. Verify Git is available in PATH."),
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );

  process.exit(0);
}

const stagedFiles = gitFiles.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const unstagedFilesResult = spawnSync("git", ["diff", "--name-only"], {
  encoding: "utf8",
  shell: isWindows,
});

const canInspectUnstagedFiles =
  !unstagedFilesResult.error && unstagedFilesResult.status === 0;
const unstagedTrackedFiles = canInspectUnstagedFiles
  ? unstagedFilesResult.stdout
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean)
  : [];

const stagedJsFiles = stagedFiles.filter((file) =>
  /\.(js|jsx|mjs)$/.test(file),
);
const stagedFormatFiles = stagedFiles.filter((file) =>
  /\.(js|jsx|mjs|json|css|scss|md|html|yml|yaml)$/.test(file),
);

let issues = [];
let eslintIssueCount = 0;
let formatIssueCount = 0;

if (stagedJsFiles.length > 0) {
  const missingTests = stagedJsFiles.filter(
    (file) => !isTestFile(file) && !findTestFile(file),
  );

  if (missingTests.length > 0) {
    issues.push({
      autoFixable: false,
      type: "tests",
      message: `${missingTests.length} staged source file${missingTests.length === 1 ? "" : "s"} missing unit tests`,
      detail: `${shortFileList(missingTests)}`,
    });
  }

  const eslintResult = spawnSync(
    "npx",
    [
      "eslint",
      "--cache",
      "--cache-strategy",
      "content",
      "--format",
      "json",
      ...stagedJsFiles,
    ],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
    },
  );

  if (eslintResult.error) {
    issues.push({
      autoFixable: false,
      type: "lint",
      message: "Unable to run ESLint",
      detail: "Check ESLint install and project config",
    });
  } else {
    try {
      const parsed = JSON.parse(eslintResult.stdout || "[]");
      eslintIssueCount = parsed.reduce(
        (sum, fileResult) =>
          sum + (fileResult.errorCount || 0) + (fileResult.warningCount || 0),
        0,
      );
    } catch {
      eslintIssueCount = 0;
    }

    if (eslintIssueCount > 0) {
      issues.push({
        autoFixable: true,
        type: "lint",
        message: `${eslintIssueCount} ESLint issue${eslintIssueCount === 1 ? "" : "s"} found`,
      });
    } else if ((eslintResult.status || 0) > 1) {
      issues.push({
        autoFixable: false,
        type: "lint",
        message: "ESLint failed to complete",
        detail: "Check your ESLint configuration",
      });
    }
  }
}

if (stagedFormatFiles.length > 0) {
  const prettierResult = spawnSync(
    "npx",
    ["prettier", "--list-different", "--ignore-unknown", ...stagedFormatFiles],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
    },
  );

  if (prettierResult.error) {
    issues.push({
      autoFixable: false,
      type: "format",
      message: "Unable to run Prettier",
      detail: "Check Prettier install and project config",
    });
  } else if ((prettierResult.status || 0) === 1) {
    const prettierFiles = `${prettierResult.stdout}\n${prettierResult.stderr}`
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    formatIssueCount = prettierFiles.length;

    issues.push({
      autoFixable: true,
      type: "format",
      message:
        formatIssueCount > 0
          ? `${formatIssueCount} file${formatIssueCount === 1 ? "" : "s"} with formatting issues`
          : "Formatting issues found",
      detail: formatIssueCount > 0 ? prettierFiles.join("\n") : undefined,
    });
  } else if ((prettierResult.status || 0) > 1) {
    issues.push({
      autoFixable: false,
      type: "format",
      message: "Prettier failed to complete",
      detail: "Check your Prettier configuration",
    });
  }
}

console.log("");

// Build consolidated message
let messageLines = [];
let color = pc.green;
let title = "success";

if (issues.length > 0) {
  color = pc.yellow;
  title = "warning";
  messageLines = [
    pc.bold("Pre-commit suggestions found"),
    "",
    pc.dim("Commit will continue. Issues detected:"),
    "",
  ];

  // Add each issue
  issues.forEach((issue) => {
    messageLines.push(`${pc.yellow("→")} ${issue.message}`);
    if (issue.detail) {
      issue.detail.split("\n").forEach((line) => {
        messageLines.push(`  ${pc.dim(line)}`);
      });
    }
  });

  const hasFixableIssue = issues.some((issue) => issue.autoFixable);
  const hasNonFixableIssue = issues.some((issue) => !issue.autoFixable);
  const canAmendLatestCommit =
    hasFixableIssue &&
    canInspectUnstagedFiles &&
    unstagedTrackedFiles.length === 0;

  messageLines.push("");
  if (canAmendLatestCommit) {
    messageLines.push(
      pc.dim(
        hasNonFixableIssue
          ? "After this commit completes, you can still apply automatic fixes and amend it:"
          : "After this commit completes, apply automatic fixes and amend it:",
      ),
    );
    messageLines.push(`  ${pc.bold("npm run commit:fix")}`);

    if (hasNonFixableIssue) {
      messageLines.push("");
      messageLines.push(
        pc.dim("Manual warnings above will still need your attention."),
      );
    }
  } else if (hasFixableIssue) {
    if (hasNonFixableIssue) {
      messageLines.push(
        pc.dim("Manual warnings above will still need your attention."),
      );

      messageLines.push("");
    }

    if (!canInspectUnstagedFiles) {
      messageLines.push(
        pc.dim(
          "The working tree could not be inspected for a safe post-commit amend.",
        ),
      );
    } else if (unstagedTrackedFiles.length > 0) {
      messageLines.push(
        pc.dim(
          "Other tracked changes will still be present after commit, so no automatic amend command is shown.",
        ),
      );
      messageLines.push(`  ${pc.dim(shortFileList(unstagedTrackedFiles))}`);
    }
  } else {
    messageLines.push(
      `  ${pc.dim("No automatic fix command for these issues.")}`,
    );
  }
} else {
  color = pc.green;
  title = "success";
  messageLines = [
    pc.bold("All pre-commit checks passed"),
    "",
    pc.dim("No suggestions found. Ready to commit!"),
  ];
}

printBox(messageLines.join("\n"), color, {
  title,
  titleAlignment: "center",
});

process.exit(0);
