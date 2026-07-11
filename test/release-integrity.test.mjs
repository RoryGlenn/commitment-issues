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

test("publish workflow publishes the packed subject and uploads provenance", () => {
  const workflow = readText(".github/workflows/publish.yml");

  assert.match(
    workflow,
    /npm publish "\.\/\$\{\{ steps\.pack\.outputs\.tarball \}\}" --access public/,
  );
  assert.match(
    workflow,
    /sha256sum "\$\{\{ steps\.pack\.outputs\.tarball \}\}"/,
  );
  assert.match(workflow, /path:\s+\$\{\{ steps\.pack\.outputs\.tarball \}\}/);
  assert.match(workflow, /upload-assets:\s+true/);
  assert.match(workflow, /upload-tag-name:\s+\$\{\{ github\.ref_name \}\}/);
  assert.match(workflow, /needs:\s+\[publish, provenance\]/);
  assert.match(workflow, /files:\s+"\*\.tgz"/);
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
