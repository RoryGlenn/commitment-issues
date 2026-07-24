#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { artifactDigests } from "./lib/release-artifact.mjs";
import { normalizeReleaseVersion } from "./release-preflight.mjs";

const PACKAGE_NAME = "commitment-issues";
const WORKFLOW_PATH = ".github/workflows/publish.yml";
const STAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u;
const RECORD_KEYS = [
  "schemaVersion",
  "kind",
  "stageId",
  "packageName",
  "version",
  "distTag",
  "tarballName",
  "tarballSha1",
  "tarballSha256",
  "tarballIntegrity",
  "releaseTag",
  "sourceCommit",
  "workflowPath",
  "workflowRunId",
  "workflowRunAttempt",
  "nodeVersion",
  "npmVersion",
];
const TOOL_VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;

export const STAGE_RECORD_SCHEMA_VERSION = 1;

function fail(message) {
  throw new Error(message);
}

function exactObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} fields do not match the reviewed schema.`);
  }
}

function readJsonFile(input, label) {
  const bytes = readRegularFile(input, label);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

function readRegularFile(input, label) {
  const resolved = path.resolve(String(input ?? ""));
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`${label} does not exist.`);
  }
  if (!stat.isFile()) fail(`${label} is not a regular file.`);
  return fs.readFileSync(resolved);
}

function validateStageId(value) {
  if (typeof value !== "string" || !STAGE_ID_PATTERN.test(value)) {
    fail("npm stage output did not contain one valid stage ID.");
  }
  return value;
}

function validatePositiveIntegerString(value, label) {
  const normalized = String(value ?? "");
  if (!POSITIVE_INTEGER_PATTERN.test(normalized)) {
    fail(`${label} must be a positive integer.`);
  }
  return normalized;
}

function validateToolVersion(value, label, minimum) {
  if (typeof value !== "string" || !TOOL_VERSION_PATTERN.test(value)) {
    fail(`${label} must be an exact stable semantic version.`);
  }
  const actual = value.split(".").map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] === minimum[index]) continue;
    if (actual[index] > minimum[index]) return value;
    fail(`${label} is below the staged-publishing minimum.`);
  }
  return value;
}

function validateStageOutput(stageOutput, packageName) {
  const output = exactObject(stageOutput, "npm stage JSON output");
  exactKeys(output, [packageName], "npm stage JSON output");
  return exactObject(output[packageName], "npm staged package result");
}

export function createStageRecord({
  stageOutput,
  tarballBytes,
  packageName = PACKAGE_NAME,
  version,
  distTag = "latest",
  releaseTag,
  sourceCommit,
  workflowRunId,
  workflowRunAttempt,
  nodeVersion,
  npmVersion,
}) {
  const normalizedVersion = normalizeReleaseVersion(version);
  const result = validateStageOutput(stageOutput, packageName);
  const digests = artifactDigests(tarballBytes);
  const tarballName = `${packageName}-${normalizedVersion}.tgz`;
  const expectedId = `${packageName}@${normalizedVersion}`;

  if (
    result.id !== expectedId ||
    result.name !== packageName ||
    result.version !== normalizedVersion ||
    result.filename !== tarballName ||
    result.shasum !== digests.sha1 ||
    result.integrity !== digests.integrity
  ) {
    fail(
      "npm stage output does not identify the exact tested release tarball.",
    );
  }
  if (distTag !== "latest") {
    fail("Stable releases must stage with the exact latest dist-tag.");
  }
  if (releaseTag !== `v${normalizedVersion}`) {
    fail("Release tag does not match the staged package version.");
  }
  if (typeof sourceCommit !== "string" || !COMMIT_PATTERN.test(sourceCommit)) {
    fail("Source commit must be a full lowercase Git commit ID.");
  }

  return {
    schemaVersion: STAGE_RECORD_SCHEMA_VERSION,
    kind: "npm-staged-release",
    stageId: validateStageId(result.stageId),
    packageName,
    version: normalizedVersion,
    distTag,
    tarballName,
    tarballSha1: digests.sha1,
    tarballSha256: digests.sha256,
    tarballIntegrity: digests.integrity,
    releaseTag,
    sourceCommit,
    workflowPath: WORKFLOW_PATH,
    workflowRunId: validatePositiveIntegerString(
      workflowRunId,
      "Workflow run ID",
    ),
    workflowRunAttempt: validatePositiveIntegerString(
      workflowRunAttempt,
      "Workflow run attempt",
    ),
    nodeVersion: validateToolVersion(nodeVersion, "Node version", [22, 14, 0]),
    npmVersion: validateToolVersion(npmVersion, "npm version", [11, 15, 0]),
  };
}

export function validateStageRecord(
  stageRecord,
  expected,
  { expectedStageId = null, sourceRunId = null } = {},
) {
  const record = exactObject(stageRecord, "npm stage record");
  exactKeys(record, RECORD_KEYS, "npm stage record");
  const normalizedVersion = normalizeReleaseVersion(record.version);
  validateStageId(record.stageId);
  validatePositiveIntegerString(record.workflowRunId, "Workflow run ID");
  validatePositiveIntegerString(
    record.workflowRunAttempt,
    "Workflow run attempt",
  );
  validateToolVersion(record.nodeVersion, "Node version", [22, 14, 0]);
  validateToolVersion(record.npmVersion, "npm version", [11, 15, 0]);

  if (
    record.schemaVersion !== STAGE_RECORD_SCHEMA_VERSION ||
    record.kind !== "npm-staged-release" ||
    record.packageName !== expected.packageName ||
    normalizedVersion !== expected.version ||
    record.distTag !== "latest" ||
    record.tarballName !== expected.tarballName ||
    record.tarballSha1 !== expected.tarballDigests.sha1 ||
    record.tarballSha256 !== expected.tarballDigests.sha256 ||
    record.tarballIntegrity !== expected.tarballDigests.integrity ||
    record.releaseTag !== expected.tag ||
    record.sourceCommit !== expected.commit ||
    record.workflowPath !== WORKFLOW_PATH
  ) {
    fail("npm stage record does not match the exact release identity.");
  }
  if (expectedStageId !== null && record.stageId !== expectedStageId) {
    fail("The approved npm stage ID does not match the recorded candidate.");
  }
  if (sourceRunId !== null && record.workflowRunId !== String(sourceRunId)) {
    fail(
      "The selected source workflow run does not match the npm stage record.",
    );
  }
  return record;
}

export function approvalSummary(stageRecord) {
  const record = exactObject(stageRecord, "npm stage record");
  validateStageId(record.stageId);
  if (
    record.packageName !== PACKAGE_NAME ||
    normalizeReleaseVersion(record.version) !== record.version ||
    record.distTag !== "latest" ||
    record.releaseTag !== `v${record.version}` ||
    !COMMIT_PATTERN.test(record.sourceCommit)
  ) {
    fail("npm stage record is not safe to present for approval.");
  }
  return [
    "### Prepared npm stage is ready for maintainer review",
    "",
    `- Package: \`${record.packageName}@${record.version}\``,
    `- Stage ID: \`${record.stageId}\``,
    `- Dist-tag: \`${record.distTag}\``,
    `- SHA-1: \`${record.tarballSha1}\``,
    `- SHA-256: \`${record.tarballSha256}\``,
    `- Release tag: \`${record.releaseTag}\``,
    `- Source commit: \`${record.sourceCommit}\``,
    `- Node: \`${record.nodeVersion}\``,
    `- npm: \`${record.npmVersion}\``,
    "",
    "Review the prepared draft and exact staged package before approving:",
    "",
    "```sh",
    `npm stage view ${record.stageId}`,
    `npm stage download ${record.stageId}`,
    `sha256sum "${record.packageName}-${record.version}-${record.stageId}.tgz"`,
    `npm stage approve ${record.stageId}`,
    "```",
    "",
    "Approval is an explicit maintainer 2FA action. After approval, dispatch",
    "`Publish Package` with this release tag, source run ID, and stage ID.",
  ].join("\n");
}

function parseArgs(argv) {
  const mode = argv[0];
  if (mode !== "record" && mode !== "approval") {
    fail("Expected release-stage mode 'record' or 'approval'.");
  }
  const options = { mode, distTag: "latest" };
  const valueOptions =
    mode === "record"
      ? new Set([
          "--result",
          "--tarball",
          "--output",
          "--release-tag",
          "--source-commit",
          "--run-id",
          "--run-attempt",
          "--node-version",
          "--npm-version",
          "--dist-tag",
        ])
      : new Set(["--record"]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!valueOptions.has(argument)) {
      fail(`Unknown release stage option '${argument}'.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${argument} requires a value.`);
    }
    const key = argument.slice(2).replaceAll("-", "_");
    if (options[key]) fail(`${argument} may be provided only once.`);
    options[key] = value;
    index += 1;
  }
  const required =
    mode === "record"
      ? [
          "result",
          "tarball",
          "output",
          "release_tag",
          "source_commit",
          "run_id",
          "run_attempt",
          "node_version",
          "npm_version",
        ]
      : ["record"];
  for (const key of required) {
    if (!options[key]) fail(`--${key.replaceAll("_", "-")} is required.`);
  }
  return options;
}

function appendGithubOutputs(file, outputs) {
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  fs.appendFileSync(file, `${lines}\n`, "utf8");
}

function escapeWorkflowCommand(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function writeRecord(options) {
  const packageJson = readJsonFile("package.json", "package.json");
  const record = createStageRecord({
    stageOutput: readJsonFile(options.result, "npm stage result"),
    tarballBytes: readRegularFile(options.tarball, "Release tarball"),
    packageName: packageJson.name,
    version: packageJson.version,
    distTag: options.dist_tag,
    releaseTag: options.release_tag,
    sourceCommit: options.source_commit,
    workflowRunId: options.run_id,
    workflowRunAttempt: options.run_attempt,
    nodeVersion: options.node_version,
    npmVersion: options.npm_version,
  });
  fs.writeFileSync(
    path.resolve(options.output),
    `${JSON.stringify(record, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  if (process.env.GITHUB_OUTPUT) {
    appendGithubOutputs(process.env.GITHUB_OUTPUT, {
      stage_id: record.stageId,
      stage_record: path.resolve(options.output),
    });
  }
  console.log(
    `Recorded npm stage ${record.stageId} for ${record.packageName}@${record.version}.`,
  );
}

function writeApproval(options) {
  const record = readJsonFile(options.record, "npm stage record");
  const summary = approvalSummary(record);
  if (!process.env.GITHUB_STEP_SUMMARY) {
    fail("GITHUB_STEP_SUMMARY is required for the approval summary.");
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
  console.log(
    `Prepared maintainer approval instructions for npm stage ${record.stageId}.`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "record") writeRecord(options);
    else writeApproval(options);
  } catch (error) {
    console.error(
      `::error title=Release stage refused::${escapeWorkflowCommand(error.message)}`,
    );
    process.exitCode = 1;
  }
}
