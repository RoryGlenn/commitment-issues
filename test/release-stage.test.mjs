// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactDigests,
  expectedRelease,
} from "../tools/release-recovery.mjs";
import {
  approvalSummary,
  createStageRecord,
  validateStageRecord,
} from "../tools/release-stage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "4.5.6";
const TAG = `v${VERSION}`;
const COMMIT = "a".repeat(40);
const TARBALL = Buffer.from("exact staged release bytes\n");
const STAGE_ID = "123e4567-e89b-42d3-a456-426614174000";

function stageOutput(overrides = {}) {
  const digests = artifactDigests(TARBALL);
  return {
    "commitment-issues": {
      id: `commitment-issues@${VERSION}`,
      name: "commitment-issues",
      version: VERSION,
      filename: `commitment-issues-${VERSION}.tgz`,
      shasum: digests.sha1,
      integrity: digests.integrity,
      stageId: STAGE_ID,
      ...overrides,
    },
  };
}

function create(overrides = {}) {
  return createStageRecord({
    stageOutput: stageOutput(),
    tarballBytes: TARBALL,
    version: VERSION,
    releaseTag: TAG,
    sourceCommit: COMMIT,
    workflowRunId: "12345",
    workflowRunAttempt: "1",
    nodeVersion: "24.18.0",
    npmVersion: "11.16.0",
    ...overrides,
  });
}

function expected() {
  return expectedRelease({
    version: VERSION,
    tag: TAG,
    commit: COMMIT,
    tarballBytes: TARBALL,
    releaseTitle: TAG,
    releaseNotes: "### Added\n\n- Staged publishing.",
  });
}

test("records the exact npm staged candidate identity", () => {
  const record = create();
  const digests = artifactDigests(TARBALL);

  assert.deepEqual(record, {
    schemaVersion: 1,
    kind: "npm-staged-release",
    stageId: STAGE_ID,
    packageName: "commitment-issues",
    version: VERSION,
    distTag: "latest",
    tarballName: `commitment-issues-${VERSION}.tgz`,
    tarballSha1: digests.sha1,
    tarballSha256: digests.sha256,
    tarballIntegrity: digests.integrity,
    releaseTag: TAG,
    sourceCommit: COMMIT,
    workflowPath: ".github/workflows/publish.yml",
    workflowRunId: "12345",
    workflowRunAttempt: "1",
    nodeVersion: "24.18.0",
    npmVersion: "11.16.0",
  });
  assert.equal(
    validateStageRecord(record, expected(), {
      expectedStageId: STAGE_ID,
      sourceRunId: "12345",
    }),
    record,
  );
});

test("rejects malformed, substituted, or ambiguous npm stage output", () => {
  for (const [output, pattern] of [
    [stageOutput({ stageId: "not-a-uuid" }), /valid stage ID/u],
    [stageOutput({ version: "4.5.7" }), /exact tested release tarball/u],
    [stageOutput({ shasum: "0".repeat(40) }), /exact tested release tarball/u],
    [
      {
        ...stageOutput(),
        other: stageOutput()["commitment-issues"],
      },
      /fields do not match/u,
    ],
  ]) {
    assert.throws(() => create({ stageOutput: output }), pattern);
  }
  assert.throws(() => create({ distTag: "next" }), /exact latest dist-tag/u);
  assert.throws(
    () => create({ releaseTag: "v4.5.7" }),
    /does not match the staged package version/u,
  );
  assert.throws(
    () => create({ sourceCommit: "A".repeat(40) }),
    /full lowercase Git commit ID/u,
  );
  assert.throws(
    () => create({ nodeVersion: "22.13.9" }),
    /Node version is below/u,
  );
  assert.throws(
    () => create({ npmVersion: "11.14.9" }),
    /npm version is below/u,
  );
});

test("stage records fail closed on identity, run, and schema drift", () => {
  const record = create();

  assert.throws(
    () =>
      validateStageRecord(
        { ...record, tarballSha256: "0".repeat(64) },
        expected(),
      ),
    /does not match the exact release identity/u,
  );
  assert.throws(
    () =>
      validateStageRecord(record, expected(), {
        expectedStageId: "123e4567-e89b-42d3-a456-426614174001",
      }),
    /approved npm stage ID does not match/u,
  );
  assert.throws(
    () =>
      validateStageRecord(record, expected(), {
        sourceRunId: "99999",
      }),
    /source workflow run does not match/u,
  );
  assert.throws(
    () => validateStageRecord({ ...record, unexpected: true }, expected()),
    /fields do not match/u,
  );
});

test("approval instructions identify the exact stage and require 2FA", () => {
  const summary = approvalSummary(create());
  assert.match(summary, new RegExp(`commitment-issues@${VERSION}`, "u"));
  assert.match(summary, new RegExp(`npm stage view ${STAGE_ID}`, "u"));
  assert.match(summary, new RegExp(`npm stage download ${STAGE_ID}`, "u"));
  assert.match(summary, new RegExp(`npm stage approve ${STAGE_ID}`, "u"));
  assert.match(summary, /explicit maintainer 2FA action/u);
  assert.match(summary, /Node: `24\.18\.0`/u);
  assert.match(summary, /npm: `11\.16\.0`/u);
});

test("release-stage CLI writes a deterministic record and approval summary", (t) => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-release-stage-"),
  );
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const resultPath = path.join(fixture, "stage-result.json");
  const tarballPath = path.join(fixture, `commitment-issues-${VERSION}.tgz`);
  const recordPath = path.join(fixture, "stage-record.json");
  const outputPath = path.join(fixture, "github-output.txt");
  const summaryPath = path.join(fixture, "summary.md");
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify({ name: "commitment-issues", version: VERSION })}\n`,
  );
  fs.writeFileSync(resultPath, `${JSON.stringify(stageOutput())}\n`);
  fs.writeFileSync(tarballPath, TARBALL);

  const recordResult = spawnSync(
    process.execPath,
    [
      path.join(root, "tools", "release-stage.mjs"),
      "record",
      "--result",
      resultPath,
      "--tarball",
      tarballPath,
      "--output",
      recordPath,
      "--release-tag",
      TAG,
      "--source-commit",
      COMMIT,
      "--run-id",
      "12345",
      "--run-attempt",
      "1",
      "--node-version",
      "24.18.0",
      "--npm-version",
      "11.16.0",
    ],
    {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
    },
  );
  assert.equal(recordResult.status, 0, recordResult.stderr);
  assert.match(fs.readFileSync(outputPath, "utf8"), /stage_id=123e4567/u);

  const approvalResult = spawnSync(
    process.execPath,
    [
      path.join(root, "tools", "release-stage.mjs"),
      "approval",
      "--record",
      recordPath,
    ],
    {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
    },
  );
  assert.equal(approvalResult.status, 0, approvalResult.stderr);
  assert.match(
    fs.readFileSync(summaryPath, "utf8"),
    /Prepared npm stage is ready/u,
  );
});
