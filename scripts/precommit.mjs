// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import pc from "picocolors";
import { printHookBoxModel } from "./lib/ui.mjs";
import { TOOL_TIMEOUT_MS, runTool, spawnAsync, run } from "./lib/process.mjs";
import {
  loadPrecommitConfig,
  precommitConfigDiagnostics,
  precommitConfigWarningMessages,
  resolveHookOutput,
} from "./lib/config.mjs";
import {
  eslintManualIssues,
  formatEslintManualIssue,
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
import {
  buildAdvisoryMessage,
  plural,
  stagedTestInterruption,
  unavailableToolIssue,
} from "./lib/message.mjs";
import { devInstallCommand, runScript } from "./lib/package-manager.mjs";
import {
  allowedStatus,
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
  parseLsFilesStage,
  parseNulPaths,
} from "./lib/files.mjs";

const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

const outputArgs = parseJsonOutputArgs(process.argv.slice(2));
if (outputArgs.error) {
  emitJsonArgumentError("precommit", outputArgs.error);
  process.exit(1);
}
const jsonMode = outputArgs.enabled;

function runEslint(files) {
  return runTool(
    "eslint",
    [
      "--cache",
      "--cache-strategy",
      "content",
      "--format",
      "json",
      "--",
      ...files,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

function runPrettier(files) {
  return runTool(
    "prettier",
    [
      "--cache",
      "--cache-location",
      ".prettiercache",
      "--cache-strategy",
      "content",
      "--list-different",
      "--ignore-unknown",
      "--",
      ...files,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
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
const hookOutput = resolveHookOutput(config);
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

const configWarnings = precommitConfigWarningMessages(config);
if (jsonMode) {
  for (const { code, message } of precommitConfigDiagnostics(config)) {
    jsonOutput.addDiagnostic({
      severity: "warning",
      code,
      message,
    });
  }
} else {
  for (const message of configWarnings) {
    console.warn(pc.yellow(`⚠ ${message}`));
  }
}

function printHookMessage(severity, lines) {
  printHookBoxModel({ severity, lines }, hookOutput);
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
  printHookMessage("error", [
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
  "-z",
  "--diff-filter=ACMRT",
]);

const rawStagedFiles = parseNulPaths(gitFiles.stdout);

if (gitFiles.error || gitFiles.status !== 0 || rawStagedFiles === null) {
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
  printHookMessage("warning", [
    pc.bold("Unable to inspect staged files."),
    "",
    pc.dim("Commit will continue. Verify Git is available in PATH."),
  ]);

  process.exit(0);
}

if (rawStagedFiles.length === 0) {
  const anyStagedResult = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--cached",
    "--quiet",
  ]);
  const hasStagedChanges =
    !anyStagedResult.error && anyStagedResult.status === 1;

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
  printHookMessage(
    "info",
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
      ? `${secretFindings.length} possible ${plural(secretFindings.length, "secret")} found`
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
  printHookMessage("error", [
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
    "-z",
  ]);
  if (!numstat.error && numstat.status === 0) {
    const shape = parseNumstat(numstat.stdout);
    if (shape !== null) {
      guardIssues.push(...largeCommitIssues(shape, guardConfig));
    }
  }

  if (guardConfig.maxFileSizeMb > 0) {
    const index = run("git", [
      ...GIT_PATH_ARGS,
      "ls-files",
      "--stage",
      "-z",
      "--",
      ...rawStagedFiles,
    ]);
    const indexEntries = parseLsFilesStage(index.stdout);
    if (!index.error && index.status === 0 && indexEntries !== null) {
      const objectByFile = new Map(
        indexEntries
          .filter((entry) => entry.stage === 0)
          .map((entry) => [entry.file, entry.object]),
      );
      const stagedBlobs = rawStagedFiles
        .filter((file) => objectByFile.has(file))
        .map((file) => ({ file, object: objectByFile.get(file) }));
      const batch = run("git", ["cat-file", "--batch-check"], {
        input: stagedBlobs.map(({ object }) => object).join("\n"),
      });
      if (!batch.error && batch.status === 0) {
        const sizeIssue = largeFileIssue(
          parseBatchCheckSizes(
            batch.stdout,
            stagedBlobs.map(({ file }) => file),
          ),
          guardConfig,
        );
        if (sizeIssue) {
          guardIssues.push(sizeIssue);
        }
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
      status: allowedStatus(issues, "skipped"),
      summary,
      findings: issues.map((issue) => issueToJsonFinding(issue)),
    });
  }
  if (issues.length > 0) {
    printHookMessage(
      "warning",
      buildAdvisoryMessage({
        issues,
        tone: config.tone,
        commitCommand: runScript("commit:fix"),
      }),
    );
  } else {
    printHookMessage("info", infoLines);
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
  // The no-lint/no-format state exits above, and every JS/TS extension is also
  // formattable, so this collection is guaranteed non-empty here.
  runPrettier(stagedFormatFiles),
  stagedTests.length > 0
    ? runStagedTestCommand(testCommand, stagedTests)
    : null,
]);

const eslintOutcome = eslintResult
  ? normalizeProcessOutcome(eslintResult)
  : null;
const prettierOutcome = normalizeProcessOutcome(prettierResult);
const stagedTestOutcome = testRun ? normalizeProcessOutcome(testRun) : null;
const processDidNotComplete = (outcome) =>
  ["timeout", "spawn-error", "signal", "missing-tool"].includes(outcome);

if (eslintResult) {
  if (processDidNotComplete(eslintOutcome)) {
    issues.push(
      unavailableToolIssue({
        result: eslintResult,
        outcome: eslintOutcome,
        displayName: "ESLint",
        type: "lint",
        installCommand: devInstallCommand(["eslint"]),
        timeoutSeconds: TOOL_TIMEOUT_MS / 1000,
      }),
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
        .map((issue) => formatEslintManualIssue(issue, process.cwd()))
        .join("\n");
      issues.push({
        autoFixable: false,
        type: "lint",
        message: `${eslintManualCount} ESLint issue${eslintManualCount === 1 ? "" : "s"} needing manual fixes`,
        detail: manualDetail,
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

if (processDidNotComplete(prettierOutcome)) {
  issues.push(
    unavailableToolIssue({
      result: prettierResult,
      outcome: prettierOutcome,
      displayName: "Prettier",
      type: "format",
      installCommand: devInstallCommand(["prettier"]),
      timeoutSeconds: TOOL_TIMEOUT_MS / 1000,
    }),
  );
} else {
  const failed = prettierResult.status !== 0 && prettierResult.status !== 1;
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

const formatIssues = issues.filter((issue) => issue.type === "format");
jsonOutput.addCheck({
  id: "prettier",
  status: formatIssues.length > 0 ? "advisory" : "passed",
  summary: formatIssues.length > 0 ? "1 Prettier finding" : "Prettier passed",
  details: {
    files: stagedFormatFiles,
    status: prettierResult.status,
    signal: prettierResult.signal,
    outcome: prettierOutcome,
  },
});

if (testRun) {
  if (processDidNotComplete(stagedTestOutcome)) {
    const interruption = stagedTestInterruption(
      testRun,
      stagedTestOutcome,
      TOOL_TIMEOUT_MS / 1000,
    );
    issues.push({
      autoFixable: false,
      type: "tests",
      ...interruption,
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
        ? "1 staged-test finding"
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
  "-z",
]);
// When the probe fails we cannot verify the worktree is clean. Tell the
// message builder explicitly instead of letting an empty file list read as
// "clean", which would recommend an unverified post-commit amend.
const canInspectUnstagedFiles =
  !dirtyTrackedResult.error &&
  dirtyTrackedResult.status === 0 &&
  parseNulPaths(dirtyTrackedResult.stdout) !== null;
const dirtyTrackedFiles = canInspectUnstagedFiles
  ? parseNulPaths(dirtyTrackedResult.stdout)
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
      summary: `All pre-commit checks passed for ${stagedFiles.length} staged ${plural(stagedFiles.length, "file")}`,
    });
  }
  printHookMessage("success", [
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
    summary: `${issues.length} pre-commit ${plural(issues.length, "finding")}; commit allowed`,
    findings: issues.map((issue) => issueToJsonFinding(issue)),
    suggestions,
  });
}

printHookMessage(
  "warning",
  buildAdvisoryMessage({
    issues,
    tone: config.tone,
    commitCommand: runScript("commit:fix"),
    canInspectUnstagedFiles,
    dirtyTrackedFiles,
  }),
);

process.exit(0);
