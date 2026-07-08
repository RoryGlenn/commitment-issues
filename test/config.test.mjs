// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  KNOWN_PRECOMMIT_CONFIG_KEYS,
  loadPrecommitConfig,
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

test("loadPrecommitConfig reads precommitChecks from package.json", (t) => {
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

test("loadPrecommitConfig tolerates malformed option values inside an object", (t) => {
  const config = {
    requireTests: "yes",
    runStagedTests: "true",
    blockPushOnTestFailure: "false",
    advisePushTests: "true",
    testExempt: ["src/legacy/**", 123, null],
    testCommand: ["node", "--test", 42],
    timeoutMs: -1,
    unknownFutureOption: { nested: true },
  };

  withTempPackage(t, { precommitChecks: config });

  assert.deepEqual(loadPrecommitConfig(), config);
});
