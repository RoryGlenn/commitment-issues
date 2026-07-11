// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import {
  run,
  spawnAsync,
  TOOL_TIMEOUT_MS,
  toolInvocation,
} from "./lib/process.mjs";
import {
  invalidPrecommitConfigMessages,
  loadPrecommitConfig,
  unknownPrecommitConfigKeys,
} from "./lib/config.mjs";
import {
  eslintManualIssues,
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
import { devInstallCommand, runScript } from "./lib/package-manager.mjs";
import {
  createJsonOutput,
  emitJsonArgumentError,
  issueToJsonFinding,
  normalizeProcessOutcome,
  parseJsonOutputArgs,
} from "./lib/json-output.mjs";
import {
  codeFilePattern,
  formatFilePattern,
  findTestFile,
  isTestExemptFile,
  isThirdPartyPath,
  collectTestsForFiles,
} from "./lib/files.mjs";

const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

const outputArgs = parseJsonOutputArgs(process.argv.slice(2));
if (outputArgs.error) {
  emitJsonArgumentError("precommit", outputArgs.error);
  process.exit(1);
}
const jsonMode = outputArgs.enabled;

function runPeerTool(name, args) {
  const invocation = toolInvocation(name, args);
  if (invocation.missingTool) {
    return Promise.resolve({
      outcome: "missing-tool",
      missingTool: name,
      error: undefined,
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
    });
  }
  return spawnAsync(invocation.command, invocation.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runEslint(files) {
  return runPeerTool("eslint", [
    "--cache",
    "--cache-strategy",
    "content",
    "--format",
    "json",
    "--",
    ...files,
  ]);
}

function runPrettier(files) {
  return runPeerTool("prettier", [
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
const guardConfig = resolveGuardConfig(config);
const secretScanConfig = resolveSecretScanConfig(config);
const jsonOutput = createJsonOutput({
  command: "precommit",
  mode:
    (guardConfig.blockProtectedBranches &&
      guardConfig.protectedBranches.length > 0) ||
    (secretScanConfig.scanSecrets && secretScanConfig.blockOnSecrets)
      ? "blocking"
      : "advisory",
});

function emitJsonResult({
  status,
  exitCode = 0,
  summary,
  findings = [],
  suggestions = [],
}) {
  jsonOutput.emit({ status, exitCode, summary, findings, suggestions });
  process.exit(exitCode);
}

// A typo'd key (e.g. requireTest) silently falls back to the default, which
// reads as "the tool ignored my config". One concise advisory line — never a
// box, never blocking — mirroring the pre-push config-conflict warning.
const unknownKeys = unknownPrecommitConfigKeys(config);
if (unknownKeys.length > 0) {
  const message = `Ignoring unknown precommitChecks key(s) in package.json: ${unknownKeys.join(", ")}. Check for typos.`;
  if (jsonMode) {
    jsonOutput.addDiagnostic({
      severity: "warning",
      code: "config.unknown-keys",
      message,
    });
  } else {
    console.warn(pc.yellow(`⚠ ${message}`));
  }
}

// A recognized key with a wrong-typed value is sanitized away and falls back to
// the default — which also reads as "the tool ignored my config". Surface it on
// one concise advisory line, never a box and never blocking.
const invalidValueMessages = invalidPrecommitConfigMessages(config);
if (invalidValueMessages.length > 0) {
  const message = `Ignoring invalid precommitChecks value(s) in package.json: ${invalidValueMessages.join("; ")}.`;
  if (jsonMode) {
    jsonOutput.addDiagnostic({
      severity: "warning",
      code: "config.invalid-values",
      message,
    });
  } else {
    console.warn(pc.yellow(`⚠ ${message}`));
  }
}

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
  const issue = {
    autoFixable: false,
    type: "branch",
    message: `Commit blocked on protected branch "${branch}"`,
    detail: "Create a branch: git switch -c <name>",
  };
  jsonOutput.addCheck({
    id: "protected-branch",
    status: "failed",
    summary: `Protected branch "${branch}" is blocked`,
    details: { branch },
  });
  if (jsonMode) {
    emitJsonResult({
      status: "blocked",
      exitCode: 1,
      summary: "Commit blocked by protected-branch policy",
      findings: [issueToJsonFinding(issue, "error")],
    });
  }
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
  const issue = {
    autoFixable: false,
    type: "git",
    message: "Unable to inspect staged files",
    detail: "Verify Git is available in PATH.",
  };
  jsonOutput.addCheck({
    id: "staged-files",
    status: "failed",
    summary: "Git could not inspect staged files",
    details: {
      status: gitFiles.status,
      error: gitFiles.error?.message || null,
    },
  });
  if (jsonMode) {
    emitJsonResult({
      status: "advisory",
      summary: "Commit allowed, but staged files could not be inspected",
      findings: [issueToJsonFinding(issue)],
    });
  }
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

  const summary = hasStagedChanges
    ? "Deletion-only commit; no applicable files to check"
    : "No staged files to check";
  jsonOutput.addCheck({
    id: "staged-files",
    status: "skipped",
    summary,
    details: { deletionOnly: hasStagedChanges, files: [] },
  });
  if (jsonMode) {
    emitJsonResult({ status: "skipped", summary });
  }
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

jsonOutput.addCheck({
  id: "staged-files",
  status: "passed",
  summary: `${rawStagedFiles.length} staged file${rawStagedFiles.length === 1 ? "" : "s"} inspected`,
  details: { files: rawStagedFiles },
});

const stagedFiles = rawStagedFiles.filter((file) => !isThirdPartyPath(file));

// Staged-secrets scan: high-precision patterns against *added* lines only,
// plus staged .env files. A failed diff probe skips the scan (fail-open, like
// every commit-side guard) — blocking here is opt-in via blockOnSecrets.
function collectSecretFindings() {
  if (!secretScanConfig.scanSecrets) {
    return { findings: [], diffInspected: false };
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
  return {
    findings: filterExemptFindings(findings, secretScanConfig.secretExempt),
    diffInspected: !diff.error && diff.status === 0,
  };
}

const { findings: secretFindings, diffInspected: secretDiffInspected } =
  collectSecretFindings();

jsonOutput.addCheck({
  id: "secrets",
  status: !secretScanConfig.scanSecrets
    ? "skipped"
    : secretFindings.length > 0
      ? secretScanConfig.blockOnSecrets
        ? "failed"
        : "advisory"
      : !secretDiffInspected
        ? "skipped"
        : "passed",
  summary: !secretScanConfig.scanSecrets
    ? "Secret scanning is disabled"
    : secretFindings.length > 0
      ? `${secretFindings.length} possible secret${secretFindings.length === 1 ? "" : "s"} found`
      : !secretDiffInspected
        ? "Secret diff could not be inspected"
        : "No possible secrets found",
  details: {
    findingCount: secretFindings.length,
    diffInspected: secretDiffInspected,
  },
});

if (secretScanConfig.blockOnSecrets && secretFindings.length > 0) {
  const issue = secretsIssue(secretFindings);
  if (jsonMode) {
    emitJsonResult({
      status: "blocked",
      exitCode: 1,
      summary: "Commit blocked because possible secrets are staged",
      findings: [issueToJsonFinding(issue, "error")],
    });
  }
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
const guardIssues = issues.filter((issue) => issue.type !== "secrets");
jsonOutput.addCheck({
  id: "commit-guards",
  status: guardIssues.length > 0 ? "advisory" : "passed",
  summary:
    guardIssues.length > 0
      ? `${guardIssues.length} commit guard finding${guardIssues.length === 1 ? "" : "s"}`
      : "Commit guards passed",
  details: { findingCount: guardIssues.length },
});

// Early-exit states below still surface any guard findings: a commit made of
// only node_modules files or only unlintable files can still be on the wrong
// branch or staging build artifacts.
function exitWithGuardSummary(infoLines, summary) {
  if (jsonMode) {
    emitJsonResult({
      status: issues.length > 0 ? "advisory" : "skipped",
      summary,
      findings: issues.map((issue) => issueToJsonFinding(issue)),
    });
  }
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
  exitWithGuardSummary(
    [
      pc.bold("No project files to check."),
      "",
      pc.dim("Only package dependency files are staged."),
    ],
    "No project files to check",
  );
}

const stagedJsFiles = stagedFiles.filter((file) => codeFilePattern.test(file));
const stagedFormatFiles = stagedFiles.filter((file) =>
  formatFilePattern.test(file),
);

if (stagedJsFiles.length === 0 && stagedFormatFiles.length === 0) {
  exitWithGuardSummary(
    [
      pc.bold("No lintable or formattable files staged."),
      "",
      pc.dim(
        `${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"} will be committed without checks.`,
      ),
    ],
    "No lintable or formattable files staged",
  );
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

const missingTestIssues = issues.filter(
  (issue) =>
    issue.type === "tests" && issue.message.includes("missing unit tests"),
);
jsonOutput.addCheck({
  id: "missing-tests",
  status:
    config.requireTests === false || stagedJsFiles.length === 0
      ? "skipped"
      : missingTestIssues.length > 0
        ? "advisory"
        : "passed",
  summary:
    config.requireTests === false
      ? "Missing-test detection is disabled"
      : stagedJsFiles.length === 0
        ? "No staged source files need test discovery"
        : missingTestIssues.length > 0
          ? missingTestIssues[0].message
          : "Staged source files have tests or exemptions",
  details: { sourceFiles: stagedJsFiles },
});

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

const eslintOutcome = eslintResult
  ? normalizeProcessOutcome(eslintResult)
  : null;
const prettierOutcome = prettierResult
  ? normalizeProcessOutcome(prettierResult)
  : null;
const stagedTestOutcome = testRun ? normalizeProcessOutcome(testRun) : null;
const processDidNotComplete = (outcome) =>
  ["timeout", "spawn-error", "signal", "missing-tool"].includes(outcome);

function unavailableToolIssue(result, outcome, displayName, packageName, type) {
  if (outcome === "missing-tool") {
    return {
      autoFixable: false,
      type,
      message: `${displayName} is not installed locally`,
      detail: `Install it: ${devInstallCommand([packageName])}`,
    };
  }
  if (outcome === "timeout") {
    return {
      autoFixable: false,
      type,
      message: `${displayName} timed out`,
      detail: `No result within ${TOOL_TIMEOUT_MS / 1000}s`,
    };
  }
  if (outcome === "signal") {
    return {
      autoFixable: false,
      type,
      message: `${displayName} stopped before completing`,
      detail: `Process ended from ${result.signal || "an unknown signal"}`,
    };
  }
  return {
    autoFixable: false,
    type,
    message: `Unable to run ${displayName}`,
    detail: `Check ${displayName} install and project config`,
  };
}

if (eslintResult) {
  if (processDidNotComplete(eslintOutcome)) {
    issues.push(
      unavailableToolIssue(
        eslintResult,
        eslintOutcome,
        "ESLint",
        "eslint",
        "lint",
      ),
    );
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

const lintIssues = issues.filter((issue) => issue.type === "lint");
jsonOutput.addCheck({
  id: "eslint",
  status:
    stagedJsFiles.length === 0
      ? "skipped"
      : lintIssues.length > 0
        ? "advisory"
        : "passed",
  summary:
    stagedJsFiles.length === 0
      ? "No staged JavaScript or TypeScript files"
      : lintIssues.length > 0
        ? `${lintIssues.length} ESLint finding${lintIssues.length === 1 ? "" : "s"}`
        : "ESLint passed",
  details: {
    files: stagedJsFiles,
    status: eslintResult?.status ?? null,
    signal: eslintResult?.signal ?? null,
    outcome: eslintOutcome,
  },
});

if (prettierResult) {
  if (processDidNotComplete(prettierOutcome)) {
    issues.push(
      unavailableToolIssue(
        prettierResult,
        prettierOutcome,
        "Prettier",
        "prettier",
        "format",
      ),
    );
  } else {
    const failed =
      prettierResult.status !== 0 && prettierResult.status !== 1;
    const files =
      prettierResult.status === 1
        ? prettierResult.stdout
            .split("\n")
            .map((file) => file.trim())
            .filter(Boolean)
        : [];
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

const formatIssues = issues.filter((issue) => issue.type === "format");
jsonOutput.addCheck({
  id: "prettier",
  status:
    stagedFormatFiles.length === 0
      ? "skipped"
      : formatIssues.length > 0
        ? "advisory"
        : "passed",
  summary:
    stagedFormatFiles.length === 0
      ? "No staged formattable files"
      : formatIssues.length > 0
        ? `${formatIssues.length} Prettier finding${formatIssues.length === 1 ? "" : "s"}`
        : "Prettier passed",
  details: {
    files: stagedFormatFiles,
    status: prettierResult?.status ?? null,
    signal: prettierResult?.signal ?? null,
    outcome: prettierOutcome,
  },
});

if (testRun) {
  if (processDidNotComplete(stagedTestOutcome)) {
    issues.push({
      autoFixable: false,
      type: "tests",
      message:
        stagedTestOutcome === "timeout"
          ? "Staged tests timed out"
          : stagedTestOutcome === "signal"
            ? "Staged tests stopped before completing"
            : "Unable to run staged tests",
      detail:
        stagedTestOutcome === "timeout"
          ? `No result within ${TOOL_TIMEOUT_MS / 1000}s`
          : stagedTestOutcome === "signal"
            ? `Process ended from ${testRun.signal || "an unknown signal"}`
            : "Check precommitChecks.testCommand in package.json",
    });
  } else if (stagedTestOutcome === "nonzero") {
    issues.push({
      autoFixable: false,
      type: "tests",
      message: `${stagedTests.length} staged test file${stagedTests.length === 1 ? "" : "s"} failing`,
      detail: stagedTests.join("\n"),
    });
  }
}

const stagedTestIssues = issues.filter(
  (issue) =>
    issue.type === "tests" && !issue.message.includes("missing unit tests"),
);
jsonOutput.addCheck({
  id: "staged-tests",
  status:
    stagedTests.length === 0
      ? "skipped"
      : stagedTestIssues.length > 0
        ? "advisory"
        : "passed",
  summary:
    stagedTests.length === 0
      ? "Staged tests are disabled or no related tests were found"
      : stagedTestIssues.length > 0
        ? `${stagedTestIssues.length} staged-test finding${stagedTestIssues.length === 1 ? "" : "s"}`
        : "Staged tests passed",
  details: {
    command: stagedTests.length > 0 ? [...testCommand, ...stagedTests] : [],
    files: stagedTests,
    status: testRun?.status ?? null,
    signal: testRun?.signal ?? null,
    outcome: stagedTestOutcome,
  },
});

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

jsonOutput.addCheck({
  id: "worktree",
  status: canInspectUnstagedFiles ? "passed" : "skipped",
  summary: canInspectUnstagedFiles
    ? "Unstaged tracked files inspected"
    : "Unable to inspect unstaged tracked files",
  details: { files: dirtyTrackedFiles },
});

if (issues.length === 0) {
  if (jsonMode) {
    emitJsonResult({
      status: "clean",
      summary: `All pre-commit checks passed for ${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"}`,
    });
  }
  successBox([
    pc.bold("All pre-commit checks passed."),
    "",
    pc.dim(
      `${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"} checked.`,
    ),
  ]);
  process.exit(0);
}

const canSuggestCommitFix =
  issues.some((issue) => issue.autoFixable) &&
  canInspectUnstagedFiles &&
  dirtyTrackedFiles.length === 0;
const suggestions = canSuggestCommitFix
  ? [
      {
        command: runScript("commit:fix"),
        description: "Apply automatic fixes and safely amend the latest commit",
      },
    ]
  : [];

if (jsonMode) {
  emitJsonResult({
    status: "advisory",
    summary: `${issues.length} pre-commit finding${issues.length === 1 ? "" : "s"}; commit allowed`,
    findings: issues.map((issue) => issueToJsonFinding(issue)),
    suggestions,
  });
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
