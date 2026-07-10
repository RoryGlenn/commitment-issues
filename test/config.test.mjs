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
  sanitizePrecommitConfig,
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

test("loadPrecommitConfig reads valid precommitChecks from package.json", (t) => {
  withTempPackage(t, { precommitChecks: { runStagedTests: true } });

  assert.deepEqual(loadPrecommitConfig(), { runStagedTests: true });
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
    }),
    [
      "adviseBehindUpstream must be a boolean",
      "blockProtectedBranches must be a boolean",
      "generatedPaths must be an array of strings",
      "protectedBranches must be an array of strings",
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
