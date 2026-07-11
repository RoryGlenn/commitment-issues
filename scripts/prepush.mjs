// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import { run, spawnAsync, TOOL_TIMEOUT_MS } from "./lib/process.mjs";
import {
  loadPrecommitConfig,
  precommitConfigDiagnostics,
  precommitConfigWarningMessages,
} from "./lib/config.mjs";
import { parseNodeTestSummary } from "./lib/checks.mjs";
import { collectTestsForFiles, parseNameStatusPaths } from "./lib/files.mjs";
import {
  branchFromRef,
  isProtectedBranch,
  resolveGuardConfig,
} from "./lib/commit-guards.mjs";
import {
  createJsonOutput,
  emitJsonArgumentError,
  issueToJsonFinding,
  normalizeProcessOutcome,
  parseJsonOutputArgs,
} from "./lib/json-output.mjs";

const ZERO_SHA = "0".repeat(40);
// Git's well-known empty-tree object, used as the diff base for a brand-new
// branch (no remote sha yet) so every file in the pushed history counts.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// Force literal, unquoted paths (as the pre-commit/fix flows already do) so
// pushed files with spaces or non-ASCII names still match their associated
// tests instead of arriving octal-escaped from git.
const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

// Git invokes pre-push hooks with the remote name and URL as two positional
// arguments. Accept those on either side of --json, but reject any additional
// JSON-mode arguments so a typo cannot silently change a machine-readable run.
const outputArgs = parseJsonOutputArgs(process.argv.slice(2), 2);
if (outputArgs.error) {
  emitJsonArgumentError("prepush", outputArgs.error);
  process.exit(1);
}
const jsonMode = outputArgs.enabled;

const config = loadPrecommitConfig();
const guardConfig = resolveGuardConfig(config);

// Two opt-in modes for running the suite before a push:
//   blockPushOnTestFailure: run tests and block the push if any fail.
//   advisePushTests:        run tests and report results, but never block.
// `blockPushOnTestFailure` wins if both are set. With neither, stay out of the
// way entirely — preserving the tool's non-blocking-by-default philosophy.
const blocking = config.blockPushOnTestFailure === true;
const advisory = !blocking && config.advisePushTests === true;
const protectedBranchPosture = guardConfig.protectedBranches.length > 0;
const jsonOutput = createJsonOutput({
  command: "prepush",
  mode:
    blocking || (guardConfig.blockProtectedBranches && protectedBranchPosture)
      ? "blocking"
      : advisory || protectedBranchPosture
        ? "advisory"
        : "disabled",
});
const pushFindings = [];

function emitJsonResult({
  status,
  exitCode = 0,
  summary,
  findings = pushFindings,
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

// A real `git push` pipes the ref list into the hook, so the hook's stdin is
// never a TTY then. A developer running the script by hand in a terminal does
// have a TTY on stdin. `isTTY` is the only stdin signal that is reliable across
// Windows (PowerShell/cmd), macOS, and Linux — fstat-based pipe detection is
// not (git's pipe on Windows doesn't report as a FIFO). So we only treat a run
// as interactive when stdin is *certainly* a TTY; on any ambiguity we assume
// git and stay silent, guaranteeing a real push never prints the advisory box.
// COMMITMENT_ISSUES_ASSUME_TTY is a test/debug seam to force the interactive
// path (a real TTY can't be attached through spawnSync in tests).
const interactive =
  process.stdin.isTTY === true ||
  process.env.COMMITMENT_ISSUES_ASSUME_TTY === "1";

// The two modes are mutually exclusive; if a repo sets both, surface the
// conflict (one concise line on stderr) so it's clearly a config mistake rather
// than silently ignored — without shoving a full box in front of every push.
if (blocking && config.advisePushTests === true) {
  const message =
    "Both blockPushOnTestFailure and advisePushTests are set; using " +
    "blockPushOnTestFailure (block on failure). Remove advisePushTests " +
    "from .commitmentrc.json or package.json to silence this.";
  if (jsonMode) {
    jsonOutput.addDiagnostic({
      severity: "warning",
      code: "config.push-mode-conflict",
      message,
    });
  } else {
    console.warn(pc.yellow(`⚠ ${message}`));
  }
}

// Read the pushed refs once, before any mode decision: the protected-branch
// guard applies even when both test modes are off. Interactive manual runs
// resolve to no refs instantly, so this never blocks a terminal session.
const pushRefs = await readPushRefs();

const protectedTargets = [
  ...new Set(
    pushRefs
      .map((ref) => branchFromRef(ref.remoteRef))
      .filter((name) => isProtectedBranch(name, guardConfig.protectedBranches)),
  ),
];

if (protectedTargets.length > 0) {
  const named = protectedTargets.map((name) => `"${name}"`).join(", ");
  if (guardConfig.blockProtectedBranches) {
    const issue = {
      autoFixable: false,
      type: "branch",
      message: `Push blocked on protected branch${protectedTargets.length === 1 ? "" : "es"}: ${named}`,
      detail: "Push a feature branch and open a pull request instead.",
    };
    jsonOutput.addCheck({
      id: "protected-branch",
      status: "failed",
      summary: `Protected push target${protectedTargets.length === 1 ? " is" : "s are"} blocked`,
      details: { branches: protectedTargets },
    });
    if (jsonMode) {
      emitJsonResult({
        status: "blocked",
        exitCode: 1,
        summary: "Push blocked by protected-branch policy",
        findings: [issueToJsonFinding(issue, "error")],
      });
    }
    errorBox([
      pc.bold("Push blocked: protected branch."),
      "",
      pc.dim(`Pushing to ${named} is blocked by blockProtectedBranches.`),
      "",
      pc.dim("Push a feature branch and open a pull request instead."),
      pc.dim("To bypass once: git push --no-verify"),
    ]);
    process.exit(1);
  }
  const issue = {
    autoFixable: false,
    type: "branch",
    message: `Pushing directly to protected branch${protectedTargets.length === 1 ? "" : "es"}: ${named}`,
    detail: "Push will continue.",
  };
  pushFindings.push(issueToJsonFinding(issue));
  jsonOutput.addCheck({
    id: "protected-branch",
    status: "advisory",
    summary: `Push updates ${protectedTargets.length} protected branch${protectedTargets.length === 1 ? "" : "es"}`,
    details: { branches: protectedTargets },
  });
  if (!jsonMode) {
    warningBox([
      pc.bold("Pushing to a protected branch."),
      "",
      pc.dim(`This push updates ${named} directly.`),
      "",
      pc.dim("Push will continue."),
    ]);
  }
} else {
  jsonOutput.addCheck({
    id: "protected-branch",
    status: "passed",
    summary: "No protected push targets",
    details: { branches: [] },
  });
}

if (!blocking && !advisory) {
  // Silent during a real `git push` (the documented non-blocking default), but
  // when a human runs this by hand it would otherwise exit with no output and
  // look broken — so explain why nothing ran and how to turn a mode on.
  jsonOutput.addCheck({
    id: "push-tests",
    status: "skipped",
    summary: "Pre-push test checks are disabled",
    details: { command: [], files: [] },
  });
  if (jsonMode) {
    emitJsonResult({
      status: pushFindings.length > 0 ? "advisory" : "skipped",
      summary: "Pre-push test checks are disabled",
    });
  }
  if (interactive) {
    infoBox([
      pc.bold("Pre-push test checks are disabled."),
      "",
      pc.dim("Nothing ran because no pre-push test mode is enabled in"),
      pc.dim(".commitmentrc.json or package.json precommitChecks. Enable one:"),
      "",
      `  ${pc.bold('"blockPushOnTestFailure": true')} ${pc.dim("— run tests and block on failure")}`,
      `  ${pc.bold('"advisePushTests": true')} ${pc.dim("— run tests but only warn")}`,
    ]);
  }
  process.exit(0);
}

const testCommand =
  Array.isArray(config.testCommand) && config.testCommand.length > 0
    ? config.testCommand
    : ["node", "--test"];

// Git feeds the pre-push hook "<local ref> <local sha> <remote ref> <remote
// sha>" lines on stdin. Read them to learn exactly what is being pushed.
function readStdin() {
  // Interactive terminal: no refs are coming, and reading a TTY would block, so
  // skip it entirely.
  if (interactive) {
    return Promise.resolve("");
  }
  // Otherwise read the piped refs, but guard with a timeout: a shell that hands
  // us a non-TTY stdin with no data (e.g. Git Bash run by hand) must not hang
  // the script forever waiting for input that never arrives. A real push closes
  // the pipe promptly, so `end` fires well before the timeout.
  return new Promise((resolve) => {
    let raw = "";
    let settled = false;
    let timer;
    const done = () => {
      // Defensive re-entrancy guard: `done` is wired to end/error and the idle
      // timer, but the first call settles and detaches the others, so the
      // second-call return is not reachable deterministically.
      /* node:coverage disable */
      if (settled) {
        return;
      }
      /* node:coverage enable */
      settled = true;
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.off("end", done);
      process.stdin.off("error", done);
      resolve(raw);
    };
    // Treat the timeout as an *idle* deadline, re-armed on each chunk, so we
    // always wait for the full ref list and only bail when stdin goes quiet
    // (the never-arrives case) rather than truncating a slow push mid-stream.
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(done, 1000);
      timer.unref?.();
    };
    const onData = (chunk) => {
      raw += chunk;
      armTimer();
    };
    armTimer();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

async function readPushRefs() {
  const raw = await readStdin();
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 4)
    .map(([, localSha, remoteRef, remoteSha]) => ({
      localSha,
      remoteRef,
      remoteSha,
    }))
    .filter((ref) => ref.localSha && ref.localSha !== ZERO_SHA);
}

function diffFiles(base, head) {
  // Keep deletions so a removed source file can still map to its surviving
  // related test. Name/status output also preserves both sides of a rename;
  // `-z` makes every path unambiguous, including whitespace and newlines.
  const result = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    base,
    head,
  ]);
  // Surface the failure rather than swallowing it as "no files": blocking mode
  // must be able to fail closed instead of silently allowing a push it could
  // not actually inspect.
  if (result.error || (result.status || 0) !== 0) {
    return {
      ok: false,
      files: [],
      detail:
        (result.stderr || "").trim() || `git diff ${base}..${head} failed`,
    };
  }
  const files = parseNameStatusPaths(result.stdout);
  return files === null
    ? {
        ok: false,
        files: [],
        detail: "git diff returned malformed name-status output",
      }
    : { ok: true, files };
}

function getPushedFiles() {
  const refs = pushRefs;
  const files = new Set();
  const diffErrors = [];

  const collect = (result) => {
    if (result.ok) {
      for (const file of result.files) {
        files.add(file);
      }
    } else {
      diffErrors.push(result.detail);
    }
  };

  if (refs.length > 0) {
    for (const { localSha, remoteSha } of refs) {
      const base = remoteSha && remoteSha !== ZERO_SHA ? remoteSha : EMPTY_TREE;
      collect(diffFiles(base, localSha));
    }
    return { files: [...files], diffErrors };
  }

  // Fallback for manual runs (no stdin): compare against the upstream branch.
  // A missing upstream is not an error — there is simply nothing to diff — so
  // only a genuine `git diff` failure counts as a diff error.
  if (run("git", ["rev-parse", "@{u}"]).status === 0) {
    collect(diffFiles("@{u}", "HEAD"));
  }
  return { files: [...files], diffErrors };
}

const { files: pushedFiles, diffErrors } = getPushedFiles();

// A failed diff means we don't know what is being pushed, so we can't know
// which tests to run. Advisory mode stays out of the way (warn, then allow);
// blocking mode fails closed rather than waving through an un-inspectable push.
if (diffErrors.length > 0) {
  const detailLines = [...new Set(diffErrors)].map((detail) => pc.dim(detail));
  const issue = {
    autoFixable: false,
    type: "git",
    message: blocking
      ? "Could not inspect pushed files"
      : "Could not inspect pushed files (advisory)",
    detail: [...new Set(diffErrors)].join("\n"),
  };
  jsonOutput.addCheck({
    id: "pushed-files",
    status: blocking ? "failed" : "advisory",
    summary: "Git could not inspect pushed files",
    details: { errors: [...new Set(diffErrors)] },
  });
  if (blocking) {
    if (jsonMode) {
      emitJsonResult({
        status: "blocked",
        exitCode: 1,
        summary: "Push blocked because pushed files could not be inspected",
        findings: [...pushFindings, issueToJsonFinding(issue, "error")],
      });
    }
    errorBox([
      pc.bold("Push blocked: could not inspect pushed files"),
      "",
      pc.dim("Git could not list the files being pushed, so the pre-push test"),
      pc.dim("gate cannot run."),
      "",
      ...detailLines,
      "",
      pc.dim("Fix the Git error above, then push again."),
      pc.dim("To bypass this gate once: git push --no-verify"),
    ]);
    process.exit(1);
  }
  pushFindings.push(issueToJsonFinding(issue));
  if (jsonMode) {
    emitJsonResult({
      status: "advisory",
      summary: "Push allowed, but pushed files could not be inspected",
    });
  }
  warningBox([
    pc.bold("Could not inspect pushed files (advisory)"),
    "",
    pc.dim("Git could not list the files being pushed, so no pre-push tests"),
    pc.dim("ran."),
    "",
    ...detailLines,
    "",
    pc.dim("Push allowed."),
  ]);
  process.exit(0);
}

jsonOutput.addCheck({
  id: "pushed-files",
  status: "passed",
  summary: `${pushedFiles.length} pushed file${pushedFiles.length === 1 ? "" : "s"} inspected`,
  details: { files: pushedFiles },
});

// Deleted/renamed test paths can appear in the diff so deleted source paths
// remain useful for related-test discovery. Never pass a test that no longer
// exists in the working tree to the runner.
const testFiles = collectTestsForFiles(pushedFiles).filter((file) =>
  fs.existsSync(file),
);

if (testFiles.length === 0) {
  jsonOutput.addCheck({
    id: "push-tests",
    status: "skipped",
    summary: "No related tests found",
    details: { command: [], files: [] },
  });
  if (jsonMode) {
    emitJsonResult({
      status: pushFindings.length > 0 ? "advisory" : "skipped",
      summary: "No tests to run before push",
    });
  }
  infoBox([
    pc.bold("No tests to run before push"),
    "",
    pc.dim("None of the pushed files have associated tests. Push allowed."),
  ]);
  process.exit(0);
}

const fullCommand = [...testCommand, ...testFiles];

if (!jsonMode) {
  console.log("");
  console.log(
    pc.dim(`Running tests for pushed files: ${fullCommand.join(" ")}`),
  );
  console.log("");
}

// Avoid leaking this process's test-runner context into the spawned suite.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

// Human mode keeps the test runner attached/teed as before. JSON mode captures
// the same subprocess output and relays it to stderr after completion; stdout
// remains exactly one parseable JSON document.
const isNodeTest =
  /(^|[/\\])node(\.exe)?$/i.test(testCommand[0]) &&
  testCommand.includes("--test");

let result;
let summary = null;

if (isNodeTest) {
  const tapFile = path.join(os.tmpdir(), `prepush-tap-${process.pid}.tap`);
  const args = [
    ...testCommand.slice(1),
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=tap",
    `--test-reporter-destination=${tapFile}`,
    ...testFiles,
  ];
  result = await spawnAsync(testCommand[0], args, {
    env,
    stdio: jsonMode ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  try {
    summary = parseNodeTestSummary(fs.readFileSync(tapFile, "utf8"));
  } catch {
    summary = null;
  } finally {
    fs.rmSync(tapFile, { force: true });
  }
} else {
  result = await spawnAsync(fullCommand[0], fullCommand.slice(1), {
    env,
    echo: !jsonMode,
  });
  summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
}

if (jsonMode) {
  // Test output is intentionally not embedded in the stable payload: it can be
  // arbitrarily large and tool-specific. stderr remains available for humans
  // and CI logs without corrupting stdout JSON.
  if (result.stdout) {
    fs.writeSync(process.stderr.fd, result.stdout);
  }
  if (result.stderr) {
    fs.writeSync(process.stderr.fd, result.stderr);
  }
} else {
  console.log("");
}

const summaryLines = summary
  ? ["", pc.dim(`${summary.passed} passed, ${summary.failed} failed`)]
  : [];

const testOutcome = normalizeProcessOutcome(result);
const testDidNotComplete = [
  "timeout",
  "spawn-error",
  "signal",
  "missing-tool",
].includes(testOutcome);

if (testDidNotComplete) {
  const timeoutCleanup =
    result.cleanup === "direct-child"
      ? "the direct child was stopped, but descendant cleanup was unavailable"
      : result.cleanup
        ? "attached process-tree cleanup completed"
        : null;
  const reasonText =
    testOutcome === "timeout"
      ? `The test command timed out after ${TOOL_TIMEOUT_MS / 1000}s${timeoutCleanup ? `; ${timeoutCleanup}` : ""}.`
      : testOutcome === "signal"
        ? `The test command stopped after ${
            result.signal || "an unknown signal"
          }.`
        : "Check testCommand in .commitmentrc.json or package.json precommitChecks.";
  const reason = pc.dim(reasonText);
  const issue = {
    autoFixable: false,
    type: "tests",
    message: blocking
      ? "Could not run pre-push tests"
      : "Could not run pre-push tests (advisory)",
    detail: reasonText,
  };
  jsonOutput.addCheck({
    id: "push-tests",
    status: blocking ? "failed" : "advisory",
    summary: "Pre-push test command could not complete",
    details: {
      command: fullCommand,
      files: testFiles,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || null,
      outcome: testOutcome,
      summary,
    },
  });
  if (blocking) {
    if (jsonMode) {
      emitJsonResult({
        status: "blocked",
        exitCode: 1,
        summary: "Push blocked because tests could not run",
        findings: [...pushFindings, issueToJsonFinding(issue, "error")],
      });
    }
    errorBox([pc.bold("Push blocked: could not run tests"), "", reason]);
    process.exit(1);
  }
  pushFindings.push(issueToJsonFinding(issue));
  if (jsonMode) {
    emitJsonResult({
      status: "advisory",
      summary: "Push allowed, but tests could not run",
    });
  }
  warningBox([
    pc.bold("Could not run tests (advisory)"),
    "",
    reason,
    pc.dim("Push allowed."),
  ]);
  process.exit(0);
}

if (testOutcome === "nonzero") {
  const issue = {
    autoFixable: false,
    type: "tests",
    message: blocking
      ? "Pre-push tests failed"
      : "Pre-push tests failed (advisory)",
    detail: summary
      ? `${summary.passed} passed, ${summary.failed} failed`
      : undefined,
  };
  jsonOutput.addCheck({
    id: "push-tests",
    status: blocking ? "failed" : "advisory",
    summary: "Pre-push tests failed",
    details: {
      command: fullCommand,
      files: testFiles,
      status: result.status,
      signal: result.signal,
      outcome: testOutcome,
      summary,
    },
  });
  if (blocking) {
    if (jsonMode) {
      emitJsonResult({
        status: "blocked",
        exitCode: 1,
        summary: "Push blocked because tests failed",
        findings: [...pushFindings, issueToJsonFinding(issue, "error")],
      });
    }
    errorBox([
      pc.bold("Push blocked: tests failed"),
      ...summaryLines,
      "",
      pc.dim("Fix the failing tests above, then push again."),
      pc.dim("To bypass this gate once: git push --no-verify"),
    ]);
    process.exit(1);
  }
  pushFindings.push(issueToJsonFinding(issue));
  if (jsonMode) {
    emitJsonResult({
      status: "advisory",
      summary: "Push allowed, but pre-push tests failed",
    });
  }
  warningBox([
    pc.bold("Tests failed (advisory)"),
    ...summaryLines,
    "",
    pc.dim("Push allowed, but the failing tests above need attention."),
  ]);
  process.exit(0);
}

jsonOutput.addCheck({
  id: "push-tests",
  status: "passed",
  summary: "All related pre-push tests passed",
  details: {
    command: fullCommand,
    files: testFiles,
    status: result.status,
    signal: result.signal,
    outcome: testOutcome,
    summary,
  },
});

if (jsonMode) {
  emitJsonResult({
    status: pushFindings.length > 0 ? "advisory" : "clean",
    summary:
      pushFindings.length > 0
        ? "All tests passed; push allowed with advisory findings"
        : "All pre-push tests passed; push allowed",
  });
}

successBox([
  pc.bold("All tests passed"),
  ...summaryLines,
  "",
  pc.dim("Push allowed."),
]);

process.exit(0);
