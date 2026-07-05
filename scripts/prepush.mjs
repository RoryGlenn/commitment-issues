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
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

const config = loadPrecommitConfig();
const interactive =
  process.stdin.isTTY === true ||
  process.env.COMMITMENT_ISSUES_ASSUME_TTY === "1";
const blocking = config.blockPushOnTestFailure === true;
const advisory = !blocking && config.advisePushTests === true;

if (blocking && config.advisePushTests === true) {
  console.warn(
    pc.yellow(
      "⚠ Both blockPushOnTestFailure and advisePushTests are set; using blockPushOnTestFailure.",
    ),
  );
}

if (!blocking && !advisory) {
  if (interactive) {
    infoBox([
      pc.bold("Pre-push test checks are disabled."),
      "",
      pc.dim("Enable blockPushOnTestFailure or advisePushTests in package.json."),
    ]);
  }
  process.exit(0);
}

const testCommand =
  Array.isArray(config.testCommand) && config.testCommand.length > 0
    ? config.testCommand
    : ["node", "--test"];

function readStdin() {
  if (interactive) {
    return Promise.resolve("");
  }

  return new Promise((resolve) => {
    let raw = "";
    let settled = false;
    let timer;
    const done = () => {
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
    .filter(({ localSha }) => localSha && localSha !== ZERO_SHA);
}

function diffFiles(base, head) {
  const result = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    base,
    head,
  ]);
  if (result.error || (result.status || 0) !== 0) {
    const detail =
      (result.stderr || "").trim() ||
      result.error?.message ||
      `git diff failed with exit code ${result.status ?? "unknown"}`;
    return { ok: false, files: [], detail };
  }
  return {
    ok: true,
    files: result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

async function getPushedFiles() {
  const refs = await readPushRefs();
  const files = new Set();
  const diffErrors = [];
  const ranges =
    refs.length > 0
      ? refs.map(({ localSha, remoteSha }) => ({
          base: remoteSha && remoteSha !== ZERO_SHA ? remoteSha : EMPTY_TREE,
          head: localSha,
        }))
      : run("git", ["rev-parse", "@{u}"]).status === 0
        ? [{ base: "@{u}", head: "HEAD" }]
        : [];

  for (const { base, head } of ranges) {
    const diff = diffFiles(base, head);
    if (diff.ok) {
      for (const file of diff.files) {
        files.add(file);
      }
    } else {
      diffErrors.push(diff.detail);
    }
  }
  return { files: [...files], diffErrors };
}

const pushed = await getPushedFiles();
if (pushed.diffErrors.length > 0) {
  const details = pushed.diffErrors.slice(0, 3).map((detail) => pc.dim(detail));
  if (blocking) {
    errorBox([
      pc.bold("Push blocked: could not inspect pushed files"),
      "",
      ...details,
      pc.dim("Fix the Git diff issue, then push again."),
    ]);
    process.exit(1);
  }
  warningBox([
    pc.bold("Could not inspect pushed files (advisory)"),
    "",
    ...details,
    pc.dim("Push allowed."),
  ]);
  process.exit(0);
}

const testFiles = collectTestsForFiles(pushed.files);
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

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const isNodeTest =
  /(^|[/\\])node(\.exe)?$/i.test(testCommand[0]) &&
  testCommand.includes("--test");
let result;
let summary = null;

if (isNodeTest) {
  const tapFile = path.join(os.tmpdir(), `prepush-tap-${process.pid}.tap`);
  result = await spawnAsync(
    testCommand[0],
    [
      ...testCommand.slice(1),
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=tap",
      `--test-reporter-destination=${tapFile}`,
      ...testFiles,
    ],
    { env, stdio: "inherit" },
  );
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
