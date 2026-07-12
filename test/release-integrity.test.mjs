// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkReleaseAvailability,
  normalizeReleaseVersion,
} from "../tools/release-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function availableGit(args) {
  if (args[0] === "show-ref") return { status: 1, stdout: "", stderr: "" };
  return { status: 0, stdout: "", stderr: "" };
}

test("publish workflow gates and publishes one immutable release", () => {
  const workflow = readText(".github/workflows/publish.yml");
  const provenanceJob = workflow.slice(
    workflow.indexOf("\n  provenance:"),
    workflow.indexOf("\n  publish-release:"),
  );
  const lifecycleGate = workflow.indexOf("run: npm run test:lifecycle:npm");
  const packStep = workflow.indexOf("- name: Pack tarball");
  const publishStep = workflow.indexOf("- name: Publish to npm");
  const provenanceDownload = workflow.indexOf(
    "- name: Download provenance artifact",
  );
  const releaseStep = workflow.indexOf(
    "- name: Publish immutable release with all assets",
  );

  assert.notEqual(lifecycleGate, -1);
  assert.notEqual(packStep, -1);
  assert.notEqual(publishStep, -1);
  assert.ok(
    lifecycleGate < packStep && packStep < publishStep,
    "npm lifecycle smoke must finish before the release tarball is packed and published",
  );

  assert.match(
    workflow,
    /npm publish "\.\/\$\{\{ steps\.pack\.outputs\.tarball \}\}" --access public/,
  );
  assert.match(
    workflow,
    /pull_request:\s+paths:\s+- "\.github\/workflows\/publish\.yml"/,
  );
  assert.match(
    workflow,
    /validate:\s+if: github\.event_name == 'pull_request'[\s\S]*Confirm release workflow validation/,
  );
  assert.match(
    workflow,
    /publish:\s+if: github\.event_name == 'push'/,
    "publishing must remain disabled during pull-request validation",
  );
  assert.match(
    workflow,
    /sha256sum "\$\{\{ steps\.pack\.outputs\.tarball \}\}"/,
  );
  assert.match(workflow, /path:\s+\$\{\{ steps\.pack\.outputs\.tarball \}\}/);
  assert.match(workflow, /upload-assets:\s+false/);
  assert.doesNotMatch(workflow, /upload-assets:\s+true/);
  assert.doesNotMatch(workflow, /upload-tag-name:/);
  assert.match(
    provenanceJob,
    /contents:\s+write/,
    "GitHub requires the caller to grant the reusable SLSA workflow's declared permission even when its upload job is skipped",
  );
  assert.match(workflow, /needs:\s+\[publish, provenance\]/);
  assert.match(
    workflow,
    /name:\s+\$\{\{ needs\.provenance\.outputs\.provenance-name \}\}/,
  );
  assert.match(workflow, /draft:\s+false/);
  assert.match(workflow, /release-assets\/\*\.tgz/);
  assert.match(workflow, /release-assets\/\*\.intoto\.jsonl/);
  assert.equal(
    workflow.match(/softprops\/action-gh-release/g)?.length,
    1,
    "one action must upload every asset before the release is finalized",
  );
  assert.match(
    workflow,
    /softprops\/action-gh-release@[0-9a-f]+ # v3\./,
    "the only release uploader must use the Node 24 action line",
  );
  assert.ok(
    publishStep < provenanceDownload && provenanceDownload < releaseStep,
    "npm publish and provenance generation must finish before one release action uploads both assets",
  );
});

test("manual exact-tarball publishing runs gates before packing", () => {
  const guide = readText(".github/skills/release-and-publish/SKILL.md");
  const lifecycleGate = guide.indexOf("npm run test:lifecycle:npm");
  const packCommand = guide.indexOf(
    'tarball="$(npm pack --silent | tail -n1)"',
  );
  const publishCommand = guide.indexOf('npm publish "./$tarball"');

  assert.match(
    guide,
    /Publishing a tarball does not run this root package's `prepublishOnly`/,
  );
  assert.notEqual(lifecycleGate, -1);
  assert.notEqual(packCommand, -1);
  assert.notEqual(publishCommand, -1);
  assert.ok(
    lifecycleGate < packCommand && packCommand < publishCommand,
    "manual gates must finish before the release tarball is packed and published",
  );
});

test("release verification uses supported npm provenance surfaces", () => {
  const docs = readText("docs/release-verification.md");

  assert.match(docs, /npm audit signatures/);
  assert.match(docs, /dist\.integrity dist\.signatures/);
  assert.doesNotMatch(docs, /npm view[^\n]*\bprovenance\b/);
  assert.match(docs, /must never be moved or reused/);
});

test("release preflight accepts a completely unused exact version", async () => {
  const requests = [];
  const result = await checkReleaseAvailability("3.2.1", {
    runGit: availableGit,
    request: async (url) => {
      requests.push(url);
      return { status: 404 };
    },
  });

  assert.deepEqual(result, { version: "3.2.1", tag: "v3.2.1" });
  assert.equal(requests.length, 2);
});

test("release preflight reports every existing public identifier", async () => {
  const runGit = (args) => {
    if (args[0] === "show-ref") return { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "sha refs/tags/v3.2.1\n", stderr: "" };
  };

  await assert.rejects(
    checkReleaseAvailability("v3.2.1", {
      runGit,
      request: async () => ({ status: 200 }),
    }),
    (error) => {
      assert.match(error.message, /local Git tag v3\.2\.1/);
      assert.match(error.message, /remote Git tag v3\.2\.1/);
      assert.match(error.message, /GitHub Release v3\.2\.1/);
      assert.match(error.message, /npm commitment-issues@3\.2\.1/);
      return true;
    },
  );
});

test("release preflight fails closed when a registry cannot be checked", async () => {
  await assert.rejects(
    checkReleaseAvailability("3.2.1", {
      runGit: availableGit,
      request: async () => ({ status: 503 }),
    }),
    /check failed with HTTP 503/,
  );
});

test("release preflight requires an exact semantic version", () => {
  assert.equal(normalizeReleaseVersion("v3.2.1"), "3.2.1");
  for (const invalid of ["", "next", "3.2", "03.2.1", "3.2.1.0", "3.2.1-01"]) {
    assert.throws(() => normalizeReleaseVersion(invalid), /semantic version/);
  }
});
