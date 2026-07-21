#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const cwd = process.cwd();
const packageRequire = createRequire(
  path.join(cwd, "node_modules", "commitment-issues", "package.json"),
);
const crossSpawn = packageRequire("cross-spawn");
const yaml = packageRequire("js-yaml");
const args = process.argv.slice(2);
const executable = path.basename(process.argv[1]).toLowerCase();
const logPath = process.env.COMMITMENT_ISSUES_LIFECYCLE_HOOK_LOG;

function fail(message) {
  console.error(`[lifecycle manager harness] ${message}`);
  process.exit(92);
}

function appendRecord(record) {
  if (!logPath) {
    fail("COMMITMENT_ISSUES_LIFECYCLE_HOOK_LOG is required");
  }
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function fixturePath(relativePath) {
  const resolved = path.resolve(cwd, relativePath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`configuration escapes the lifecycle repository: ${relativePath}`);
  }
  return resolved;
}

function readYaml(relativePath) {
  const content = fs.readFileSync(fixturePath(relativePath), "utf8");
  try {
    return yaml.load(content, {
      json: true,
      schema: yaml.JSON_SCHEMA,
    });
  } catch (error) {
    fail(`could not parse ${relativePath}: ${error.message}`);
  }
}

function parseEntry(entry) {
  if (typeof entry !== "string" || entry.trim() !== entry || !entry) {
    fail("manager entry must be one non-empty command line");
  }
  const tokens = entry.split(/[ \t]+/u);
  if (
    tokens.length < 2 ||
    tokens.some((token) => !/^[A-Za-z0-9_./:@=+-]+$/u.test(token))
  ) {
    fail(`manager entry is outside the argv-only lifecycle contract: ${entry}`);
  }

  const [command, ...commandArgs] = tokens;
  const expectedCommand = "node_modules/.bin/commitment-issues";
  if (command !== expectedCommand) {
    fail(`manager entry did not select the packed bin: ${command}`);
  }
  const resolvedCommand = fixturePath(command);
  if (!fs.existsSync(resolvedCommand)) {
    fail(`configured packed bin does not exist: ${command}`);
  }
  return { command, commandArgs, resolvedCommand };
}

function runEntry({
  manager,
  hook,
  entry,
  extraArgs = [],
  managerInput = "",
  entryInput = "",
  entryEnv = {},
}) {
  const { command, commandArgs, resolvedCommand } = parseEntry(entry);
  const finalArgs = [...commandArgs, ...extraArgs];
  appendRecord({
    manager,
    hook,
    entry,
    command,
    resolvedCommand,
    args: finalArgs,
    managerInput,
    entryInput,
    entryEnv,
  });

  const result = crossSpawn.sync(command, finalArgs, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...entryEnv },
    input: entryInput,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    fail(`could not execute configured entry: ${result.error.message}`);
  }
  process.exit(result.status ?? 93);
}

function dispatchLefthook() {
  if (args.length === 1 && args[0] === "-h") {
    process.exit(0);
  }
  if (args.length < 2 || args[0] !== "run") {
    fail(`unexpected Lefthook invocation: ${JSON.stringify(args)}`);
  }
  const hook = args[1];
  const document = readYaml("lefthook.yml");
  const command = document?.[hook]?.commands?.["commitment-issues"];
  if (!command || typeof command !== "object") {
    fail(`lefthook.yml has no commitment-issues entry for ${hook}`);
  }
  const managerInput = fs.readFileSync(0, "utf8");
  runEntry({
    manager: "lefthook",
    hook,
    entry: command.run,
    managerInput,
    entryInput: command.use_stdin === true ? managerInput : "",
  });
}

function preCommitPushEnvironment(managerInput, forwardedArgs) {
  const records = managerInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/u));
  if (records.length !== 1 || records[0].length !== 4) {
    fail("pre-commit pre-push input must contain exactly one ref update");
  }
  if (forwardedArgs.length !== 2) {
    fail("pre-commit pre-push must receive the remote name and URL");
  }
  const [localRef, localSha, remoteRef, remoteSha] = records[0];
  const [remoteName, remoteUrl] = forwardedArgs;
  return {
    PRE_COMMIT_FROM_REF: remoteSha,
    PRE_COMMIT_LOCAL_BRANCH: localRef,
    PRE_COMMIT_REMOTE_BRANCH: remoteRef,
    PRE_COMMIT_REMOTE_NAME: remoteName,
    PRE_COMMIT_REMOTE_URL: remoteUrl,
    PRE_COMMIT_TO_REF: localSha,
  };
}

function dispatchPreCommit() {
  if (args[0] !== "-mpre_commit" || args[1] !== "hook-impl") {
    fail(`unexpected pre-commit invocation: ${JSON.stringify(args)}`);
  }
  const separator = args.indexOf("--");
  const configArg = args.find((arg) => arg.startsWith("--config="));
  const hookArg = args.find((arg) => arg.startsWith("--hook-type="));
  if (separator === -1 || !configArg || !hookArg) {
    fail("pre-commit runner omitted its config, hook type, or argv separator");
  }
  const config = configArg.slice("--config=".length);
  const hook = hookArg.slice("--hook-type=".length);
  const forwardedArgs = args.slice(separator + 1);
  const document = readYaml(config);
  const matchingHooks = (document?.repos ?? [])
    .filter((repo) => repo?.repo === "local")
    .flatMap((repo) => repo.hooks ?? [])
    .filter((candidate) => candidate?.stages?.includes(hook));
  if (matchingHooks.length !== 1) {
    fail(`${config} must have exactly one local entry for ${hook}`);
  }

  const [configuredHook] = matchingHooks;
  const skippedHooks = new Set(
    String(process.env.SKIP ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (skippedHooks.has(configuredHook.id)) {
    process.exit(0);
  }
  const managerInput = fs.readFileSync(0, "utf8");
  const entryEnv =
    hook === "pre-push"
      ? preCommitPushEnvironment(managerInput, forwardedArgs)
      : {};
  runEntry({
    manager: "pre-commit",
    hook,
    entry: configuredHook.entry,
    extraArgs: configuredHook.pass_filenames === false ? [] : forwardedArgs,
    managerInput,
    entryInput: "",
    entryEnv,
  });
}

if (executable === "lefthook" && args.length === 1 && args[0] === "-h") {
  process.exit(0);
}

if (process.env.COMMITMENT_ISSUES_LIFECYCLE_HOOK_MODE === "probe") {
  appendRecord(args);
  const exitCode = Number(process.env.COMMITMENT_ISSUES_LIFECYCLE_HOOK_EXIT);
  process.exit(Number.isInteger(exitCode) ? exitCode : 0);
}

if (executable === "lefthook") {
  dispatchLefthook();
} else if (executable === "python3") {
  dispatchPreCommit();
} else {
  fail(`unsupported manager executable: ${executable}`);
}
