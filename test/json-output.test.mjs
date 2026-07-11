// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readFile,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";
import {
  JSON_OUTPUT_SCHEMA_VERSION,
  createJsonOutput,
  issueToJsonFinding,
  normalizeProcessOutcome,
  parseJsonOutputArgs,
} from "../scripts/lib/json-output.mjs";

function cli(tempDir, args, options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "cli.mjs"), ...args],
    tempDir,
    options,
  );
}

function jsonPayload(result) {
  assert.match(result.stdout, /^\{.*\}\n$/s);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, JSON_OUTPUT_SCHEMA_VERSION);
  assert.equal(payload.exitCode, result.status);
  for (const key of [
    "command",
    "mode",
    "status",
    "summary",
    "checks",
    "findings",
    "suggestions",
    "diagnostics",
  ]) {
    assert.ok(Object.hasOwn(payload, key), `payload has ${key}`);
  }
  return payload;
}

function commitConfig(tempDir, config) {
  setPrecommitConfig(tempDir, config);
  run("git", ["add", "package.json"], tempDir);
  run("git", ["commit", "-m", "configure checks"], tempDir);
}

function pushInput(tempDir) {
  const head = run("git", ["rev-parse", "HEAD"], tempDir).stdout.trim();
  const base = run("git", ["rev-parse", "HEAD~1"], tempDir).stdout.trim();
  return `refs/heads/main ${head} refs/heads/main ${base}\n`;
}

function addPushedTestFixture(tempDir) {
  writeFile(
    path.join(tempDir, "src", "widget.mjs"),
    "export const widget = () => 1;\n",
  );
  writeFile(path.join(tempDir, "src", "widget.test.mjs"), "export {};\n");
  run("git", ["add", "src"], tempDir);
  run("git", ["commit", "-m", "add widget"], tempDir);
}

function configureCustomPushRunner(tempDir, { blocking = false, exit = 0 }) {
  writeFile(
    path.join(tempDir, "json-test-runner.mjs"),
    `process.stdout.write("child stdout sentinel\\n");
process.stderr.write("child stderr sentinel\\n");
process.exit(${exit});
`,
  );
  const config = {
    protectedBranches: [],
    testCommand: ["node", "json-test-runner.mjs"],
    ...(blocking
      ? { blockPushOnTestFailure: true }
      : { advisePushTests: true }),
  };
  setPrecommitConfig(tempDir, config);
  run("git", ["add", "package.json", "json-test-runner.mjs"], tempDir);
  run("git", ["commit", "-m", "configure push checks"], tempDir);
}

test("JSON helpers parse supported arguments and normalize findings", () => {
  assert.deepEqual(parseJsonOutputArgs(["--json"]), {
    enabled: true,
    positionals: [],
    error: null,
  });
  assert.deepEqual(
    parseJsonOutputArgs(
      ["origin", "https://example.invalid/repo", "--json"],
      2,
    ),
    {
      enabled: true,
      positionals: ["origin", "https://example.invalid/repo"],
      error: null,
    },
  );
  assert.match(parseJsonOutputArgs(["--json", "--json"]).error, /once/);
  assert.match(parseJsonOutputArgs(["--json=pretty"]).error, /without a value/);
  assert.match(parseJsonOutputArgs(["--json", "--wat"]).error, /--wat/);
  assert.match(
    parseJsonOutputArgs(["--json", "one", "two"], 1).error,
    /at most 1 positional argument/,
  );

  assert.deepEqual(
    issueToJsonFinding({
      type: "format",
      message: "format it",
      autoFixable: true,
      detail: "a.js\nb.js",
    }),
    {
      check: "format",
      severity: "warning",
      message: "format it",
      autoFixable: true,
      details: ["a.js", "b.js"],
    },
  );
  assert.deepEqual(issueToJsonFinding({ detail: [1, "two"] }).details, [
    "1",
    "two",
  ]);

  assert.equal(
    normalizeProcessOutcome({
      outcome: "timeout",
      timedOut: true,
      status: null,
      signal: null,
    }),
    "timeout",
  );
  assert.equal(
    normalizeProcessOutcome({ timedOut: true, status: null, signal: null }),
    "timeout",
  );
  assert.equal(
    normalizeProcessOutcome({ status: null, signal: "SIGTERM" }),
    "timeout",
  );
  assert.equal(
    normalizeProcessOutcome({ status: null, signal: "SIGKILL" }),
    "signal",
  );
  assert.equal(
    normalizeProcessOutcome({ status: null, signal: "SIGINT" }),
    "signal",
  );
  assert.equal(
    normalizeProcessOutcome({ outcome: "signal", signal: "SIGTERM" }),
    "signal",
  );
  assert.equal(
    normalizeProcessOutcome({ error: { code: "ENOENT" }, status: null }),
    "spawn-error",
  );
  assert.equal(normalizeProcessOutcome({ status: 2 }), "nonzero");
  assert.equal(normalizeProcessOutcome({ status: 0 }), "success");

  const output = createJsonOutput({ command: "precommit", mode: "advisory" });
  output.addCheck({ id: "example", status: "unknown", summary: "fallback" });
  output.addDiagnostic({
    severity: "error",
    code: "example.error",
    message: "bad input",
  });
  const result = output.result({
    status: "error",
    exitCode: 1,
    summary: "bad",
  });
  assert.equal(result.checks[0].status, "failed");
  assert.deepEqual(result.checks[0].details, {});
  assert.equal(result.diagnostics[0].severity, "error");
});

test("precommit --json reports skipped and clean states", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  let result = cli(tempDir, ["precommit", "--json"]);
  let payload = jsonPayload(result);
  assert.equal(result.stderr, "");
  assert.equal(payload.command, "precommit");
  assert.equal(payload.status, "skipped");

  commitConfig(tempDir, { protectedBranches: [], requireTests: false });
  writeFile(path.join(tempDir, "src", "clean.json"), '{ "ok": true }\n');
  run("git", ["add", "src/clean.json"], tempDir);

  result = cli(tempDir, ["precommit", "--json"]);
  payload = jsonPayload(result);
  assert.equal(result.stderr, "");
  assert.equal(payload.status, "clean");
  assert.equal(payload.findings.length, 0);
  assert.equal(
    payload.checks.find((check) => check.id === "prettier").status,
    "passed",
  );
});

test("JSON mode reports only effective blocking posture", (t) => {
  const precommitDir = createTempRepo();
  const disabledPushDir = createTempRepo();
  const advisoryPushDir = createTempRepo();
  t.after(() => cleanupTempRepo(precommitDir));
  t.after(() => cleanupTempRepo(disabledPushDir));
  t.after(() => cleanupTempRepo(advisoryPushDir));

  setPrecommitConfig(precommitDir, {
    blockOnSecrets: true,
    scanSecrets: false,
    blockProtectedBranches: true,
    protectedBranches: [],
    requireTests: false,
  });
  writeFile(path.join(precommitDir, "src", "clean.json"), '{ "ok": true }\n');
  run("git", ["add", "src/clean.json"], precommitDir);
  let payload = jsonPayload(cli(precommitDir, ["precommit", "--json"]));
  assert.equal(payload.mode, "advisory");

  setPrecommitConfig(disabledPushDir, {
    blockProtectedBranches: true,
    protectedBranches: [],
  });
  payload = jsonPayload(cli(disabledPushDir, ["prepush", "--json"]));
  assert.equal(payload.mode, "disabled");

  setPrecommitConfig(advisoryPushDir, { protectedBranches: ["main"] });
  payload = jsonPayload(cli(advisoryPushDir, ["prepush", "--json"]));
  assert.equal(payload.mode, "advisory");
});

test("precommit --json reports advisory findings and a safe command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  commitConfig(tempDir, { protectedBranches: [], requireTests: false });
  writeFile(path.join(tempDir, "src", "format.json"), '{"ok":true}\n');
  run("git", ["add", "src/format.json"], tempDir);

  const result = cli(tempDir, ["precommit", "--json"]);
  const payload = jsonPayload(result);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.status, "advisory");
  assert.ok(payload.findings.some((finding) => finding.check === "format"));
  assert.match(payload.suggestions[0].command, /commit:fix/);
  assert.doesNotMatch(result.stdout, /Pre-commit suggestions found|╭|╰/);
});

test("JSON configuration diagnostics stay structured", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, {
    requireTest: false,
    requireTests: "nope",
    commitMessage: { blockOnFailure: true },
  });
  const result = cli(tempDir, ["precommit", "--json"]);
  const payload = jsonPayload(result);

  assert.equal(result.stderr, "");
  assert.equal(payload.diagnostics[0].code, "config.unknown-keys");
  assert.match(payload.diagnostics[0].message, /requireTest/);
  assert.equal(payload.diagnostics[1].code, "config.invalid-values");
  assert.match(payload.diagnostics[1].message, /requireTests/);
  assert.equal(payload.diagnostics[2].code, "config.ineffective-value");
  assert.match(payload.diagnostics[2].message, /blockOnFailure/);
});

test("JSON configuration diagnostics identify standalone sources", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, ".commitmentrc.json"),
    '{"requireTest":false,"requireTests":"nope"}\n',
  );
  let result = cli(tempDir, ["precommit", "--json"]);
  let payload = jsonPayload(result);

  assert.equal(result.stderr, "");
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    ["config.unknown-keys", "config.invalid-values"],
  );
  assert.match(payload.diagnostics[0].message, /\.commitmentrc\.json/);
  assert.match(payload.diagnostics[1].message, /\.commitmentrc\.json/);

  writeFile(path.join(tempDir, ".commitmentrc.json"), "{ invalid\n");
  result = cli(tempDir, ["precommit", "--json"]);
  payload = jsonPayload(result);
  assert.equal(payload.diagnostics[0].code, "config.invalid-source");
  assert.match(payload.diagnostics[0].message, /contains invalid JSON/);
});

test("precommit JSON covers blocking and fail-open guard outcomes", (t) => {
  const branchDir = createTempRepo();
  const secretDir = createTempRepo();
  const gitDir = createTempRepo();
  const earlyDir = createTempRepo();
  t.after(() => cleanupTempRepo(branchDir));
  t.after(() => cleanupTempRepo(secretDir));
  t.after(() => cleanupTempRepo(gitDir));
  t.after(() => cleanupTempRepo(earlyDir));

  setPrecommitConfig(branchDir, {
    blockProtectedBranches: true,
    protectedBranches: ["main", "master"],
  });
  let result = cli(branchDir, ["precommit", "--json"]);
  let payload = jsonPayload(result);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings[0].check, "branch");

  commitConfig(secretDir, {
    blockOnSecrets: true,
    protectedBranches: [],
  });
  writeFile(path.join(secretDir, ".env"), "PASSWORD=not-printed\n");
  run("git", ["add", ".env"], secretDir);
  result = cli(secretDir, ["precommit", "--json"]);
  payload = jsonPayload(result);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings[0].check, "secrets");

  const env = fakeGitEnv(gitDir, "--diff-filter=ACMRT");
  result = cli(gitDir, ["precommit", "--json"], { env });
  payload = jsonPayload(result);
  assert.equal(payload.status, "advisory");
  assert.equal(payload.findings[0].check, "git");

  commitConfig(earlyDir, { protectedBranches: ["main", "master"] });
  writeFile(path.join(earlyDir, "assets", "raw.bin"), "fixture\n");
  run("git", ["add", "assets/raw.bin"], earlyDir);
  result = cli(earlyDir, ["precommit", "--json"]);
  payload = jsonPayload(result);
  assert.equal(payload.status, "advisory");
  assert.ok(payload.findings.some((finding) => finding.check === "branch"));
});

test("JSON argument errors are machine-readable and unsupported commands fail clearly", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  let result = cli(tempDir, ["precommit", "--json", "--json"]);
  const payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "error");
  assert.equal(payload.diagnostics[0].code, "arguments.invalid");

  result = cli(tempDir, ["precommit", "--json=pretty"]);
  assert.equal(result.status, 1);
  assert.match(jsonPayload(result).diagnostics[0].message, /without a value/);

  result = cli(tempDir, ["doctor", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /only supported by 'precommit' and 'prepush'/);
});

test("prepush --json forwards Git arguments and keeps child output on stderr", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  configureCustomPushRunner(tempDir, { exit: 2 });
  addPushedTestFixture(tempDir);

  const result = cli(
    tempDir,
    ["prepush", "origin", "https://example.invalid/repo.git", "--json"],
    { input: pushInput(tempDir) },
  );
  const payload = jsonPayload(result);

  assert.equal(result.status, 0);
  assert.equal(payload.command, "prepush");
  assert.equal(payload.status, "advisory");
  assert.equal(
    payload.checks.find((check) => check.id === "push-tests").status,
    "advisory",
  );
  assert.doesNotMatch(result.stdout, /child (stdout|stderr) sentinel/);
  assert.match(result.stderr, /child stdout sentinel/);
  assert.match(result.stderr, /child stderr sentinel/);
});

test("prepush --json reports clean and blocking subprocess results", (t) => {
  const cleanDir = createTempRepo();
  const blockedDir = createTempRepo();
  t.after(() => cleanupTempRepo(cleanDir));
  t.after(() => cleanupTempRepo(blockedDir));

  configureCustomPushRunner(cleanDir, { exit: 0 });
  addPushedTestFixture(cleanDir);
  let result = cli(cleanDir, ["prepush", "--json"], {
    input: pushInput(cleanDir),
  });
  let payload = jsonPayload(result);
  assert.equal(payload.status, "clean");
  assert.equal(result.status, 0);

  configureCustomPushRunner(blockedDir, { blocking: true, exit: 2 });
  addPushedTestFixture(blockedDir);
  result = cli(blockedDir, ["prepush", "--json"], {
    input: pushInput(blockedDir),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings.at(-1).severity, "error");
});

test("prepush JSON covers disabled mode, argument errors, and node test output", (t) => {
  const disabledDir = createTempRepo();
  const nodeDir = createTempRepo();
  t.after(() => cleanupTempRepo(disabledDir));
  t.after(() => cleanupTempRepo(nodeDir));

  setPrecommitConfig(disabledDir, { protectedBranches: [] });
  let result = cli(disabledDir, ["prepush", "--json"]);
  let payload = jsonPayload(result);
  assert.equal(payload.mode, "disabled");
  assert.equal(payload.status, "skipped");

  result = cli(disabledDir, ["prepush", "one", "two", "three", "--json"]);
  payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "error");

  commitConfig(nodeDir, {
    advisePushTests: true,
    protectedBranches: [],
  });
  addPushedTestFixture(nodeDir);
  result = cli(nodeDir, ["prepush", "--json"], {
    input: pushInput(nodeDir),
  });
  payload = jsonPayload(result);
  assert.equal(payload.status, "clean");
  assert.equal(
    payload.checks.find((check) => check.id === "push-tests").details.summary
      .failed,
    0,
  );
  assert.doesNotMatch(result.stdout, /✔|ℹ tests/);
  assert.match(result.stderr, /widget\.test\.mjs/);
});

test("prepush JSON covers configuration, policy, and failure edge outcomes", (t) => {
  const configDir = createTempRepo();
  const guardDir = createTempRepo();
  const advisoryDiffDir = createTempRepo();
  const blockingDiffDir = createTempRepo();
  const noTestsDir = createTempRepo();
  const advisoryRunnerDir = createTempRepo();
  const blockingRunnerDir = createTempRepo();
  for (const dir of [
    configDir,
    guardDir,
    advisoryDiffDir,
    blockingDiffDir,
    noTestsDir,
    advisoryRunnerDir,
    blockingRunnerDir,
  ]) {
    t.after(() => cleanupTempRepo(dir));
  }

  commitConfig(configDir, {
    unknownMode: true,
    requireTests: "nope",
    commitMessage: { blockOnFailure: true },
    advisePushTests: true,
    blockPushOnTestFailure: true,
    protectedBranches: [],
  });
  let result = cli(configDir, ["prepush", "--json"], {
    input: pushInput(configDir),
  });
  let payload = jsonPayload(result);
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    [
      "config.unknown-keys",
      "config.invalid-values",
      "config.ineffective-value",
      "config.push-mode-conflict",
    ],
  );

  commitConfig(guardDir, {
    blockProtectedBranches: true,
    protectedBranches: ["main"],
  });
  result = cli(guardDir, ["prepush", "--json"], {
    input: pushInput(guardDir),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings[0].check, "branch");

  commitConfig(advisoryDiffDir, {
    advisePushTests: true,
    protectedBranches: [],
  });
  result = cli(advisoryDiffDir, ["prepush", "--json"], {
    input: pushInput(advisoryDiffDir),
    env: fakeGitEnv(advisoryDiffDir, "--name-status -z"),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 0);
  assert.equal(payload.status, "advisory");
  assert.equal(payload.findings[0].check, "git");

  commitConfig(blockingDiffDir, {
    blockPushOnTestFailure: true,
    protectedBranches: [],
  });
  result = cli(blockingDiffDir, ["prepush", "--json"], {
    input: pushInput(blockingDiffDir),
    env: fakeGitEnv(blockingDiffDir, "--name-status -z"),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings[0].check, "git");

  commitConfig(noTestsDir, {
    advisePushTests: true,
    protectedBranches: [],
  });
  writeFile(path.join(noTestsDir, "docs", "note.md"), "docs only\n");
  run("git", ["add", "docs/note.md"], noTestsDir);
  run("git", ["commit", "-m", "add docs"], noTestsDir);
  result = cli(noTestsDir, ["prepush", "--json"], {
    input: pushInput(noTestsDir),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 0);
  assert.equal(payload.status, "skipped");

  commitConfig(advisoryRunnerDir, {
    advisePushTests: true,
    protectedBranches: [],
    testCommand: ["definitely-not-installed-json-runner"],
  });
  addPushedTestFixture(advisoryRunnerDir);
  result = cli(advisoryRunnerDir, ["prepush", "--json"], {
    input: pushInput(advisoryRunnerDir),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 0);
  assert.equal(payload.status, "advisory");
  assert.equal(payload.findings.at(-1).check, "tests");

  commitConfig(blockingRunnerDir, {
    blockPushOnTestFailure: true,
    protectedBranches: [],
    testCommand: ["definitely-not-installed-json-runner"],
  });
  addPushedTestFixture(blockingRunnerDir);
  result = cli(blockingRunnerDir, ["prepush", "--json"], {
    input: pushInput(blockingRunnerDir),
  });
  payload = jsonPayload(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.findings.at(-1).check, "tests");
});

test("the published schema and documentation stay version-aligned", () => {
  const schema = JSON.parse(
    readFile(path.resolve("."), "docs/json-output.schema.json"),
  );
  assert.equal(
    schema.properties.schemaVersion.const,
    JSON_OUTPUT_SCHEMA_VERSION,
  );
  assert.match(
    fs.readFileSync(path.resolve("docs/json-output.md"), "utf8"),
    new RegExp(`schemaVersion.*${JSON_OUTPUT_SCHEMA_VERSION}`, "s"),
  );
});
