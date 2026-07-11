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
  precommitConfigWarningMessages,
} from "./lib/config.mjs";
import { parseNodeTestSummary } from "./lib/checks.mjs";
import { collectTestsForFiles, parseNameStatusPaths } from "./lib/files.mjs";
import {
  branchFromRef,
  isProtectedBranch,
  resolveGuardConfig,
} from "./lib/commit-guards.mjs";

// Git's well-known empty-tree object, used as the conservative fallback for a
// genuinely unrelated/new history (or when no safe existing base is known).
const SHA1_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// Force literal, unquoted paths (as the pre-commit/fix flows already do) so
// pushed files with spaces or non-ASCII names still match their associated
// tests instead of arriving octal-escaped from git.
const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

const config = loadPrecommitConfig();

// Typo'd keys and invalid values fall back safely. Surface each diagnostic on
// one concise advisory line without turning pre-push checks into a blocker.
for (const message of precommitConfigWarningMessages(config)) {
  console.warn(pc.yellow(`⚠ ${message}`));
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

// Two opt-in modes for running the suite before a push:
//   blockPushOnTestFailure: run tests and block the push if any fail.
//   advisePushTests:        run tests and report results, but never block.
// `blockPushOnTestFailure` wins if both are set. With neither, stay out of the
// way entirely — preserving the tool's non-blocking-by-default philosophy.
const blocking = config.blockPushOnTestFailure === true;
const advisory = !blocking && config.advisePushTests === true;

// Git represents an absent object with an all-zero object ID whose length
// follows the repository hash format (40 for SHA-1, 64 for SHA-256).
function isZeroObjectId(value) {
  return typeof value === "string" && /^0{40,}$/.test(value);
}

// The two modes are mutually exclusive; if a repo sets both, surface the
// conflict (one concise line on stderr) so it's clearly a config mistake rather
// than silently ignored — without shoving a full box in front of every push.
if (blocking && config.advisePushTests === true) {
  console.warn(
    pc.yellow(
      "⚠ Both blockPushOnTestFailure and advisePushTests are set; using " +
        "blockPushOnTestFailure (block on failure). Remove advisePushTests " +
        "from package.json to silence this.",
    ),
  );
}

// Read the pushed refs once, before any mode decision: the protected-branch
// guard applies even when both test modes are off. Interactive manual runs
// resolve to no refs instantly, so this never blocks a terminal session.
const pushRefs = await readPushRefs();

const guardConfig = resolveGuardConfig(config);
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
  warningBox([
    pc.bold("Pushing to a protected branch."),
    "",
    pc.dim(`This push updates ${named} directly.`),
    "",
    pc.dim("Push will continue."),
  ]);
}

if (!blocking && !advisory) {
  // Silent during a real `git push` (the documented non-blocking default), but
  // when a human runs this by hand it would otherwise exit with no output and
  // look broken — so explain why nothing ran and how to turn a mode on.
  if (interactive) {
    infoBox([
      pc.bold("Pre-push test checks are disabled."),
      "",
      pc.dim("Nothing ran because no pre-push test mode is enabled in"),
      pc.dim("package.json. Enable one under precommitChecks:"),
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
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({
      localRef,
      localSha,
      remoteRef,
      remoteSha,
    }))
    .filter((ref) => ref.localSha && !isZeroObjectId(ref.localSha));
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

function outputLines(output) {
  return (output || "").split("\n").filter(Boolean);
}

let emptyTreeObject;
function emptyTree() {
  if (emptyTreeObject) {
    return emptyTreeObject;
  }
  const result = run("git", ["hash-object", "-t", "tree", "--stdin"], {
    input: "",
  });
  emptyTreeObject =
    !result.error && result.status === 0
      ? outputLines(result.stdout)[0]
      : SHA1_EMPTY_TREE;
  return emptyTreeObject || SHA1_EMPTY_TREE;
}

function remoteBaseRefs(localRef) {
  const candidates = new Map();
  let upstreamRef = null;
  const add = (ref, priority) => {
    if (ref && !candidates.has(ref)) {
      candidates.set(ref, priority);
    }
  };

  // An explicitly configured upstream is the strongest signal for the branch
  // point, even when the destination branch itself does not exist yet.
  if (localRef?.startsWith("refs/heads/")) {
    const localBranch = localRef.slice("refs/heads/".length);
    const upstream = run("git", [
      "rev-parse",
      "--verify",
      "--symbolic-full-name",
      `${localBranch}@{upstream}`,
    ]);
    if (!upstream.error && upstream.status === 0) {
      [upstreamRef] = outputLines(upstream.stdout);
    }
  }

  // New generated hooks forward Git's destination remote as argv[2]. Older
  // hooks and manual/test runs may not, so infer it only when exactly one remote
  // is configured. A destination-ambiguous repository falls back to the empty
  // tree rather than borrowing a base from the wrong remote.
  let remoteName = process.argv[2];
  if (!remoteName) {
    const remotes = run("git", ["remote"]);
    if (remotes.error || remotes.status !== 0) {
      return [];
    }
    const names = outputLines(remotes.stdout);
    if (names.length > 1) {
      return [];
    }
    [remoteName] = names;
  }
  if (
    upstreamRef?.startsWith("refs/heads/") ||
    (remoteName && upstreamRef?.startsWith(`refs/remotes/${remoteName}/`))
  ) {
    add(upstreamRef, 0);
  }
  const prefix = remoteName ? `refs/remotes/${remoteName}/` : "refs/remotes/";
  const refs = run("git", ["for-each-ref", "--format=%(refname)", prefix]);
  if (!refs.error && refs.status === 0) {
    const remoteRefs = outputLines(refs.stdout);
    for (const ref of remoteRefs) {
      add(ref, ref.endsWith("/HEAD") ? 1 : 2);
    }
  }

  return [...candidates].map(([ref, priority]) => ({ ref, priority }));
}

function firstPushBase(localRef, localSha) {
  const viable = [];

  for (const candidate of remoteBaseRefs(localRef)) {
    const mergeBase = run("git", [
      "merge-base",
      "--all",
      localSha,
      candidate.ref,
    ]);
    if (mergeBase.error || mergeBase.status !== 0) {
      continue;
    }

    // Multiple merge bases (possible after criss-cross merges) do not identify
    // one unambiguous diff boundary. Falling back to the empty tree is more
    // expensive but cannot skip tests.
    const bases = outputLines(mergeBase.stdout);
    if (bases.length !== 1) {
      continue;
    }

    const distance = run("git", [
      "rev-list",
      "--count",
      `${bases[0]}..${localSha}`,
    ]);
    const count = Number(outputLines(distance.stdout)[0]);
    if (
      distance.error ||
      distance.status !== 0 ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      continue;
    }

    viable.push({
      base: bases[0],
      distance: count,
      priority: candidate.priority,
      ref: candidate.ref,
    });
  }

  viable.sort(
    (left, right) =>
      left.distance - right.distance ||
      left.priority - right.priority ||
      (left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0),
  );
  if (viable.length === 0) {
    return emptyTree();
  }
  const closestBases = new Set(
    viable
      .filter((candidate) => candidate.distance === viable[0].distance)
      .map((candidate) => candidate.base),
  );
  return closestBases.size === 1 ? viable[0].base : emptyTree();
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
    for (const { localRef, localSha, remoteSha } of refs) {
      const base =
        remoteSha && !isZeroObjectId(remoteSha)
          ? remoteSha
          : firstPushBase(localRef, localSha);
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
  if (blocking) {
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

// Deleted/renamed test paths can appear in the diff so deleted source paths
// remain useful for related-test discovery. Never pass a test that no longer
// exists in the working tree to the runner.
const testFiles = collectTestsForFiles(pushedFiles).filter((file) =>
  fs.existsSync(file),
);

if (testFiles.length === 0) {
  infoBox([
    pc.bold("No tests to run before push"),
    "",
    pc.dim("None of the pushed files have associated tests. Push allowed."),
  ]);
  process.exit(0);
}

const fullCommand = [...testCommand, ...testFiles];

console.log("");
console.log(pc.dim(`Running tests for pushed files: ${fullCommand.join(" ")}`));
console.log("");

// Avoid leaking this process's test-runner context into the spawned suite.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

// When the runner is `node --test`, keep this terminal attached so its colored
// spec reporter streams through unchanged, and capture the pass/fail counts via
// a second TAP reporter written to a temp file. For any other (custom) runner we
// fall back to a tee: stream its output live while capturing it for a best-effort
// summary.
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
    stdio: "inherit",
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
    echo: true,
  });
  summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
}

console.log("");

const summaryLines = summary
  ? ["", pc.dim(`${summary.passed} passed, ${summary.failed} failed`)]
  : [];

if (
  result.outcome === "timeout" ||
  result.outcome === "spawn-error" ||
  result.outcome === "signal"
) {
  const timeoutCleanup =
    result.cleanup === "direct-child"
      ? "the direct child was stopped, but descendant cleanup was unavailable"
      : "attached process-tree cleanup completed";
  const reason = pc.dim(
    result.outcome === "timeout"
      ? `The test command timed out after ${TOOL_TIMEOUT_MS / 1000}s; ${timeoutCleanup}.`
      : result.outcome === "signal"
        ? `The test command stopped after ${result.signal || "an unknown signal"}.`
        : "Check precommitChecks.testCommand in package.json.",
  );
  if (blocking) {
    errorBox([pc.bold("Push blocked: could not run tests"), "", reason]);
    process.exit(1);
  }
  warningBox([
    pc.bold("Could not run tests (advisory)"),
    "",
    reason,
    pc.dim("Push allowed."),
  ]);
  process.exit(0);
}

if (result.outcome === "nonzero") {
  if (blocking) {
    errorBox([
      pc.bold("Push blocked: tests failed"),
      ...summaryLines,
      "",
      pc.dim("Fix the failing tests above, then push again."),
      pc.dim("To bypass this gate once: git push --no-verify"),
    ]);
    process.exit(1);
  }
  warningBox([
    pc.bold("Tests failed (advisory)"),
    ...summaryLines,
    "",
    pc.dim("Push allowed, but the failing tests above need attention."),
  ]);
  process.exit(0);
}

successBox([
  pc.bold("All tests passed"),
  ...summaryLines,
  "",
  pc.dim("Push allowed."),
]);

process.exit(0);
