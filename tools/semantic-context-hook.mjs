#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import process from "node:process";
import {
  buildSemanticContext,
  createSemanticContextReceipt,
  extractExplicitSemanticFocuses,
  findSemanticRepositoryRoot,
  semanticHookResponse,
  unavailableSemanticContext,
  writeSemanticContextReceipt,
} from "./lib/semantic-context.mjs";
import {
  buildSemanticGraph,
  readRepositorySourceState,
} from "./lib/semantic-graph.mjs";

const CONTEXT_OUTPUT_BYTES = 7_500;
const HOST_OUTPUT_BYTES = 9_000;

function adapterOption(args) {
  if (args.length !== 2 || args[0] !== "--adapter") {
    throw new Error("hook requires --adapter <claude|codex>.");
  }
  if (!new Set(["claude", "codex"]).has(args[1])) {
    throw new Error(`unsupported hook adapter: ${args[1]}`);
  }
  return args[1];
}

function readHookInput() {
  const input = fs.readFileSync(0);
  if (input.length > 1024 * 1024) {
    throw new Error("hook input exceeded 1 MiB.");
  }
  const parsed = JSON.parse(input.toString("utf8"));
  if (
    !parsed ||
    typeof parsed.cwd !== "string" ||
    typeof parsed.hook_event_name !== "string"
  ) {
    throw new Error("hook input is missing cwd or hook_event_name.");
  }
  return parsed;
}

function buildGraph(root) {
  const sourceState = readRepositorySourceState(root);
  return buildSemanticGraph(root, { sourceState });
}

function hookFocuses(graph, hookInput) {
  if (hookInput.hook_event_name === "SessionStart") {
    return graph.nodes
      .filter((node) => node.kind === "capability")
      .map((node) => node.id)
      .sort();
  }
  if (hookInput.hook_event_name === "UserPromptSubmit") {
    return extractExplicitSemanticFocuses(graph, hookInput.prompt);
  }
  return [];
}

function serializeResponse(response) {
  return `${JSON.stringify(response)}\n`;
}

function emitResponse(output) {
  const buffer = Buffer.from(output);
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(
      process.stdout.fd,
      buffer,
      offset,
      buffer.length - offset,
    );
    if (written <= 0) {
      throw new Error("semantic context stdout made no write progress.");
    }
    offset += written;
  }
  return buffer.length;
}

function boundedHookDelivery(graph, focuses, hookEventName) {
  let maxOutputBytes = CONTEXT_OUTPUT_BYTES;
  while (maxOutputBytes >= 2_048) {
    const envelope = buildSemanticContext(graph, focuses, {
      depth: hookEventName === "SessionStart" ? 1 : 2,
      maxFiles: 30,
      maxSelectedBytes: 400_000,
      maxOutputBytes,
    });
    const output = serializeResponse(
      semanticHookResponse(hookEventName, envelope),
    );
    const outputBytes = Buffer.byteLength(output);
    if (outputBytes <= HOST_OUTPUT_BYTES) {
      return { envelope, output, outputBytes };
    }
    maxOutputBytes -= Math.max(256, outputBytes - HOST_OUTPUT_BYTES);
  }

  const envelope = unavailableSemanticContext(
    "The semantic context gateway could not fit a safe host response.",
    { maxOutputBytes: 2_048 },
  );
  const output = serializeResponse(
    semanticHookResponse(hookEventName, envelope),
  );
  return { envelope, output, outputBytes: Buffer.byteLength(output) };
}

function main() {
  const adapter = adapterOption(process.argv.slice(2));
  const hookInput = readHookInput();
  if (
    !new Set(["SessionStart", "UserPromptSubmit"]).has(
      hookInput.hook_event_name,
    )
  ) {
    return;
  }

  let root = null;
  let envelope;
  let output;
  let outputBytes;
  try {
    root = findSemanticRepositoryRoot(hookInput.cwd);
    const graph = buildGraph(root);
    const focuses = hookFocuses(graph, hookInput);
    if (
      hookInput.hook_event_name === "UserPromptSubmit" &&
      focuses.length === 0
    ) {
      return;
    }
    ({ envelope, output, outputBytes } = boundedHookDelivery(
      graph,
      focuses,
      hookInput.hook_event_name,
    ));
  } catch {
    envelope = unavailableSemanticContext(undefined, {
      depth: 1,
      maxFiles: 30,
      maxSelectedBytes: 400_000,
      maxOutputBytes: CONTEXT_OUTPUT_BYTES,
    });
    output = serializeResponse(
      semanticHookResponse(hookInput.hook_event_name, envelope),
    );
    outputBytes = Buffer.byteLength(output);
  }

  outputBytes = emitResponse(output);
  if (!root) return;
  try {
    writeSemanticContextReceipt(
      root,
      createSemanticContextReceipt({
        adapter,
        hookInput,
        envelope,
        outputBytes,
      }),
    );
  } catch (error) {
    console.error(
      `Semantic context receipt was not recorded: ${error.message}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`Semantic context hook: ${error.message}`);
  process.exitCode = 1;
}
