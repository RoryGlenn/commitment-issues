import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import { run, spawnAsync, TOOL_TIMEOUT_MS } from "./lib/process.mjs";
import { loadPrecommitConfig } from "./lib/config.mjs";
import { parseNodeTestSummary } from "./lib/checks.mjs";
import { collectTestsForFiles } from "./lib/files.mjs";

const ZERO_SHA = "0".repeat(40);
// Git's well-known empty-tree object, used as the diff base for a brand-new
// branch (no remote sha yet) so every file in the pushed history counts.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const config = loadPrecommitConfig();

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
    .map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }))
    .filter((ref) => ref.localSha && ref.localSha !== ZERO_SHA);
}

function diffFiles(base, head) {
  // Exclude deletions (--diff-filter=ACMRT): a deleted test file must not be
  // re-run, or the gate would fail trying to load a file that no longer exists.
  const result = run("git", [
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    base,
    head,
  ]);
  if ((result.status || 0) !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function getPushedFiles() {
  const refs = await readPushRefs();
  const files = new Set();

  if (refs.length > 0) {
    for (const { localSha, remoteSha } of refs) {
      const base = remoteSha && remoteSha !== ZERO_SHA ? remoteSha : EMPTY_TREE;
      for (const file of diffFiles(base, localSha)) {
        files.add(file);
      }
    }
    return [...files];
  }

  // Fallback for manual runs (no stdin): compare against the upstream branch.
  if (run("git", ["rev-parse", "@{u}"]).status === 0) {
    for (const file of diffFiles("@{u}", "HEAD")) {
      files.add(file);
    }
  }
  return [...files];
}

const pushedFiles = await getPushedFiles();
const testFiles = collectTestsForFiles(pushedFiles);

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

if (result.error || result.signal) {
  const reason = pc.dim(
    result.signal
      ? `The test command timed out after ${TOOL_TIMEOUT_MS / 1000}s.`
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

if ((result.status || 0) !== 0) {
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
