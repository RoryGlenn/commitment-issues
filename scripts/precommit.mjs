// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import {
  TOOL_TIMEOUT_MS,
  toolInvocation,
  spawnAsync,
  run,
} from "./lib/process.mjs";
import {
  invalidPrecommitConfigMessages,
  loadPrecommitConfig,
  unknownPrecommitConfigKeys,
} from "./lib/config.mjs";
import {
  eslintManualIssues,
  parsePrettierList,
  summarizeEslintJson,
} from "./lib/checks.mjs";
import {
  behindUpstreamIssue,
  generatedFilesIssue,
  isProtectedBranch,
  largeCommitIssues,
  largeFileIssue,
  parseBatchCheckSizes,
  parseNumstat,
  protectedBranchIssue,
  resolveGuardConfig,
} from "./lib/commit-guards.mjs";
import {
  envFileFindings,
  filterExemptFindings,
  findingLines,
  resolveSecretScanConfig,
  scanDiffForSecrets,
  secretsIssue,
} from "./lib/secret-scan.mjs";
import { buildAdvisoryMessage } from "./lib/message.mjs";
import { runScript } from "./lib/package-manager.mjs";
import {
  codeFilePattern,
  formatFilePattern,
  findTestFile,
  isTestExemptFile,
  isThirdPartyPath,
  collectTestsForFiles,
} from "./lib/files.mjs";

const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

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

const config = loadPrecommitConfig();

// A typo'd key (e.g. requireTest) silently falls back to the default, which
// reads as "the tool ignored my config". One concise advisory line — never a
// box, never blocking — mirroring the pre-push config-conflict warning.
const unknownKeys = unknownPrecommitConfigKeys(config);
if (unknownKeys.length > 0) {
  console.warn(
    pc.yellow(
      `⚠ Ignoring unknown precommitChecks key(s) in package.json: ${unknownKeys.join(", ")}. Check for typos.`,
    ),
  );
}

// A recognized key with a wrong-typed value is sanitized away and falls back to
// the default — which also reads as "the tool ignored my config". Surface it on
// one concise advisory line, never a box and never blocking.
const invalidValueMessages = invalidPrecommitConfigMessages(config);
if (invalidValueMessages.length > 0) {
  console.warn(
    pc.yellow(
      `⚠ Ignoring invalid precommitChecks value(s) in package.json: ${invalidValueMessages.join("; ")}.`,
    ),
  );
}

const guardConfig = resolveGuardConfig(config);

function branchName(args) {
  const result = run("git", args);
  return result.status === 0 ? result.stdout.trim() : "";
}

function currentBranch() {
  // HEAD has no commit in a freshly initialized repository, so rev-parse
  // fails even though the symbolic branch name already exists. Resolve that
  // name directly before treating the branch as unidentifiable.
  return (
    branchName(["rev-parse", "--abbrev-ref", "HEAD"]) ||
    branchName(["symbolic-ref", "--quiet", "--short", "HEAD"]) ||
    null
  );
}

const branch = currentBranch();

// Blocking guards must run before staged-file early exits. Deletion-only,
// allow-empty, and first commits are still commits to the protected branch.
if (
  guardConfig.blockProtectedBranches &&
  isProtectedBranch(branch, guardConfig.protectedBranches)
) {
  errorBox([
    pc.bold("Commit blocked: protected branch."),
    "",
    pc.dim(`Committing to "${branch}" is blocked by blockProtectedBranches.`),
    "",
    pc.dim("Create a branch: git switch -c <name>"),
    pc.dim("To bypass once: git commit --no-verify"),
  ]);
  process.exit(1);
}

const gitFiles = run("git", [
  ...GIT_PATH_ARGS,
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMRT",
]);

if (gitFiles.error || gitFiles.status !== 0) {
  // Advisory philosophy: the hook cannot check anything, but it must not
  // block the commit either — warn (matching the pre-push advisory
  // uninspectable state) and continue.
  warningBox([
    pc.bold("Unable to inspect staged files."),
    "",
    pc.dim("Commit will continue. Verify Git is available in PATH."),
  ]);

  process.exit(0);
}

const rawStagedFiles = gitFiles.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

if (rawStagedFiles.length === 0) {
  const anyStagedResult = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--cached",
    "--name-only",
  ]);
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

const stagedFiles = rawStagedFiles.filter((file) => !isThirdPartyPath(file));

// Staged-secrets scan: high-precision patterns against *added* lines only,
// plus staged .env files. A failed diff probe skips the scan (fail-open, like
// every commit-side guard) — blocking here is opt-in via blockOnSecrets.
const secretScanConfig = resolveSecretScanConfig(config);

function collectSecretFindings() {
  if (!secretScanConfig.scanSecrets) {
    return [];
  }
  const findings = [...envFileFindings(rawStagedFiles)];
  const diff = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--cached",
    "-U0",
    "--no-color",
  ]);
  if (!diff.error && diff.status === 0) {
    findings.push(...scanDiffForSecrets(diff.stdout));
  }
  return filterExemptFindings(findings, secretScanConfig.secretExempt);
}

const secretFindings = collectSecretFindings();

if (secretScanConfig.blockOnSecrets && secretFindings.length > 0) {
  errorBox([
    pc.bold("Commit blocked: possible secret staged."),
    "",
    ...findingLines(secretFindings).map((line) => pc.dim(line)),
    "",
    pc.dim("Remove the secret and rotate anything already exposed."),
    pc.dim("To bypass once: git commit --no-verify"),
  ]);
  process.exit(1);
}

// Advisory guards: instant git-only facts about the commit itself (branch,
// shape, oversized or generated files, behind-upstream). Any git hiccup here
// skips that guard — guards must never block or fail a commit.
function collectGuardIssues() {
  const guardIssues = [];

  const secretIssue = secretsIssue(secretFindings);
  if (secretIssue) {
    guardIssues.push(secretIssue);
  }

  const branchIssue = protectedBranchIssue(branch, guardConfig);
  if (branchIssue) {
    guardIssues.push(branchIssue);
  }

  if (guardConfig.adviseBehindUpstream) {
    const upstream = run("git", ["rev-parse", "--abbrev-ref", "@{u}"]);
    if (!upstream.error && upstream.status === 0) {
      const behind = run("git", ["rev-list", "--count", "HEAD..@{u}"]);
      if (!behind.error && behind.status === 0) {
        guardIssues.push(
          ...[
            behindUpstreamIssue(
              {
                behindCount: Number(behind.stdout.trim()),
                upstream: upstream.stdout.trim(),
              },
              guardConfig,
            ),
          ].filter(Boolean),
        );
      }
    }
  }

  const numstat = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--cached",
    "--numstat",
  ]);
  if (!numstat.error && numstat.status === 0) {
    guardIssues.push(
      ...largeCommitIssues(parseNumstat(numstat.stdout), guardConfig),
    );
  }

  if (guardConfig.maxFileSizeMb > 0) {
    const batch = run("git", [...GIT_PATH_ARGS, "cat-file", "--batch-check"], {
      input: rawStagedFiles.map((file) => `:0:${file}`).join("\n"),
    });
    if (!batch.error && batch.status === 0) {
      const sizeIssue = largeFileIssue(
        parseBatchCheckSizes(batch.stdout, rawStagedFiles),
        guardConfig,
      );
      if (sizeIssue) {
        guardIssues.push(sizeIssue);
      }
    }
  }

  const generatedIssue = generatedFilesIssue(rawStagedFiles, guardConfig);
  if (generatedIssue) {
    guardIssues.push(generatedIssue);
  }

  return guardIssues;
}

const issues = collectGuardIssues();

// Early-exit states below still surface any guard findings: a commit made of
// only node_modules files or only unlintable files can still be on the wrong
// branch or staging build artifacts.
function exitWithGuardSummary(infoLines) {
  if (issues.length > 0) {
    warningBox(
      buildAdvisoryMessage({
        issues,
        tone: config.tone,
        commitCommand: runScript("commit:fix"),
      }),
    );
  } else {
    infoBox(infoLines);
  }
  process.exit(0);
}

if (stagedFiles.length === 0) {
  exitWithGuardSummary([
    pc.bold("No project files to check."),
    "",
    pc.dim("Only package dependency files are staged."),
  ]);
}

const stagedJsFiles = stagedFiles.filter((file) => codeFilePattern.test(file));
const stagedFormatFiles = stagedFiles.filter((file) =>
  formatFilePattern.test(file),
);

if (stagedJsFiles.length === 0 && stagedFormatFiles.length === 0) {
  exitWithGuardSummary([
    pc.bold("No lintable or formattable files staged."),
    "",
    pc.dim(
      `${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"} will be committed without checks.`,
    ),
  ]);
}

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
        message: "ESLint failed before reporting any file issues",
        detail: "Check ESLint install and project config",
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
  } else {
    const { failed, files } = parsePrettierList(
      prettierResult.stdout,
      prettierResult.stderr,
    );
    if (failed) {
      // A crash (parse error, broken install) is not a formatting issue:
      // commit:fix cannot resolve it, so never present it as auto-fixable.
      issues.push({
        autoFixable: false,
        type: "format",
        message: "Prettier failed to complete",
        detail: "Check Prettier install and project config",
      });
    } else if (files.length > 0) {
      issues.push({
        autoFixable: true,
        type: "format",
        message: `${files.length} file${files.length === 1 ? "" : "s"} need Prettier formatting`,
        detail: files.join("\n"),
      });
    }
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
    issues.push({
      autoFixable: false,
      type: "tests",
      message: `${stagedTests.length} staged test file${stagedTests.length === 1 ? "" : "s"} failing`,
      detail: stagedTests.join("\n"),
    });
  }
}

const dirtyTrackedResult = run("git", [
  ...GIT_PATH_ARGS,
  "diff",
  "--name-only",
]);
// When the probe fails we cannot verify the worktree is clean. Tell the
// message builder explicitly instead of letting an empty file list read as
// "clean", which would recommend an unverified post-commit amend.
const canInspectUnstagedFiles =
  !dirtyTrackedResult.error && dirtyTrackedResult.status === 0;
const dirtyTrackedFiles = canInspectUnstagedFiles
  ? dirtyTrackedResult.stdout
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean)
  : [];

if (issues.length === 0) {
  successBox([
    pc.bold("All pre-commit checks passed."),
    "",
    pc.dim(
      `${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"} checked.`,
    ),
  ]);
  process.exit(0);
}

warningBox(
  buildAdvisoryMessage({
    issues,
    tone: config.tone,
    commitCommand: runScript("commit:fix"),
    canInspectUnstagedFiles,
    dirtyTrackedFiles,
  }),
);

process.exit(0);
