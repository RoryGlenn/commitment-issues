import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { errorBox, infoBox, successBox } from "./lib/ui.mjs";
import { isWindows, run, spawnAsync, TOOL_TIMEOUT_MS } from "./lib/process.mjs";
import { loadPrecommitConfig } from "./lib/config.mjs";
import { parseNodeTestSummary } from "./lib/checks.mjs";
import { collectTestsForFiles } from "./lib/files.mjs";

const ZERO_SHA = "0".repeat(40);
// Git's well-known empty-tree object, used as the diff base for a brand-new
// branch (no remote sha yet) so every file in the pushed history counts.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const config = loadPrecommitConfig();

// Opt-in only: stay completely silent and allow the push unless the repo has
// explicitly enabled the gate. This preserves the tool's non-blocking default
// at commit time while letting teams enforce a green suite before sharing code.
if (!config.blockPushOnTestFailure) {
  process.exit(0);
}

const testCommand =
  Array.isArray(config.testCommand) && config.testCommand.length > 0
    ? config.testCommand
    : ["node", "--test"];

// Git feeds the pre-push hook "<local ref> <local sha> <remote ref> <remote
// sha>" lines on stdin. Read them to learn exactly what is being pushed.
function stdinIsPiped() {
  if (process.stdin.isTTY) {
    return false;
  }
  try {
    const stat = fs.fstatSync(0);
    return stat.isFIFO() || stat.isFile() || stat.isSocket();
  } catch {
    return false;
  }
}

async function readPushRefs() {
  // `isTTY` is unreliable on Windows (undefined under Git Bash/MSYS), so detect
  // piped input directly: git connects fd 0 to a pipe/file when it runs the
  // hook, whereas a manual run leaves it on the interactive terminal. Without
  // this, a manual `node scripts/prepush.mjs` would block forever reading stdin.
  if (!stdinIsPiped()) {
    return [];
  }
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
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
    shell: isWindows,
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
    shell: isWindows,
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
  errorBox([
    pc.bold("Push blocked: could not run tests"),
    "",
    pc.dim(
      result.signal
        ? `The test command timed out after ${TOOL_TIMEOUT_MS / 1000}s.`
        : "Check precommitChecks.testCommand in package.json.",
    ),
  ]);
  process.exit(1);
}

if ((result.status || 0) !== 0) {
  errorBox([
    pc.bold("Push blocked: tests failed"),
    ...summaryLines,
    "",
    pc.dim("Fix the failing tests above, then push again."),
    pc.dim("To bypass this gate once: git push --no-verify"),
  ]);
  process.exit(1);
}

successBox([
  pc.bold("All tests passed"),
  ...summaryLines,
  "",
  pc.dim("Push allowed."),
]);

process.exit(0);
