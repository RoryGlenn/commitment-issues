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

function quoteForShell(value) {
  if (isWindows) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
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

const stagedJsFiles = stagedFiles.filter((file) => /\.(js|jsx|mjs)$/.test(file));
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
      type: "tests",
      message: `${missingTests.length} staged source file${missingTests.length === 1 ? "" : "s"} missing unit tests`,
      detail: `Examples: ${shortFileList(missingTests)}`,
    });
  }

  const eslintResult = spawnSync(
    "npx",
    ["eslint", "--cache", "--cache-strategy", "content", "--format", "json", ...stagedJsFiles],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
    },
  );

  if (eslintResult.error) {
    issues.push({
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
        type: "lint",
        message: `${eslintIssueCount} ESLint issue${eslintIssueCount === 1 ? "" : "s"} found`,
      });
    } else if ((eslintResult.status || 0) > 1) {
      issues.push({
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
      type: "format",
      message:
        formatIssueCount > 0
          ? `${formatIssueCount} file${formatIssueCount === 1 ? "" : "s"} with formatting issues`
          : "Formatting issues found",
    });
  } else if ((prettierResult.status || 0) > 1) {
    issues.push({
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
      messageLines.push(`  ${pc.dim(issue.detail)}`);
    }
  });

  const hasLintIssue = issues.some((issue) => issue.type === "lint");
  const hasFormatIssue = issues.some((issue) => issue.type === "format");

  const eslintFixCommand =
    hasLintIssue && stagedJsFiles.length > 0
      ? `npx eslint --fix ${stagedJsFiles.map(quoteForShell).join(" ")}`
      : null;
  const prettierFixCommand =
    hasFormatIssue && stagedFormatFiles.length > 0
      ? `npx prettier --write ${stagedFormatFiles.map(quoteForShell).join(" ")}`
      : null;

  messageLines.push("");
  messageLines.push(pc.dim("Run on staged files only:"));

  if (eslintFixCommand) {
    messageLines.push(`  ${pc.bold(eslintFixCommand)}`);
  }

  if (prettierFixCommand) {
    messageLines.push(`  ${pc.bold(prettierFixCommand)}`);
  }

  if (!eslintFixCommand && !prettierFixCommand) {
    messageLines.push(`  ${pc.dim("No automatic fix command for these issues.")}`);
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
