// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enforceBenchmarkReport,
  estimatedWindowsCommandUnits,
  hookRunsAreClean,
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

test("full-hook benchmarks reject advisory results with their report", () => {
  assert.equal(hookRunsAreClean(null, null), true);
  assert.equal(
    hookRunsAreClean({ status: "clean" }, { status: "clean" }),
    true,
  );
  assert.equal(
    hookRunsAreClean({ status: "advisory" }, { status: "clean" }),
    false,
  );

  const advisoryReport = {
    conclusions: { hookRunsPass: false, hostBudgetsPass: true },
  };
  assert.throws(
    () => enforceBenchmarkReport(advisoryReport, false),
    (error) => {
      assert.match(error.message, /non-clean status/u);
      assert.equal(error.report, advisoryReport);
      return true;
    },
  );

  const budgetReport = {
    conclusions: { hookRunsPass: true, hostBudgetsPass: false },
  };
  assert.doesNotThrow(() => enforceBenchmarkReport(budgetReport, false));
  assert.throws(
    () => enforceBenchmarkReport(budgetReport, true),
    (error) => {
      assert.match(error.message, /host budgets regressed/u);
      assert.equal(error.report, budgetReport);
      return true;
    },
  );

  const unsafeArguments = {
    conclusions: {
      hookRunsPass: true,
      hostBudgetsPass: true,
      windowsBatchesWithinBudget: false,
    },
  };
  assert.throws(
    () => enforceBenchmarkReport(unsafeArguments, false),
    /argument batches exceed the Windows budget/u,
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
  assert.equal(report.conclusions.hookRunsPass, true);
  assert.equal(report.fixture.pathStats.containsSpaces, true);
  assert.equal(report.fixture.pathStats.containsNonAscii, true);
  assert.equal(report.fixture.pathStats.containsShellMetacharacters, true);
  assert.equal(report.fixture.kept, false);
  assert.equal(report.fixture.path, null);
  assert.ok(report.argumentPressure.length >= 4);
  assert.equal(report.conclusions.windowsBatchesWithinBudget, true);
  assert.ok(
    report.argumentPressure.every(
      (entry) =>
        entry.runtimeBatchCount >= 1 &&
        entry.maxRuntimeBatchUnits <= entry.runtimeBudget &&
        entry.runtimeBatchesWithinBudget,
    ),
  );
  assert.equal(
    report.argumentPressure.find(
      (entry) => entry.name === "git ls-files --stage",
    ).transport,
    "whole-index NUL output with exact staged-path filtering",
  );
  assert.equal(report.metrics.precommit.batches.eslint.completed, 1);
  assert.equal(report.metrics.prepush.batches["push-tests"].completed, 1);
  assert.deepEqual(report.metrics.prepush.batches["push-tests"].summary, {
    passed: PERFORMANCE_TIERS.smoke.pairs,
    failed: 0,
  });
  assert.equal(fs.existsSync(report.fixture.path || ""), false);
});
