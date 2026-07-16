// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCleanHookPayload,
  estimatedWindowsCommandUnits,
  itemsWithinWindowsBudget,
  parseOptions,
  PERFORMANCE_TIERS,
  WINDOWS_CREATE_PROCESS_BUDGET,
} from "../tools/benchmark-hook-performance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("performance tiers keep timing enforcement outside ordinary test assertions", () => {
  assert.deepEqual(Object.keys(PERFORMANCE_TIERS), [
    "smoke",
    "large",
    "argv-pressure",
  ]);
  assert.equal(PERFORMANCE_TIERS.smoke.selectionOnly, false);
  assert.equal(PERFORMANCE_TIERS.large.pairs >= 250, true);
  assert.equal(PERFORMANCE_TIERS["argv-pressure"].pairs >= 1_000, true);
  assert.equal(PERFORMANCE_TIERS["argv-pressure"].selectionOnly, true);
});

test("benchmark options reject unknown tiers before creating a fixture", () => {
  assert.throws(
    () => parseOptions(["--tier", "huge"]),
    /Unknown performance tier: huge/u,
  );
  assert.deepEqual(parseOptions(["--tier=smoke", "--json"]), {
    tier: "smoke",
    json: true,
    output: null,
    enforceBudgets: false,
    keep: false,
    listTiers: false,
    help: false,
  });
});

test("full-hook benchmarks reject advisory results", () => {
  assert.doesNotThrow(() =>
    assertCleanHookPayload({ status: "clean" }, "precommit"),
  );
  assert.throws(
    () => assertCleanHookPayload({ status: "advisory" }, "prepush"),
    /prepush hook must report a clean status; received advisory/u,
  );
});

test("Windows argv accounting is conservative and reports a bounded prefix", () => {
  const short = estimatedWindowsCommandUnits("node.exe", ["--test", "a.js"]);
  const long = estimatedWindowsCommandUnits("node.exe", [
    "--test",
    "雪 and spaces & metacharacters.js".repeat(1_000),
  ]);
  assert.ok(short < long);
  assert.ok(long > WINDOWS_CREATE_PROCESS_BUDGET);
  assert.equal(
    itemsWithinWindowsBudget(
      "node.exe",
      ["--test"],
      ["a".repeat(10_000), "b".repeat(10_000)],
      WINDOWS_CREATE_PROCESS_BUDGET,
    ),
    1,
  );
});

test("smoke benchmark proves hook correctness without asserting wall time", () => {
  const result = spawnSync(
    process.execPath,
    ["tools/benchmark-hook-performance.mjs", "--tier", "smoke", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, COMMITMENT_ISSUES: "0" },
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.tier, "smoke");
  assert.equal(report.fixture.sourceFiles, PERFORMANCE_TIERS.smoke.pairs);
  assert.equal(report.fixture.testFiles, PERFORMANCE_TIERS.smoke.pairs);
  assert.equal(
    report.metrics.discovery.selectedTests,
    PERFORMANCE_TIERS.smoke.pairs,
  );
  assert.equal(report.metrics.precommit.status, "clean");
  assert.equal(report.metrics.prepush.status, "clean");
  assert.equal(report.fixture.pathStats.containsSpaces, true);
  assert.equal(report.fixture.pathStats.containsNonAscii, true);
  assert.equal(report.fixture.pathStats.containsShellMetacharacters, true);
  assert.equal(report.fixture.kept, false);
  assert.equal(report.fixture.path, null);
  assert.ok(report.argumentPressure.length >= 4);
  assert.equal(fs.existsSync(report.fixture.path || ""), false);
});
