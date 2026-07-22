#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import path from "node:path";
import process from "node:process";
import {
  buildSemanticGraph,
  formatSemanticQuery,
  querySemanticGraph,
  readRepositorySourceState,
  semanticGraphCacheStatus,
  semanticGraphMetrics,
  validateSemanticGraph,
  writeSemanticGraphCache,
} from "./lib/semantic-graph.mjs";

function usage() {
  return `Semantic project graph

Usage:
  node tools/semantic-graph.mjs build [--json]
  node tools/semantic-graph.mjs check [--json]
  node tools/semantic-graph.mjs tree --focus <node> [--depth <n>] [--json]
  node tools/semantic-graph.mjs impact <node> [--depth <n>] [--json]

Commands:
  build   Generate and cache the current deterministic graph.
  check   Validate graph accuracy, determinism, and any existing cache.
  tree    Render a focused semantic tree from the current repository.
  impact  Show evidence-backed relationships around one graph node.

The tool is repository-only. It does not run from normal Git hooks or ship in
the npm package.`;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return args[index + 1];
}

function depthOption(args) {
  const raw = optionValue(args, "--depth");
  if (raw === null) return 2;
  const depth = Number(raw);
  if (!Number.isInteger(depth) || depth < 0 || depth > 8) {
    throw new Error("--depth must be an integer from 0 through 8.");
  }
  return depth;
}

function positionalArgs(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--focus" || arg === "--depth") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    values.push(arg);
  }
  return values;
}

function requireOnlyJsonOption(args) {
  const extra = args.filter((arg) => arg !== "--json");
  if (extra.length > 0) {
    throw new Error(`Unknown option or argument: ${extra[0]}`);
  }
}

function errorDiagnostics(diagnostics) {
  return diagnostics.filter((entry) => entry.severity === "error");
}

function warningDiagnostics(diagnostics) {
  return diagnostics.filter((entry) => entry.severity !== "error");
}

function formatDiagnostic(entry) {
  const location = entry.path
    ? ` (${entry.path}${entry.line ? `:${entry.line}` : ""})`
    : "";
  return `${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}${location}`;
}

function requireValidGraph(graph) {
  const diagnostics = validateSemanticGraph(graph);
  const errors = errorDiagnostics(diagnostics);
  if (errors.length > 0) {
    throw new Error(
      `semantic graph validation failed:\n${errors.map(formatDiagnostic).join("\n")}`,
    );
  }
  return diagnostics;
}

function buildCurrentGraph(root) {
  const sourceState = readRepositorySourceState(root);
  return buildSemanticGraph(root, { sourceState });
}

function outputJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function buildCommand(root, json) {
  const started = process.hrtime.bigint();
  const graph = buildCurrentGraph(root);
  const diagnostics = requireValidGraph(graph);
  const cachePath = writeSemanticGraphCache(root, graph);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const result = {
    cachePath,
    source: graph.source,
    metrics: {
      ...semanticGraphMetrics(graph),
      elapsedMs: Number(elapsedMs.toFixed(3)),
      peakRssBytes: process.memoryUsage.rss(),
      warnings: warningDiagnostics(diagnostics).length,
    },
    ...(json ? { graph } : {}),
  };
  if (json) {
    outputJson(result);
    return;
  }
  console.log(`Semantic graph cached at ${cachePath}`);
  console.log(
    `${result.metrics.nodes} nodes, ${result.metrics.edges} edges, ${result.metrics.bytes} bytes, ${result.metrics.warnings} warnings.`,
  );
  console.log(
    `Generated in ${result.metrics.elapsedMs.toFixed(3)} ms; process RSS ${result.metrics.peakRssBytes} bytes.`,
  );
}

function checkCommand(root, json) {
  const first = buildCurrentGraph(root);
  const second = buildCurrentGraph(root);
  const diagnostics = validateSemanticGraph(first);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    diagnostics.push({
      code: "graph.nondeterministic",
      message: "Two graph builds from the same repository state differed.",
      severity: "error",
    });
  }
  const cache = semanticGraphCacheStatus(root, first);
  if (cache.status === "stale" || cache.status === "invalid") {
    diagnostics.push({
      code: `cache.${cache.status}`,
      message:
        cache.status === "stale"
          ? `Cached graph does not match current source identity: ${cache.path}`
          : `Cached graph is invalid: ${cache.path}`,
      severity: "error",
    });
  }
  const errors = errorDiagnostics(diagnostics);
  const result = {
    status: errors.length === 0 ? "passed" : "failed",
    cache: { status: cache.status, path: cache.path },
    source: first.source,
    metrics: semanticGraphMetrics(first),
    diagnostics,
  };
  if (json) outputJson(result);
  else {
    for (const entry of diagnostics) console.log(formatDiagnostic(entry));
    console.log(
      errors.length === 0
        ? `Semantic graph check passed (${result.metrics.nodes} nodes, ${result.metrics.edges} edges; cache ${cache.status}).`
        : `Semantic graph check failed with ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
    );
  }
  if (errors.length > 0) process.exitCode = 1;
}

function queryCommand(root, command, args, json) {
  const graph = buildCurrentGraph(root);
  requireValidGraph(graph);
  const positionals = positionalArgs(args);
  if (command === "tree" && positionals.length > 0) {
    throw new Error(`Unknown tree argument: ${positionals[0]}`);
  }
  if (command === "impact" && args.includes("--focus")) {
    throw new Error("impact accepts its node as a positional argument.");
  }
  if (command === "impact" && positionals.length > 1) {
    throw new Error(`Unknown impact argument: ${positionals[1]}`);
  }
  const query =
    command === "tree" ? optionValue(args, "--focus") : positionals[0];
  if (!query) {
    throw new Error(
      command === "tree"
        ? "tree requires --focus <node>."
        : "impact requires a node.",
    );
  }
  const result = querySemanticGraph(graph, query, { depth: depthOption(args) });
  if (json) outputJson(result);
  else console.log(formatSemanticQuery(result, command));
}

function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  const root = path.resolve(process.cwd());
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "build") {
    requireOnlyJsonOption(args);
    buildCommand(root, json);
  } else if (command === "check") {
    requireOnlyJsonOption(args);
    checkCommand(root, json);
  } else if (command === "tree" || command === "impact") {
    queryCommand(root, command, args, json);
  } else {
    throw new Error(
      `Unknown semantic graph command '${command}'.\n\n${usage()}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`Semantic graph: ${error.message}`);
  process.exitCode = 1;
}
