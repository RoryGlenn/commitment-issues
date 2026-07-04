import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import {
  TOOL_TIMEOUT_MS,
  toolInvocation,
  spawnAsync,
  run,
} from "./lib/process.mjs";
import { loadPrecommitConfig } from "./lib/config.mjs";
import {
  eslintManualIssues,
  parsePrettierList,
  summarizeEslintJson,
} from "./lib/checks.mjs";
import { buildAdvisoryMessage } from "./lib/message.mjs";
import {
  codeFilePattern, 
  formatFilePattern,
  findTestFile,
  isTestExemptFile,
  collectTestsForFiles,
} from "./lib/files.mjs";

function runEslint(files) {
  const { command, args } = toolInvocation("eslint", [
    "--cache",
    "--cache-strategy",
    "content",
    "--format",
    "json",
    "--",
    ...files,
  ]);
  return spawnAsync(command, args, { stdio: ["pipe", "pipe", "pipe"] });
}

function runPrettier(files) {
  const { command, args } = toolInvocation("prettier", [
    "--cache",
    "--cache-location",
    ".prettiercache",
    "--cache-strategy",
    "content",
    "--list-different",
    "--ignore-unknown",
    "--",
    ...files,
  ]);
  return spawnAsync(command, args, { stdio: ["pipe", "pipe", "pipe"] });
}

function runStagedTestCommand(testCommand, tests) {
  // Avoid leaking this process's test-runner context into the spawned tests
  // (e.g. when the hook itself is exercised under `node --test`).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnAsync(testCommand[0], [...testCommand.slice(1), ...tests], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const gitFiles = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMRT",
]);

if (gitFiles.error || gitFiles.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect staged files."),
    "",
    pc.dim("Commit will continue. Verify Git is available in PATH."),
  ]);

  process.exit(0);
}

const stagedFiles = gitFiles.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  const anyStagedResult = run("git", ["diff", "--cached", "--name-only"]);
  const hasStagedChanges =
    !anyStagedResult.error &&
    anyStagedResult.status === 0 &&
    anyStagedResult.stdout.trim().length > 0;

  infoBox(
    hasStagedChanges
      ? [
          pc.bold("Deletion-only commit — nothing to check."),
          "",
          pc.dim("Removing files needs no lint, format, or tests. Looks good!"),
        ]
      : [
          pc.bold("No staged files to check."),
          "",
          pc.dim("Stage changes with git add before committing."),
        ],
  );

  process.exit(0);
}

const unstagedFilesResult = run("git", ["diff", "--name-only"]);

const canInspectUnstagedFiles =
  !unstagedFilesResult.error && unstagedFilesResult.status === 0;
const unstagedTrackedFiles = canInspectUnstagedFiles
  ? unstagedFilesResult.stdout
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean)
  : [];

const stagedJsFiles = stagedFiles.filter((file) => codeFilePattern.test(file));
const stagedFormatFiles = stagedFiles.filter((file) =>
  formatFilePattern.test(file),
);

if (stagedJsFiles.length === 0 && stagedFormatFiles.length === 0) {
  infoBox([
    pc.bold("No lintable or formattable files staged."),
    "",
    pc.dim(
      `${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"} will be committed without checks.`,
    ),
  ]);

  process.exit(0);
}

const issues = [];

const config = loadPrecommitConfig();

// Missing-test detection is pure and instant; opt out with requireTests: false.
if (config.requireTests !== false && stagedJsFiles.length > 0) {
  const missingTests = stagedJsFiles.filter(
    (file) => !isTestExemptFile(file) && !findTestFile(file),
  );

  if (missingTests.length > 0) {
    issues.push({
      autoFixable: false,
      type: "tests",
      message: `${missingTests.length} staged source file${missingTests.length === 1 ? "" : "s"} missing unit tests`,
      detail: missingTests.join("\n"),
    });
  }
}

const stagedTests = config.runStagedTests
  ? collectTestsForFiles(stagedFiles)
  : [];
const testCommand =
  Array.isArray(config.testCommand) && config.testCommand.length > 0
    ? config.testCommand
    : ["node", "--test"];

// Run the independent tool checks concurrently.
const [eslintResult, prettierResult, testRun] = await Promise.all([
  stagedJsFiles.length > 0 ? runEslint(stagedJsFiles) : null,
  stagedFormatFiles.length > 0 ? runPrettier(stagedFormatFiles) : null,
  stagedTests.length > 0
    ? runStagedTestCommand(testCommand, stagedTests)
    : null,
]);

if (eslintResult) {
  if (eslintResult.error || eslintResult.signal) {
    issues.push({
      autoFixable: false,
      type: "lint",
      message: eslintResult.signal
        ? "ESLint timed out"
        : "Unable to run ESLint",
      detail: eslintResult.signal
        ? `No result within ${TOOL_TIMEOUT_MS / 1000}s`
        : "Check ESLint install and project config",
    });
  } else {
    const { issueCount: eslintIssueCount, fixableCount: eslintFixableCount } =
      summarizeEslintJson(eslintResult.stdout);
    const eslintManualCount = eslintIssueCount - eslintFixableCount;

    if (eslintFixableCount > 0) {
      issues.push({
        autoFixable: true,
        type: "lint",
        message: `${eslintFixableCount} auto-fixable ESLint issue${eslintFixableCount === 1 ? "" : "s"} found`,
      });
    }

    if (eslintManualCount > 0) {
      const manualDetail = eslintManualIssues(eslintResult.stdout)
        .map((issue) => {
          const rel =
            path.relative(process.cwd(), issue.filePath) || issue.filePath;
          const loc = issue.line ? `${rel}:${issue.line}:${issue.column}` : rel;
          return issue.ruleId ? `${loc} (${issue.ruleId})` : loc;
        })
        .join("\n");
      issues.push({
        autoFixable: false,
        type: "lint",
        message: `${eslintManualCount} ESLint issue${eslintManualCount === 1 ? "" : "s"} needing manual fixes`,
        detail: manualDetail || undefined,
      });
    }

    if (eslintIssueCount === 0 && (eslintResult.status || 0) > 1) {
      issues.push({
        autoFixable: false,
        type: "lint",
        message: "ESLint failed to complete",
        detail: "Check your ESLint configuration",
      });
    }
  }
}

if (prettierResult) {
  if (prettierResult.error || prettierResult.signal) {
    issues.push({
      autoFixable: false,
      type: "format",
      message: prettierResult.signal
        ? "Prettier timed out"
        : "Unable to run Prettier",
      detail: prettierResult.signal
        ? `No result within ${TOOL_TIMEOUT_MS / 1000}s`
        : "Check Prettier install and project config",
    });
  } else if ((prettierResult.status || 0) === 1) {
    const prettierFiles = parsePrettierList(
      `${prettierResult.stdout}\n${prettierResult.stderr}`,
    );
    const formatIssueCount = prettierFiles.length;

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

if (testRun) {
  if (testRun.error || testRun.signal) {
    issues.push({
      autoFixable: false,
      type: "tests",
      message: testRun.signal
        ? "Staged tests timed out"
        : "Unable to run staged tests",
      detail: testRun.signal
        ? `No result within ${TOOL_TIMEOUT_MS / 1000}s`
        : "Check precommitChecks.testCommand in package.json",
    });
  } else if ((testRun.status || 0) !== 0) {
    const testOutput = `${testRun.stdout || ""}${testRun.stderr || ""}`.trim();
    if (testOutput) {
      console.log(testOutput);
    }
    issues.push({
      autoFixable: false,
      type: "tests",
      message: `${stagedTests.length} staged test file${stagedTests.length === 1 ? "" : "s"} failing`,
      detail: `Run: ${[...testCommand, ...stagedTests].join(" ")}`,
    });
  }
}

console.log("");

// Build the consolidated message and print it.
const { severity, lines } = buildAdvisoryMessage(issues, {
  canInspectUnstagedFiles,
  unstagedTrackedFiles,
});

(severity === "warning" ? warningBox : successBox)(lines);

process.exit(0);
