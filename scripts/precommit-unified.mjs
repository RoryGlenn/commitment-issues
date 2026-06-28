import { spawnSync } from "node:child_process";
import boxen from "boxen";
import pc from "picocolors";

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

const gitFiles = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"],
  {
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);

const stagedJsFiles = gitFiles.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter((file) => file && /\.(js|jsx|mjs)$/.test(file));

let issues = [];
let eslintIssueCount = 0;

if (stagedJsFiles.length > 0) {
  const eslintResult = spawnSync("npx", ["eslint", "--format", "json", ...stagedJsFiles], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  if (eslintResult.stdout) {
    try {
      const parsed = JSON.parse(eslintResult.stdout);
      eslintIssueCount = parsed.reduce(
        (sum, fileResult) => sum + (fileResult.errorCount || 0) + (fileResult.warningCount || 0),
        0,
      );
    } catch {
      eslintIssueCount = 0;
    }
  }
}

// Check for test file issues
if (stagedJsFiles.length > 0) {
  const checkTests = spawnSync(
    "node",
    ["scripts/check-tests.mjs", ...stagedJsFiles],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );

  if (checkTests.error) {
    issues.push({
      type: "tests",
      message: "Unable to run staged test file checks",
      detail: "Check that scripts/check-tests.mjs exists and Node is available",
    });
  } else if (checkTests.status !== 0) {
    issues.push({
      type: "tests",
      message: "Missing unit test files for staged source files",
      detail: "Create a corresponding .test.js or .spec.js file",
    });
  }
}

// Run lint-staged and capture output
const result = spawnSync("npx", ["lint-staged", "--quiet"], {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  shell: process.platform === "win32",
});

const output = result.stdout + result.stderr;

// Parse output to detect what failed
if (result.status !== 0) {
  if (eslintIssueCount > 0 || output.includes("eslint")) {
    issues.push({
      type: "lint",
      message: eslintIssueCount > 0 ? `${eslintIssueCount} ESLint issue${eslintIssueCount === 1 ? "" : "s"} found` : "ESLint issues found",
    });
  }
  if (output.includes("prettier") || output.includes("Checking formatting")) {
    issues.push({
      type: "format",
      message: "Formatting issues found",
    });
  }
  // Generic fallback
  if (issues.length === 0) {
    issues.push({
      type: "checks",
      message: "Pre-commit checks found issues",
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

  messageLines.push("");
  messageLines.push(pc.dim("Run when ready:"));
  messageLines.push(
    `  ${pc.bold("npm run lint:fix   ")} ${pc.dim("# Fix ESLint issues")}`,
  );
  messageLines.push(
    `  ${pc.bold("npm run format     ")} ${pc.dim("# Fix formatting")}`,
  );
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

process.exit(result.status !== 0 ? 0 : 0);
