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

function runPrePush(tempDir) {
  return run("node", [path.join(tempDir, "scripts", "prepush.mjs")], tempDir);
}

function setConfig(tempDir, precommitChecks) {
  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = precommitChecks;
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
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

test("blocks the push when enabled and tests fail", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    pushTestCommand: ["node", "-e", "process.exit(1)"],
  });

  const result = runPrePush(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Push blocked: tests failed/);
});

test("allows the push when enabled and tests pass", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    pushTestCommand: ["node", "-e", "process.exit(0)"],
  });

  const result = runPrePush(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /All tests passed/);
});

test("shows a parsed pass/fail summary in the box for node --test", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "test", "sample.test.mjs"),
    'import test from "node:test";\n' +
      'test("a", () => {});\n' +
      'test("b", () => {});\n',
  );
  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    pushTestCommand: ["node", "--test", "test/sample.test.mjs"],
  });

  const result = runPrePush(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /2 passed, 0 failed/);
});

test("blocks the push when the test command cannot run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setConfig(tempDir, {
    blockPushOnTestFailure: true,
    pushTestCommand: ["definitely-not-a-real-binary-xyz"],
  });

  const result = runPrePush(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /could not run tests/);
});
