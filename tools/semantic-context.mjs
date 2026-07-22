#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import process from "node:process";
import {
  buildSemanticContext,
  findSemanticRepositoryRoot,
  readSemanticContextReceipt,
  verifySemanticContextDigest,
} from "./lib/semantic-context.mjs";
import {
  buildSemanticGraph,
  readRepositorySourceState,
} from "./lib/semantic-graph.mjs";

function usage() {
  return `Semantic context gateway

Usage:
  node tools/semantic-context.mjs context --focus <node> [--focus <node>] [options]
  node tools/semantic-context.mjs receipt --latest [--json]

Context options:
  --depth <0-8>           Relationship depth (default: 2)
  --max-files <n>         Maximum selected files (default: 40)
  --budget-bytes <n>      Maximum selected source bytes (default: 400000)
  --output-bytes <n>      Maximum serialized envelope bytes (default: 9000)
  --json                  Print the complete machine-readable envelope

The gateway compiles the current repository directly and never trusts a stale
cache. It is repository-only and does not run in Git hooks or ship in npm.`;
}

function repeatedOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    values.push(value);
    index += 1;
  }
  return values;
}

function integerOption(args, name, fallback, { minimum, maximum } = {}) {
  const values = repeatedOption(args, name);
  if (values.length > 1) throw new Error(`${name} may be supplied only once.`);
  if (values.length === 0) return fallback;
  const value = Number(values[0]);
  if (
    !Number.isInteger(value) ||
    (minimum !== undefined && value < minimum) ||
    (maximum !== undefined && value > maximum)
  ) {
    const range =
      maximum === undefined
        ? `at least ${minimum}`
        : `from ${minimum} through ${maximum}`;
    throw new Error(`${name} must be an integer ${range}.`);
  }
  return value;
}

function validateContextArgs(args) {
  const valueOptions = new Set([
    "--focus",
    "--depth",
    "--max-files",
    "--budget-bytes",
    "--output-bytes",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (!valueOptions.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (!args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    index += 1;
  }
}

function buildCurrentGraph(root) {
  const sourceState = readRepositorySourceState(root);
  return buildSemanticGraph(root, { sourceState });
}

function contextCommand(root, args, json) {
  validateContextArgs(args);
  const focuses = repeatedOption(args, "--focus");
  const options = {
    depth: integerOption(args, "--depth", 2, { minimum: 0, maximum: 8 }),
    maxFiles: integerOption(args, "--max-files", 40, { minimum: 1 }),
    maxSelectedBytes: integerOption(args, "--budget-bytes", 400_000, {
      minimum: 1,
    }),
    maxOutputBytes: integerOption(args, "--output-bytes", 9_000, {
      minimum: 2048,
    }),
  };
  const envelope = buildSemanticContext(
    buildCurrentGraph(root),
    focuses,
    options,
  );
  if (!verifySemanticContextDigest(envelope)) {
    throw new Error("generated semantic context failed its integrity check.");
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } else {
    const resolved = envelope.request.resolved
      .map((entry) => entry.id)
      .join(", ");
    console.log(`Semantic context: ${envelope.status}`);
    console.log(`Focus: ${resolved || "unresolved"}`);
    console.log(`Source: ${envelope.source.fingerprint ?? "unavailable"}`);
    console.log(
      `Retrieval: ${envelope.retrieval.selectedFiles} files, ${envelope.retrieval.selectedBytes} of ${envelope.retrieval.totalIndexableBytes} indexable bytes.`,
    );
    console.log(
      `Payload: ${envelope.integrity.payloadBytes} bytes, sha256:${envelope.integrity.payloadDigest}`,
    );
    for (const entry of envelope.diagnostics) {
      console.log(
        `${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}`,
      );
    }
  }
  if (["ambiguous", "unavailable"].includes(envelope.status)) {
    process.exitCode = 1;
  }
}

function receiptCommand(root, args, json) {
  const extras = args.filter((arg) => !["--latest", "--json"].includes(arg));
  if (extras.length > 0) throw new Error(`Unknown option: ${extras[0]}`);
  if (!args.includes("--latest")) {
    throw new Error("receipt requires --latest.");
  }
  const result = readSemanticContextReceipt(root);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (result.status === "present") {
    const receipt = result.receipt;
    console.log(`Semantic context receipt: ${receipt.outcome}`);
    console.log(`Adapter: ${receipt.adapter}`);
    console.log(`Hook: ${receipt.hookEvent}`);
    console.log(`Source: ${receipt.sourceFingerprint ?? "unavailable"}`);
    console.log(`Context: sha256:${receipt.contextDigest}`);
    console.log(`Emitted: ${receipt.emittedAt}`);
  } else {
    console.log(`Semantic context receipt: ${result.status} (${result.path})`);
  }
  if (result.status === "invalid") process.exitCode = 1;
}

function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    console.log(usage());
    return;
  }
  const root = findSemanticRepositoryRoot(process.cwd());
  const json = args.includes("--json");
  if (command === "context") contextCommand(root, args, json);
  else if (command === "receipt") receiptCommand(root, args, json);
  else
    throw new Error(
      `Unknown semantic context command '${command}'.\n\n${usage()}`,
    );
}

try {
  main();
} catch (error) {
  console.error(`Semantic context: ${error.message}`);
  process.exitCode = 1;
}
