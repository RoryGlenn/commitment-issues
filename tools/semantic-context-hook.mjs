#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import process from "node:process";
import {
  buildSemanticContext,
  buildCurrentSemanticGraph,
  createSemanticContextReceipt,
  extractExplicitSemanticFocuses,
  findSemanticRepositoryRoot,
  semanticHookResponse,
  unavailableSemanticContext,
  writeSemanticContextReceipt,
} from "./lib/semantic-context.mjs";

const CONTEXT_OUTPUT_BYTES = 2_300;
const MODEL_CONTEXT_BYTES = 2_400;
const HOST_OUTPUT_BYTES = 3_000;

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
  return buildCurrentSemanticGraph(root);
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

function hookDelivery(hookEventName, envelope) {
  const response = semanticHookResponse(hookEventName, envelope);
  const output = serializeResponse(response);
  return {
    envelope,
    output,
    outputBytes: Buffer.byteLength(output),
    modelContextBytes: Buffer.byteLength(
      response.hookSpecificOutput.additionalContext,
    ),
  };
}

function deliveryFits(delivery) {
  return (
    delivery.modelContextBytes <= MODEL_CONTEXT_BYTES &&
    delivery.outputBytes <= HOST_OUTPUT_BYTES
  );
}

function unavailableHookDelivery(hookEventName, message) {
  const delivery = hookDelivery(
    hookEventName,
    unavailableSemanticContext(message, { maxOutputBytes: 2_048 }),
  );
  if (!deliveryFits(delivery)) {
    throw new Error("the bounded unavailable response exceeded host limits.");
  }
  return delivery;
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
      depth: hookEventName === "SessionStart" ? 0 : 2,
      maxFiles: 30,
      maxSelectedBytes: 400_000,
      maxOutputBytes,
    });
    const delivery = hookDelivery(hookEventName, envelope);
    if (deliveryFits(delivery)) return delivery;
    maxOutputBytes -= Math.max(
      64,
      delivery.modelContextBytes - MODEL_CONTEXT_BYTES,
      delivery.outputBytes - HOST_OUTPUT_BYTES,
    );
  }

  return unavailableHookDelivery(
    hookEventName,
    "The semantic context gateway could not fit a safe host response.",
  );
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
    ({ envelope, output, outputBytes } = unavailableHookDelivery(
      hookInput.hook_event_name,
    ));
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
