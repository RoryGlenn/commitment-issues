// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_HOOK_OUTPUT,
  invalidPrecommitConfigMessages,
  KNOWN_COMMIT_MESSAGE_CONFIG_KEYS,
  KNOWN_PRECOMMIT_CONFIG_KEYS,
  MAX_TIMEOUT_MS,
  loadPrecommitConfig,
  loadPrecommitConfigState,
  precommitConfigSourceLabel,
  precommitConfigWarningMessages,
  readStandalonePrecommitConfig,
  resolveCommitMessageConfig,
  resolveHookOutput,
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
      hookOutput: "normal",
      requireTests: true,
      testExempt: ["package/**"],
      timeoutMs: 1000,
    },
  });
  writeStandaloneConfig({
    hookOutput: "problems-only",
    requireTests: false,
    testExempt: ["standalone/**"],
  });

  const config = loadPrecommitConfig();
  assert.deepEqual(config, {
    hookOutput: "problems-only",
    requireTests: false,
    testExempt: ["standalone/**"],
    timeoutMs: 1000,
  });
  assert.equal(
    precommitConfigSourceLabel(config),
    ".commitmentrc.json and package.json",
  );
  assert.equal(
    precommitConfigSourceLabel(config, ["requireTests", "timeoutMs"]),
    ".commitmentrc.json and package.json",
  );
});

test("hookOutput accepts only the documented values and defaults quiet", () => {
  assert.equal(DEFAULT_HOOK_OUTPUT, "problems-only");
  assert.equal(resolveHookOutput({}), "problems-only");
  assert.equal(
    resolveHookOutput(sanitizePrecommitConfig({ hookOutput: "problems-only" })),
    "problems-only",
  );
  assert.equal(
    resolveHookOutput(sanitizePrecommitConfig({ hookOutput: "normal" })),
    "normal",
  );
  assert.deepEqual(sanitizePrecommitConfig({ hookOutput: "quiet" }), {});
  assert.deepEqual(invalidPrecommitConfigMessages({ hookOutput: "quiet" }), [
    'hookOutput must be "problems-only" or "normal"',
  ]);
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
  assert.equal(precommitConfigSourceLabel(state.config), "package.json");
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

test("standalone reader reports an existing path that cannot be read", (t) => {
  withTempPackage(t, { name: "x" });
  fs.mkdirSync(path.join(process.cwd(), STANDALONE_CONFIG_FILE));

  assert.deepEqual(readStandalonePrecommitConfig(), {
    exists: true,
    config: {},
    error: "could not be read",
  });
});

test("config source labels distinguish standalone-only and package-only state", (t) => {
  withTempPackage(t, { precommitChecks: {} });
  writeStandaloneConfig({ requireTests: false });
  const standalone = loadPrecommitConfig();
  assert.equal(precommitConfigSourceLabel(standalone), STANDALONE_CONFIG_FILE);
  assert.equal(
    precommitConfigSourceLabel(standalone, ["requireTests"]),
    STANDALONE_CONFIG_FILE,
  );

  fs.rmSync(path.join(process.cwd(), STANDALONE_CONFIG_FILE));
  fs.writeFileSync(
    path.join(process.cwd(), "package.json"),
    JSON.stringify({ precommitChecks: { requireTests: false } }),
  );
  const fromPackage = loadPrecommitConfig();
  assert.equal(precommitConfigSourceLabel(fromPackage), "package.json");
  assert.equal(
    precommitConfigSourceLabel(fromPackage, ["requireTests"]),
    "package.json",
  );
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

test("sanitizePrecommitConfig rejects malformed config containers", () => {
  for (const value of [undefined, null, false, true, "enabled", 42, []]) {
    assert.deepEqual(sanitizePrecommitConfig(value), {});
  }
});

test("commitMessage config is nested, sanitized, and disabled by default", (t) => {
  withTempPackage(t, {
    precommitChecks: {
      commitMessage: { enabled: true, blockOnFailure: false },
    },
  });

  const config = loadPrecommitConfig();
  assert.deepEqual(config, {
    commitMessage: { enabled: true, blockOnFailure: false },
  });
  assert.deepEqual(resolveCommitMessageConfig(config), {
    enabled: true,
    blockOnFailure: false,
  });
  assert.deepEqual(resolveCommitMessageConfig({}), {
    enabled: false,
    blockOnFailure: false,
  });
});

test("commitMessage diagnostics name nested typos and invalid values", () => {
  const sanitized = sanitizePrecommitConfig({
    commitMessage: {
      enable: true,
      enabled: "yes",
      blockOnFailure: 1,
    },
  });

  assert.deepEqual(KNOWN_COMMIT_MESSAGE_CONFIG_KEYS, [
    "blockOnFailure",
    "enabled",
  ]);
  assert.deepEqual(unknownPrecommitConfigKeys(sanitized), [
    "commitMessage.enable",
  ]);
  assert.deepEqual(invalidPrecommitConfigMessages(sanitized), [
    "commitMessage.blockOnFailure must be a boolean",
    "commitMessage.enabled must be a boolean",
  ]);
  assert.deepEqual(precommitConfigWarningMessages(sanitized), [
    "Ignoring unknown precommitChecks key(s) in package.json: commitMessage.enable. Check for typos.",
    "Ignoring invalid precommitChecks value(s) in package.json: commitMessage.blockOnFailure must be a boolean; commitMessage.enabled must be a boolean.",
  ]);
  assert.deepEqual(sanitized, { commitMessage: {} });
});

test("commitMessage rejects malformed blocks without enabling the hook", () => {
  for (const value of [null, false, true, "yes", [], 42]) {
    const sanitized = sanitizePrecommitConfig({ commitMessage: value });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(resolveCommitMessageConfig(sanitized), {
      enabled: false,
      blockOnFailure: false,
    });
    assert.deepEqual(invalidPrecommitConfigMessages({ commitMessage: value }), [
      "commitMessage must be an object",
    ]);
  }
});

test("blocking commit-message config cannot silently imply enablement", () => {
  const config = sanitizePrecommitConfig({
    commitMessage: { blockOnFailure: true },
  });
  assert.deepEqual(resolveCommitMessageConfig(config), {
    enabled: false,
    blockOnFailure: true,
  });
  assert.deepEqual(precommitConfigWarningMessages(config), [
    "commitMessage.blockOnFailure has no effect unless commitMessage.enabled is true.",
  ]);
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
    hookOutput: "loud",
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
      hookOutput: "normal",
      tone: "fun",
      testExempt: ["src/legacy/**"],
      testCommand: ["node", "--test"],
      timeoutMs: 30000,
    },
  });

  assert.deepEqual(loadPrecommitConfig(), {
    requireTests: false,
    runStagedTests: true,
    hookOutput: "normal",
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
      hookOutput: "loud",
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
      'hookOutput must be "problems-only" or "normal"',
      "testExempt must be an array of strings",
      "testCommand must be a non-empty array of non-empty strings",
      `timeoutMs must be a positive finite number no greater than ${MAX_TIMEOUT_MS}`,
    ],
  );
});

test("invalidPrecommitConfigMessages ignores malformed config containers", () => {
  for (const value of [undefined, null, false, "config", []]) {
    assert.deepEqual(invalidPrecommitConfigMessages(value), []);
  }
});

test("timeoutMs accepts Node's timer ceiling and rejects larger values", () => {
  assert.deepEqual(sanitizePrecommitConfig({ timeoutMs: MAX_TIMEOUT_MS }), {
    timeoutMs: MAX_TIMEOUT_MS,
  });
  assert.deepEqual(
    sanitizePrecommitConfig({ timeoutMs: MAX_TIMEOUT_MS + 1 }),
    {},
  );
  assert.deepEqual(
    invalidPrecommitConfigMessages({ timeoutMs: MAX_TIMEOUT_MS + 1 }),
    [
      `timeoutMs must be a positive finite number no greater than ${MAX_TIMEOUT_MS}`,
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
