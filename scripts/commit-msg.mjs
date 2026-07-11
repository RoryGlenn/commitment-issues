#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { errorBox, warningBox } from "./lib/ui.mjs";
import {
  loadPrecommitConfig,
  precommitConfigWarningMessages,
  resolveCommitMessageConfig,
} from "./lib/config.mjs";
import { buildCommitMessageCheckMessage } from "./lib/message.mjs";
import { devInstallCommand } from "./lib/package-manager.mjs";
import {
  interruptedToolOutcome,
  localToolInvocation,
} from "./lib/local-tool.mjs";
import { spawnAsync } from "./lib/process.mjs";

const config = loadPrecommitConfig();
for (const message of precommitConfigWarningMessages(config)) {
  console.warn(pc.yellow(`⚠ ${message}`));
}

const commitMessage = resolveCommitMessageConfig(config);
if (!commitMessage.enabled) {
  process.exit(0);
}

function finish(outcome, detail = "") {
  const model = buildCommitMessageCheckMessage({
    outcome,
    detail,
    blocking: commitMessage.blockOnFailure,
    tone: config.tone,
    installCommand: devInstallCommand(["@commitlint/cli"]),
  });
  (model.severity === "error" ? errorBox : warningBox)(model.lines);
  process.exit(commitMessage.blockOnFailure ? 1 : 0);
}

const messageFile = process.argv[2];
let absoluteMessageFile;
try {
  absoluteMessageFile = path.resolve(messageFile);
  if (!fs.statSync(absoluteMessageFile).isFile()) {
    finish("unreadable", `Not a file: ${messageFile}`);
  }
} catch {
  finish(
    "unreadable",
    messageFile
      ? `Could not open: ${messageFile}`
      : "No message file was provided.",
  );
}

const invocation = localToolInvocation("commitlint", [
  "--color=false",
  "--strict",
  "--edit",
  absoluteMessageFile,
]);
if (!invocation) {
  finish("missing-tool");
}

const result = await spawnAsync(invocation.command, invocation.args, {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

const detail = [result.stdout, result.stderr]
  .map((value) => String(value || "").trim())
  .filter(Boolean)
  .join("\n");

const interruptedOutcome = interruptedToolOutcome(result);
if (interruptedOutcome === "timeout") {
  finish(interruptedOutcome, detail);
}
if (interruptedOutcome === "unavailable") {
  finish("unavailable", result.error?.message || detail);
}
// Commitlint normally uses result code 9 when no rules configuration can be
// found. In --strict mode, current releases remap that same empty-rules error
// to result code 3, so retain the dedicated setup diagnosis by recognizing the
// standard formatter's empty-rules message as well as the documented exit code.
const strictMissingConfig =
  result.status === 3 &&
  /Please add rules to your [`'"]?commitlint\.config\.js/i.test(detail) &&
  /\[empty-rules\]/.test(detail);
if (result.status === 9 || strictMissingConfig) {
  finish("missing-config", detail);
}
if (result.status === 0) {
  process.exit(0);
}

finish("reported", detail || `Commitlint exited with status ${result.status}.`);
