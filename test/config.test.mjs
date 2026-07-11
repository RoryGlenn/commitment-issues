// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  invalidPrecommitConfigMessages,
  KNOWN_PRECOMMIT_CONFIG_KEYS,
  loadPrecommitConfig,
  loadPrecommitConfigState,
  precommitConfigSourceLabel,
  precommitConfigWarningMessages,
  readStandalonePrecommitConfig,
  sanitizePrecommitConfig,
  STANDALONE_CONFIG_FILE,
  unknownPrecommitConfigKeys,
} from "../scripts/lib/config.mjs";

const originalCwd = process.cwd();

function withTempPackage(t, packageJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));

  t.after(() => {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  if (packageJson !== undefined) {
    const content =
      typeof packageJson === "string"
        ? packageJson
        : JSON.stringify(packageJson);
    fs.writeFileSync(path.join(dir, "package.json"), content);
  }

  process.chdir(dir);
}

function writeStandaloneConfig(value, { raw = false } = {}) {
  const content = raw ? value : JSON.stringify(value);
  fs.writeFileSync(path.join(process.cwd(), STANDALONE_CONFIG_FILE), content);
}

test("loadPrecommitConfig reads valid precommitChecks from package.json", (t) => {
  withTempPackage(t, { precommitChecks: { runStagedTests: true } });

  assert.deepEqual(loadPrecommitConfig(), { runStagedTests: true });
});

test("loadPrecommitConfig reads top-level keys from .commitmentrc.json", (t) => {
  withTempPackage(t, { name: "x" });
  writeStandaloneConfig({ runStagedTests: true, tone: "fun" });

  assert.deepEqual(loadPrecommitConfig(), {
    runStagedTests: true,
    tone: "fun",
  });
});

test("valid standalone config still loads when package.json is malformed", (t) => {
  withTempPackage(t, "{ invalid package json");
  writeStandaloneConfig({ requireTests: false });

  assert.deepEqual(loadPrecommitConfig(), { requireTests: false });
});

test("configuration discovery never executes JavaScript files", (t) => {
  withTempPackage(t, { precommitChecks: { requireTests: false } });
  fs.writeFileSync(
    path.join(process.cwd(), "commitment.config.js"),
    'throw new Error("must not execute");\n',
  );

  assert.deepEqual(loadPrecommitConfig(), { requireTests: false });
});

test("standalone keys shallowly override package.json and keep other keys", (t) => {
  withTempPackage(t, {
    precommitChecks: {
      requireTests: true,
      testExempt: ["package/**"],
      timeoutMs: 1000,
    },
  });
  writeStandaloneConfig({
    requireTests: false,
    testExempt: ["standalone/**"],
  });

  const config = loadPrecommitConfig();
  assert.deepEqual(config, {
    requireTests: false,
    testExempt: ["standalone/**"],
    timeoutMs: 1000,
  });
  assert.equal(
    precommitConfigSourceLabel(config),
    ".commitmentrc.json and package.json",
  );
});

test("an invalid standalone value overrides rather than reviving package.json", (t) => {
  withTempPackage(t, {
    precommitChecks: { requireTests: true, tone: "standard" },
  });
  writeStandaloneConfig({ requireTests: "no" });

  const config = loadPrecommitConfig();
  assert.deepEqual(config, { tone: "standard" });
  assert.deepEqual(precommitConfigWarningMessages(config), [
    "Ignoring invalid precommitChecks value(s) in .commitmentrc.json: requireTests must be a boolean.",
  ]);
});

test("malformed standalone JSON warns and falls back to package.json", (t) => {
  withTempPackage(t, { precommitChecks: { runStagedTests: true } });
  writeStandaloneConfig("{ invalid", { raw: true });

  const state = loadPrecommitConfigState();
  assert.deepEqual(state.config, { runStagedTests: true });
  assert.equal(state.standalone.error, "contains invalid JSON");
  assert.deepEqual(precommitConfigWarningMessages(state.config), [
    "Ignoring .commitmentrc.json because it contains invalid JSON. Using package.json precommitChecks or defaults instead.",
  ]);
});

test("non-object standalone roots warn and fall back to package.json", (t) => {
  const malformedRoots = [null, false, true, "enabled", 123, []];

  for (const value of malformedRoots) {
    withTempPackage(t, { precommitChecks: { requireTests: false } });
    writeStandaloneConfig(value);

    const state = loadPrecommitConfigState();
    assert.deepEqual(
      state.config,
      { requireTests: false },
      `${JSON.stringify(value)} should fall back`,
    );
    assert.equal(
      state.standalone.error,
      "must contain a JSON object at the top level",
    );
  }
});

test("standalone reader reports absent and valid files explicitly", (t) => {
  withTempPackage(t, { name: "x" });
  assert.deepEqual(readStandalonePrecommitConfig(), {
    exists: false,
    config: {},
    error: null,
  });

  writeStandaloneConfig({ advisePushTests: true });
  assert.deepEqual(readStandalonePrecommitConfig(), {
    exists: true,
    config: { advisePushTests: true },
    error: null,
  });
});

test("unknownPrecommitConfigKeys flags typo'd keys and keeps their order", () => {
  assert.deepEqual(
    unknownPrecommitConfigKeys({
      requireTest: false,
      tone: "fun",
      advisePushTest: true,
    }),
    ["requireTest", "advisePushTest"],
  );
});

test("unknownPrecommitConfigKeys accepts every documented key", () => {
  const allKnown = Object.fromEntries(
    KNOWN_PRECOMMIT_CONFIG_KEYS.map((key) => [key, true]),
  );
  assert.deepEqual(unknownPrecommitConfigKeys(allKnown), []);
});

test("unknownPrecommitConfigKeys tolerates malformed config containers", () => {
  assert.deepEqual(unknownPrecommitConfigKeys(undefined), []);
  assert.deepEqual(unknownPrecommitConfigKeys(null), []);
  assert.deepEqual(unknownPrecommitConfigKeys(["tone"]), []);
  assert.deepEqual(unknownPrecommitConfigKeys("tone"), []);
});

test("unknownPrecommitConfigKeys can diagnose sanitized config", () => {
  const sanitized = sanitizePrecommitConfig({
    runStagedTests: true,
    requireTest: false,
  });

  assert.deepEqual(unknownPrecommitConfigKeys(sanitized), ["requireTest"]);
});

test("loadPrecommitConfig returns {} when package.json is missing", (t) => {
  withTempPackage(t);

  assert.deepEqual(loadPrecommitConfig(), {});
});

test("loadPrecommitConfig returns {} when package.json is invalid", (t) => {
  withTempPackage(t, "{not-json");

  assert.deepEqual(loadPrecommitConfig(), {});
});

test("loadPrecommitConfig returns {} when precommitChecks is absent", (t) => {
  withTempPackage(t, { name: "x" });

  assert.deepEqual(loadPrecommitConfig(), {});
});

test("loadPrecommitConfig ignores malformed precommitChecks containers", (t) => {
  const malformedValues = [
    null,
    false,
    true,
    "enabled",
    123,
    [],
    ["runStagedTests"],
  ];

  for (const value of malformedValues) {
    withTempPackage(t, { precommitChecks: value });
    assert.deepEqual(
      loadPrecommitConfig(),
      {},
      `${JSON.stringify(value)} should be ignored`,
    );
  }
});

test("loadPrecommitConfig rejects malformed option values inside an object", (t) => {
  const config = {
    requireTests: "yes",
    runStagedTests: "true",
    blockPushOnTestFailure: "false",
    advisePushTests: "true",
    tone: "silly",
    testExempt: ["src/legacy/**", 123, null],
    testCommand: ["node", "--test", 42],
    timeoutMs: -1,
    unknownFutureOption: { nested: true },
  };

  withTempPackage(t, { precommitChecks: config });

  assert.deepEqual(loadPrecommitConfig(), {});
});

test("loadPrecommitConfig keeps valid values and omits invalid values", (t) => {
  withTempPackage(t, {
    precommitChecks: {
      requireTests: false,
      runStagedTests: true,
      blockPushOnTestFailure: "false",
      tone: "fun",
      testExempt: ["src/legacy/**"],
      testCommand: ["node", "--test"],
      timeoutMs: 30000,
    },
  });

  assert.deepEqual(loadPrecommitConfig(), {
    requireTests: false,
    runStagedTests: true,
    tone: "fun",
    testExempt: ["src/legacy/**"],
    testCommand: ["node", "--test"],
    timeoutMs: 30000,
  });
});

test("invalidPrecommitConfigMessages reports invalid recognized values", () => {
  assert.deepEqual(
    invalidPrecommitConfigMessages({
      requireTests: "yes",
      runStagedTests: "true",
      blockPushOnTestFailure: "false",
      advisePushTests: "true",
      tone: "silly",
      testExempt: ["src/legacy/**", 123],
      testCommand: [],
      timeoutMs: 0,
    }),
    [
      "advisePushTests must be a boolean",
      "blockPushOnTestFailure must be a boolean",
      "requireTests must be a boolean",
      "runStagedTests must be a boolean",
      'tone must be "standard" or "fun"',
      "testExempt must be an array of strings",
      "testCommand must be a non-empty array of non-empty strings",
      "timeoutMs must be a positive finite number",
    ],
  );
});

test("invalidPrecommitConfigMessages reports invalid guard values", () => {
  assert.deepEqual(
    invalidPrecommitConfigMessages({
      adviseBehindUpstream: "no",
      blockProtectedBranches: 1,
      protectedBranches: "main",
      generatedPaths: [42],
      maxCommitFiles: -1,
      maxCommitLines: "many",
      maxFileSizeMb: Infinity,
      scanSecrets: "yes",
      blockOnSecrets: 0,
      secretExempt: "test/**",
    }),
    [
      "adviseBehindUpstream must be a boolean",
      "blockOnSecrets must be a boolean",
      "blockProtectedBranches must be a boolean",
      "scanSecrets must be a boolean",
      "generatedPaths must be an array of strings",
      "protectedBranches must be an array of strings",
      "secretExempt must be an array of strings",
      "maxCommitFiles must be a non-negative finite number",
      "maxCommitLines must be a non-negative finite number",
      "maxFileSizeMb must be a non-negative finite number",
    ],
  );
});

test("sanitizePrecommitConfig keeps valid guard values including disables", () => {
  assert.deepEqual(
    sanitizePrecommitConfig({
      adviseBehindUpstream: false,
      blockProtectedBranches: true,
      protectedBranches: ["main", "release/*"],
      generatedPaths: [],
      maxCommitFiles: 0,
      maxCommitLines: 500,
      maxFileSizeMb: 2.5,
    }),
    {
      adviseBehindUpstream: false,
      blockProtectedBranches: true,
      protectedBranches: ["main", "release/*"],
      generatedPaths: [],
      maxCommitFiles: 0,
      maxCommitLines: 500,
      maxFileSizeMb: 2.5,
    },
  );
});

test("sanitizePrecommitConfig omits invalid guard values", () => {
  assert.deepEqual(
    sanitizePrecommitConfig({
      protectedBranches: "main",
      generatedPaths: ["dist/**", 7],
      maxCommitFiles: -3,
      maxFileSizeMb: NaN,
      adviseBehindUpstream: "yes",
    }),
    {},
  );
});
