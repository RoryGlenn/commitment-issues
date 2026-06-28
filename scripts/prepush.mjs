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
async function readPushRefs() {
  if (process.stdin.isTTY) {
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
  const result = run("git", ["diff", "--name-only", base, head]);
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

// Stream the test output live (echo) while also capturing it, so we can render
// a parsed pass/fail summary in the verdict box for a consistent, scannable end.
const result = await spawnAsync(fullCommand[0], fullCommand.slice(1), {
  shell: isWindows,
  env,
  echo: true,
});

console.log("");

const summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
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
