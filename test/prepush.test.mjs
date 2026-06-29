import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  readFile,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runPrePush(tempDir, input = "") {
  return run("node", [path.join(tempDir, "scripts", "prepush.mjs")], tempDir, {
    input,
  });
}

// Simulate a human running the hook by hand in a terminal. We can't attach a
// real TTY from spawnSync, so use the script's interactive override seam.
function runPrePushManual(tempDir) {
  return run("node", [path.join(tempDir, "scripts", "prepush.mjs")], tempDir, {
    input: "",
    env: { ...process.env, PREPUSH_ASSUME_INTERACTIVE: "1" },
  });
}

function setConfig(tempDir, precommitChecks) {
  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = precommitChecks;
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
}

// Builds the stdin line git feeds a pre-push hook so the script diffs
// HEAD~1..HEAD (i.e. the freshly committed files) as "the push".
function pushInput(tempDir) {
  const head = run("git", ["rev-parse", "HEAD"], tempDir).stdout.trim();
  const base = run("git", ["rev-parse", "HEAD~1"], tempDir).stdout.trim();
  return `refs/heads/main ${head} refs/heads/main ${base}\n`;
}

function commitWidget(tempDir, expected) {
  writeFile(
    path.join(tempDir, "src", "widget.mjs"),
    "export const widget = () => 1;\n",
  );
  writeFile(
    path.join(tempDir, "src", "widget.test.mjs"),
    'import test from "node:test";\n' +
      'import assert from "node:assert/strict";\n' +
      'import { widget } from "./widget.mjs";\n' +
      `test("widget", () => assert.equal(widget(), ${expected}));\n`,
  );
  run("git", ["add", "src"], tempDir);
  run("git", ["commit", "-m", "add widget"], tempDir);
}

test("stays silent and allows the push when the gate is disabled (default)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Explicitly disable the gate so this test is independent of how this repo's
  // own package.json happens to be configured.
  setConfig(tempDir, { testExempt: ["scripts/lib/**"] });

  const result = runPrePush(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal(output.trim(), "");
});

test("allows the push when pushed files have no associated tests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { blockPushOnTestFailure: true });
  writeFile(path.join(tempDir, "src", "lonely.mjs"), "export const x = 1;\n");
  run("git", ["add", "src"], tempDir);
  run("git", ["commit", "-m", "add lonely"], tempDir);

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /No tests to run before push/);
});

test("ignores deleted test files in the push (no run for removed tests)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { blockPushOnTestFailure: true });
  // Add a passing test, then a commit that deletes it.
  commitWidget(tempDir, 1);
  run("git", ["rm", "src/widget.mjs", "src/widget.test.mjs"], tempDir);
  run("git", ["commit", "-m", "remove widget"], tempDir);

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /No tests to run before push/);
});

test("runs only the pushed files' tests and blocks on failure", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { blockPushOnTestFailure: true });
  commitWidget(tempDir, 2); // widget() returns 1, so asserting 2 fails

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Push blocked: tests failed/);
  // It ran widget's test specifically, not the whole suite.
  assert.match(output, /widget\.test\.mjs/);
});

test("allows the push and shows a summary when associated tests pass", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { blockPushOnTestFailure: true });
  commitWidget(tempDir, 1); // widget() returns 1, so asserting 1 passes

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /All tests passed/);
  assert.match(output, /1 passed, 0 failed/);
});

test("blocks the push when the test command cannot run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    testCommand: ["definitely-not-a-real-binary-xyz"],
  });
  commitWidget(tempDir, 1);

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /could not run tests/);
});

test("advisory mode runs tests and warns without blocking on failure", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { advisePushTests: true });
  commitWidget(tempDir, 2); // widget() returns 1, so asserting 2 fails

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  // Failing tests must NOT block the push in advisory mode.
  assert.equal(result.status, 0);
  assert.match(output, /Tests failed \(advisory\)/);
  assert.match(output, /widget\.test\.mjs/);
});

test("advisory mode shows passing summary and allows the push", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, { advisePushTests: true });
  commitWidget(tempDir, 1); // widget() returns 1, so asserting 1 passes

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /All tests passed/);
  assert.match(output, /1 passed, 0 failed/);
});

test("blockPushOnTestFailure takes precedence over advisePushTests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    advisePushTests: true,
  });
  commitWidget(tempDir, 2); // failing test

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Push blocked: tests failed/);
  // Setting both modes is a config conflict and must be surfaced.
  assert.match(output, /Conflicting pre-push config/);
});

test("advisory mode warns but allows the push when the test command cannot run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    advisePushTests: true,
    testCommand: ["definitely-not-a-real-binary-xyz"],
  });
  commitWidget(tempDir, 1);

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Could not run tests \(advisory\)/);
});

test("explains how to enable checks when run manually with no mode set", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // No push mode enabled; running by hand should not vanish silently.
  setConfig(tempDir, { testExempt: ["scripts/lib/**"] });

  const result = runPrePushManual(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Pre-push test checks are disabled/);
  assert.match(output, /blockPushOnTestFailure/);
  assert.match(output, /advisePushTests/);
});

test("stays silent during a real push when no mode is set", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Git invocation (refs piped on stdin) must stay completely silent.
  setConfig(tempDir, { testExempt: ["scripts/lib/**"] });

  const result = runPrePush(tempDir, pushInput(tempDir));
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal(output.trim(), "");
});
