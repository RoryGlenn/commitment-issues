#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  codeFilePattern,
  collectTestsForFiles,
  formatFilePattern,
} from "../scripts/lib/files.mjs";
import {
  batchProcessArguments,
  estimatedProcessArgumentUnits,
  processArgumentBudget,
  withoutGitLocalEnvironment,
} from "../scripts/lib/process.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  run,
  setPrecommitConfig,
  writeFile,
} from "../test/helpers/temp-repo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const WINDOWS_CREATE_PROCESS_BUDGET = 30_000;
export const WINDOWS_CMD_BUDGET = 7_500;

export const PERFORMANCE_TIERS = Object.freeze({
  smoke: Object.freeze({
    pairs: 4,
    pathPadding: 12,
    discoveryIterations: 1,
    selectionOnly: false,
    budgets: Object.freeze({
      discoveryMs: 250,
      precommitMs: 15_000,
      prepushMs: 15_000,
      peakRssMiB: 512,
      fixtureMiB: 32,
    }),
  }),
  large: Object.freeze({
    pairs: 250,
    pathPadding: 64,
    discoveryIterations: 3,
    selectionOnly: false,
    budgets: Object.freeze({
      discoveryMs: 1_000,
      precommitMs: 60_000,
      prepushMs: 60_000,
      peakRssMiB: 1_024,
      fixtureMiB: 128,
    }),
  }),
  "argv-pressure": Object.freeze({
    pairs: 1_000,
    pathPadding: 96,
    discoveryIterations: 3,
    selectionOnly: true,
    budgets: Object.freeze({
      discoveryMs: 5_000,
      precommitMs: null,
      prepushMs: null,
      peakRssMiB: null,
      fixtureMiB: 512,
    }),
  }),
});

function usage() {
  return `Usage: node tools/benchmark-hook-performance.mjs [options]

Options:
  --tier <smoke|large|argv-pressure>  Fixture tier (default: large)
  --json                              Print one JSON report
  --output <path>                     Also write the JSON report to a file
  --enforce-budgets                   Fail when measured host budgets regress
  --keep                              Keep the temporary fixture for inspection
  --list-tiers                        Print tier definitions and exit
  --help                              Show this help
`;
}

export function parseOptions(args) {
  const options = {
    tier: "large",
    json: false,
    output: null,
    enforceBudgets: false,
    keep: false,
    listTiers: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--json") {
      options.json = true;
    } else if (option === "--enforce-budgets") {
      options.enforceBudgets = true;
    } else if (option === "--keep") {
      options.keep = true;
    } else if (option === "--list-tiers") {
      options.listTiers = true;
    } else if (option === "--help" || option === "-h") {
      options.help = true;
    } else if (option === "--tier") {
      options.tier = args[++index];
      if (!options.tier) throw new Error("--tier requires a value");
    } else if (option.startsWith("--tier=")) {
      options.tier = option.slice("--tier=".length);
    } else if (option === "--output") {
      options.output = args[++index];
      if (!options.output) throw new Error("--output requires a path");
    } else if (option.startsWith("--output=")) {
      options.output = option.slice("--output=".length);
      if (!options.output) throw new Error("--output requires a path");
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  if (!Object.hasOwn(PERFORMANCE_TIERS, options.tier)) {
    throw new Error(`Unknown performance tier: ${options.tier}`);
  }
  return options;
}

export function hookRunsAreClean(...runs) {
  return runs.filter(Boolean).every((run) => run.status === "clean");
}

function reportFailure(message, report) {
  const error = new Error(message);
  error.report = report;
  return error;
}

export function enforceBenchmarkReport(report, enforceBudgets) {
  if (!report.conclusions.hookRunsPass) {
    throw reportFailure(
      "One or more hook runs returned a non-clean status",
      report,
    );
  }
  if (report.conclusions.windowsBatchesWithinBudget === false) {
    throw reportFailure(
      "One or more runtime argument batches exceed the Windows budget",
      report,
    );
  }
  if (enforceBudgets && !report.conclusions.hostBudgetsPass) {
    throw reportFailure("One or more measured host budgets regressed", report);
  }
}

function hostilePath(index, padding) {
  const id = String(index).padStart(4, "0");
  const longSegment = `long-${"x".repeat(padding)}`;
  const base = `feature-${id}-雪`;
  const directory = path.posix.join(
    "packages",
    "performance path café $cash & tea",
    longSegment,
    "src",
  );
  return {
    source: path.posix.join(directory, `${base}.mjs`),
    test: path.posix.join(directory, `${base}.test.mjs`),
  };
}

function createFiles(repoDir, tier) {
  const sources = [];
  const tests = [];
  for (let index = 0; index < tier.pairs; index += 1) {
    const files = hostilePath(index, tier.pathPadding);
    const exportName = `value${String(index).padStart(4, "0")}`;
    writeFile(
      path.join(repoDir, files.source),
      `export const ${exportName} = ${index};\n`,
    );
    writeFile(
      path.join(repoDir, files.test),
      [
        'import test from "node:test";',
        'import assert from "node:assert/strict";',
        `import { ${exportName} } from "./${path.posix.basename(files.source)}";`,
        "",
        `test("${exportName}", () => assert.equal(${exportName}, ${index}));`,
        "",
      ].join("\n"),
    );
    sources.push(files.source);
    tests.push(files.test);
  }
  return { sources, tests };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function measureDiscovery(repoDir, files, iterations) {
  const previous = process.cwd();
  const samples = [];
  let selected = [];
  try {
    process.chdir(repoDir);
    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      selected = collectTestsForFiles(files);
      samples.push(performance.now() - startedAt);
    }
  } finally {
    process.chdir(previous);
  }
  return {
    selected,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    medianMs: Number(median(samples).toFixed(3)),
  };
}

// Conservative UTF-16 estimate for Windows command-line quoting. Doubling each
// argument allows for quotes, backslash escaping, and cross-spawn's additional
// metacharacter escaping without pretending this is an exact cmd.exe parser.
export function estimatedWindowsCommandUnits(command, args) {
  return estimatedProcessArgumentUnits(command, args, "win32");
}

export function itemsWithinWindowsBudget(command, fixedArgs, items, budget) {
  let units = estimatedWindowsCommandUnits(command, fixedArgs);
  const commandUnits = estimatedWindowsCommandUnits(command, []);
  let count = 0;
  for (const item of items) {
    units += estimatedWindowsCommandUnits(command, [item]) - commandUnits;
    if (units > budget) break;
    count += 1;
  }
  return count;
}

function argumentBoundary(
  name,
  command,
  fixedArgs,
  items,
  {
    legacyFixedArgs = fixedArgs,
    legacyItems = items,
    transport = "bounded batches",
  } = {},
) {
  const units = estimatedWindowsCommandUnits(command, [
    ...legacyFixedArgs,
    ...legacyItems,
  ]);
  const runtimeBudget = processArgumentBudget("win32");
  const runtimeBatches =
    items.length > 0
      ? batchProcessArguments(command, fixedArgs, items, {
          platform: "win32",
          budget: runtimeBudget,
        })
      : [
          {
            args: fixedArgs,
            items: [],
            estimatedUnits: estimatedWindowsCommandUnits(command, fixedArgs),
          },
        ];
  const maxRuntimeBatchUnits = Math.max(
    ...runtimeBatches.map((batch) => batch.estimatedUnits),
  );
  return {
    name,
    itemCount: legacyItems.length,
    estimatedWindowsUnits: units,
    createProcessBudget: WINDOWS_CREATE_PROCESS_BUDGET,
    withinCreateProcessBudget: units <= WINDOWS_CREATE_PROCESS_BUDGET,
    itemsWithinCreateProcessBudget: itemsWithinWindowsBudget(
      command,
      legacyFixedArgs,
      legacyItems,
      WINDOWS_CREATE_PROCESS_BUDGET,
    ),
    cmdBudget: WINDOWS_CMD_BUDGET,
    withinCmdBudget: units <= WINDOWS_CMD_BUDGET,
    itemsWithinCmdBudget: itemsWithinWindowsBudget(
      command,
      legacyFixedArgs,
      legacyItems,
      WINDOWS_CMD_BUDGET,
    ),
    batchingRequiredForFullTier: units > WINDOWS_CREATE_PROCESS_BUDGET,
    transport,
    runtimeBudget,
    runtimeBatchCount: runtimeBatches.length,
    maxRuntimeBatchUnits,
    runtimeBatchesWithinBudget: maxRuntimeBatchUnits <= runtimeBudget,
  };
}

function argumentReport(stagedFiles, selectedTests) {
  const codeFiles = stagedFiles.filter((file) => codeFilePattern.test(file));
  const formatFiles = stagedFiles.filter((file) =>
    formatFilePattern.test(file),
  );
  const eslintBin = path.join(
    root,
    "node_modules",
    "eslint",
    "bin",
    "eslint.js",
  );
  const prettierBin = path.join(
    root,
    "node_modules",
    "prettier",
    "bin",
    "prettier.cjs",
  );
  return [
    argumentBoundary(
      "git ls-files --stage",
      "git.exe",
      ["-c", "core.quotePath=false", "ls-files", "--stage", "-z"],
      [],
      {
        legacyFixedArgs: [
          "-c",
          "core.quotePath=false",
          "ls-files",
          "--stage",
          "-z",
          "--",
        ],
        legacyItems: stagedFiles,
        transport: "whole-index NUL output with exact staged-path filtering",
      },
    ),
    argumentBoundary(
      "ESLint",
      process.execPath,
      [
        eslintBin,
        "--cache",
        "--cache-strategy",
        "content",
        "--format",
        "json",
        "--",
      ],
      codeFiles,
    ),
    argumentBoundary(
      "Prettier",
      process.execPath,
      [
        prettierBin,
        "--cache",
        "--cache-location",
        ".prettiercache",
        "--cache-strategy",
        "content",
        "--list-different",
        "--ignore-unknown",
        "--",
      ],
      formatFiles,
    ),
    argumentBoundary(
      "configured Node tests",
      process.execPath,
      ["--test", "--"],
      selectedTests,
    ),
  ];
}

function samplePosixTreeRss(rootPid) {
  if (process.platform === "win32") return null;
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,rss="], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const processes = result.stdout
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u).map(Number))
    .filter(
      ([pid, parent, rss]) =>
        Number.isInteger(pid) &&
        Number.isInteger(parent) &&
        Number.isFinite(rss),
    );
  const children = new Map();
  const rssByPid = new Map();
  for (const [pid, parent, rss] of processes) {
    rssByPid.set(pid, rss);
    const list = children.get(parent) || [];
    list.push(pid);
    children.set(parent, list);
  }
  const queue = [rootPid];
  const seen = new Set();
  let totalKiB = 0;
  while (queue.length > 0) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    totalKiB += rssByPid.get(pid) || 0;
    queue.push(...(children.get(pid) || []));
  }
  return totalKiB;
}

async function runMeasured(command, args, { cwd, input = "" }) {
  const env = withoutGitLocalEnvironment(process.env);
  delete env.COMMITMENT_ISSUES;
  delete env.HUSKY;
  delete env.NODE_TEST_CONTEXT;
  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let peakRssKiB = samplePosixTreeRss(child.pid);
  const timer = setInterval(() => {
    const sample = samplePosixTreeRss(child.pid);
    if (sample !== null) peakRssKiB = Math.max(peakRssKiB || 0, sample);
  }, 50);
  timer.unref?.();
  child.stdin.end(input);

  const result = await new Promise((resolve) => {
    child.on("error", (error) =>
      resolve({ status: null, signal: null, error }),
    );
    child.on("close", (status, signal) =>
      resolve({ status, signal, error: null }),
    );
  });
  clearInterval(timer);
  const finalSample = samplePosixTreeRss(child.pid);
  if (finalSample !== null) {
    peakRssKiB = Math.max(peakRssKiB || 0, finalSample);
  }
  return {
    ...result,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    peakRssMiB:
      peakRssKiB === null ? null : Number((peakRssKiB / 1024).toFixed(3)),
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function directoryBytes(directory) {
  let total = 0;
  const visit = (entryPath) => {
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(entryPath)) {
        visit(path.join(entryPath, entry));
      }
      return;
    }
    total += stat.size;
  };
  visit(directory);
  return total;
}

function metric(value, budget, lowerIsBetter = true) {
  return {
    value,
    budget,
    withinBudget:
      value === null || budget === null
        ? null
        : lowerIsBetter
          ? value <= budget
          : value >= budget,
  };
}

function pathStatistics(paths) {
  const units = paths.map((file) => file.length);
  const bytes = paths.map((file) => Buffer.byteLength(file));
  return {
    count: paths.length,
    minUtf16Units: Math.min(...units),
    maxUtf16Units: Math.max(...units),
    meanUtf16Units: Number(
      (units.reduce((sum, value) => sum + value, 0) / units.length).toFixed(3),
    ),
    maxUtf8Bytes: Math.max(...bytes),
    containsSpaces: paths.some((file) => file.includes(" ")),
    containsNonAscii: paths.some((file) => /[^\x00-\x7f]/u.test(file)),
    containsShellMetacharacters: paths.some((file) => /[$&]/u.test(file)),
  };
}

function machineInfo() {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    git: git.status === 0 ? git.stdout.trim() : null,
    cpuModel: os.cpus()[0]?.model || null,
    logicalCpuCount: os.cpus().length,
    totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
  };
}

function parseHookJson(result, label) {
  assert.equal(
    result.error,
    null,
    `${label} failed to launch: ${result.error?.message || "unknown error"}`,
  );
  assert.equal(
    result.status,
    0,
    `${label} exited ${result.status}:\n${result.stdout}\n${result.stderr}`,
  );
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`${label} did not emit JSON: ${error.message}`);
  }
}

function hookBatchCounts(payload) {
  return Object.fromEntries(
    (payload.checks || [])
      .filter((check) => Number.isInteger(check.details?.batchCount))
      .map((check) => [
        check.id,
        {
          completed: check.details.batchCount,
          planned: check.details.plannedBatchCount,
          summary: check.details.summary ?? null,
        },
      ]),
  );
}

export async function runBenchmark(options) {
  const tier = PERFORMANCE_TIERS[options.tier];
  const repoDir = createTempRepo();
  const keepFixture = options.keep;
  try {
    setPrecommitConfig(repoDir, {
      showWelcomeOnFirstCommit: false,
      tone: "standard",
      requireTests: true,
      runStagedTests: true,
      blockPushOnTestFailure: true,
      advisePushTests: false,
      protectedBranches: [],
      scanSecrets: false,
      maxCommitFiles: 0,
      maxCommitLines: 0,
      maxFileSizeMb: 0,
      adviseBehindUpstream: false,
      timeoutMs: 120_000,
      testCommand: [process.execPath, "--test"],
    });
    const fixtureFiles = createFiles(repoDir, tier);
    const add = run("git", ["add", "--all"], repoDir);
    assert.equal(add.status, 0, add.stderr);
    const stagedResult = run(
      "git",
      ["-c", "core.quotePath=false", "diff", "--cached", "--name-only", "-z"],
      repoDir,
    );
    assert.equal(stagedResult.status, 0, stagedResult.stderr);
    const stagedFiles = stagedResult.stdout.split("\0").filter(Boolean);
    const discovery = measureDiscovery(
      repoDir,
      stagedFiles,
      tier.discoveryIterations,
    );
    assert.equal(discovery.selected.length, tier.pairs);

    const argumentPressure = argumentReport(stagedFiles, discovery.selected);
    let precommit = null;
    let prepush = null;

    if (!tier.selectionOnly) {
      const precommitResult = await runMeasured(
        process.execPath,
        [path.join(repoDir, "scripts", "precommit.mjs"), "--json"],
        { cwd: repoDir },
      );
      const precommitPayload = parseHookJson(precommitResult, "precommit");
      precommit = {
        elapsedMs: precommitResult.elapsedMs,
        peakRssMiB: precommitResult.peakRssMiB,
        stdoutBytes: Buffer.byteLength(precommitResult.stdout),
        stderrBytes: Buffer.byteLength(precommitResult.stderr),
        status: precommitPayload.status,
        batches: hookBatchCounts(precommitPayload),
      };

      const base = run("git", ["rev-parse", "HEAD"], repoDir).stdout.trim();
      const commit = run(
        "git",
        ["commit", "--no-verify", "-m", `performance fixture ${options.tier}`],
        repoDir,
      );
      assert.equal(commit.status, 0, commit.stderr);
      const head = run("git", ["rev-parse", "HEAD"], repoDir).stdout.trim();
      const input = `refs/heads/main ${head} refs/heads/main ${base}\n`;
      const prepushResult = await runMeasured(
        process.execPath,
        [path.join(repoDir, "scripts", "prepush.mjs"), "--json"],
        { cwd: repoDir, input },
      );
      const prepushPayload = parseHookJson(prepushResult, "prepush");
      prepush = {
        elapsedMs: prepushResult.elapsedMs,
        peakRssMiB: prepushResult.peakRssMiB,
        stdoutBytes: Buffer.byteLength(prepushResult.stdout),
        stderrBytes: Buffer.byteLength(prepushResult.stderr),
        status: prepushPayload.status,
        batches: hookBatchCounts(prepushPayload),
      };
    }

    const fixtureMiB = Number(
      (directoryBytes(repoDir) / 1024 / 1024).toFixed(3),
    );
    const report = {
      schemaVersion: 1,
      tier: options.tier,
      selectionOnly: tier.selectionOnly,
      machine: machineInfo(),
      fixture: {
        sourceFiles: fixtureFiles.sources.length,
        testFiles: fixtureFiles.tests.length,
        stagedFiles: stagedFiles.length,
        pathStats: pathStatistics([
          ...fixtureFiles.sources,
          ...fixtureFiles.tests,
        ]),
        diskMiB: fixtureMiB,
        kept: options.keep,
        path: options.keep ? repoDir : null,
      },
      metrics: {
        discovery: {
          selectedTests: discovery.selected.length,
          samplesMs: discovery.samplesMs,
          medianMs: discovery.medianMs,
        },
        precommit,
        prepush,
      },
      budgets: {
        discovery: metric(discovery.medianMs, tier.budgets.discoveryMs),
        precommit: metric(
          precommit?.elapsedMs ?? null,
          tier.budgets.precommitMs,
        ),
        prepush: metric(prepush?.elapsedMs ?? null, tier.budgets.prepushMs),
        peakRss: metric(
          Math.max(
            ...[precommit?.peakRssMiB, prepush?.peakRssMiB].filter(
              (value) => value !== null && value !== undefined,
            ),
            0,
          ) || null,
          tier.budgets.peakRssMiB,
        ),
        fixture: metric(fixtureMiB, tier.budgets.fixtureMiB),
      },
      argumentPressure,
      conclusions: {
        hookRunsPass: hookRunsAreClean(precommit, prepush),
        hostBudgetsPass: true,
        windowsBatchingRequired: argumentPressure
          .filter((boundary) => boundary.name !== "git ls-files --stage")
          .some((boundary) => boundary.batchingRequiredForFullTier),
        gitPathspecTransportRequired: argumentPressure
          .filter((boundary) => boundary.name === "git ls-files --stage")
          .some((boundary) => boundary.batchingRequiredForFullTier),
        windowsBatchesWithinBudget: argumentPressure.every(
          (boundary) => boundary.runtimeBatchesWithinBudget,
        ),
      },
    };
    report.conclusions.hostBudgetsPass = Object.values(report.budgets).every(
      (entry) => entry.withinBudget !== false,
    );
    enforceBenchmarkReport(report, options.enforceBudgets);
    return report;
  } finally {
    if (!keepFixture) cleanupTempRepo(repoDir);
  }
}

function printHuman(report) {
  console.log(`Hook performance benchmark (${report.tier})`);
  console.log(
    `${report.fixture.sourceFiles} sources, ${report.fixture.testFiles} tests, ${report.fixture.stagedFiles} staged files`,
  );
  console.log(
    `discovery: ${report.metrics.discovery.medianMs} ms (${report.metrics.discovery.selectedTests} tests)`,
  );
  if (report.metrics.precommit) {
    console.log(
      `precommit: ${report.metrics.precommit.elapsedMs} ms, peak tree RSS ${report.metrics.precommit.peakRssMiB ?? "unavailable"} MiB`,
    );
    console.log(
      `prepush: ${report.metrics.prepush.elapsedMs} ms, peak tree RSS ${report.metrics.prepush.peakRssMiB ?? "unavailable"} MiB`,
    );
  }
  console.log(`fixture disk: ${report.fixture.diskMiB} MiB`);
  console.log("Windows argument transport:");
  for (const boundary of report.argumentPressure) {
    console.log(
      `- ${boundary.name}: legacy ${boundary.estimatedWindowsUnits} units; ${boundary.runtimeBatchCount} ${boundary.transport === "bounded batches" ? "batch(es)" : "probe"}, max ${boundary.maxRuntimeBatchUnits}/${boundary.runtimeBudget}`,
    );
  }
  console.log(
    `host budgets: ${report.conclusions.hostBudgetsPass ? "pass" : "FAIL"}`,
  );
}

async function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.listTiers) {
    console.log(JSON.stringify(PERFORMANCE_TIERS, null, 2));
    return;
  }

  try {
    const report = await runBenchmark(options);
    if (options.output) {
      const output = path.resolve(options.output);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
  } catch (error) {
    if (error.report && options?.json) {
      console.log(JSON.stringify(error.report, null, 2));
    }
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
