// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  cleanupTempRepo,
  createTempRepo,
  repoRoot,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

const checkerPath = path.join(repoRoot, "tools", "check-markdown-links.mjs");

test("checker accepts valid local relative targets without emitting diagnostics", () => {
  const tempDir = createTempRepo();
  try {
    writeFile(
      path.join(tempDir, "docs", "links.md"),
      [
        "[space target](./space%20file.md?ref=docs#top)",
        "[docs directory](..)",
        "[extensionless target](../DCO)",
        "[reference definition]: ../README.md",
        "[external](https://example.com)",
        "[mail link](mailto:test@example.com)",
        "[#section](#docs)",
        "```",
        "[inside code](does-not-exist.md)",
        "```",
      ].join("\n"),
    );
    writeFile(path.join(tempDir, "docs", "space file.md"), "ok\n");

    run("git", ["add", "--", "docs/links.md", "docs/space file.md"], tempDir);

    const result = run("node", [checkerPath], tempDir);
    assert.equal(result.status, 0, "the checker should exit cleanly for valid links");
    assert.equal(result.stderr, "");
  } finally {
    cleanupTempRepo(tempDir);
  }
});

test("checker reports every missing or escaping relative target", () => {
  const tempDir = createTempRepo();
  try {
    writeFile(
      path.join(tempDir, "docs", "broken.md"),
      [
        "[missing inline](./missing-inline.md)",
        "[missing reference]: ./missing-reference.md",
        "[escape root](../../outside.md)",
        "[encoded escape](..%2F..%2Foutside-encoded.md)",
        "[malformed percent](./%ZZ.md)",
      ].join("\n"),
    );

    run("git", ["add", "--", "docs/broken.md"], tempDir);

    const result = run("node", [checkerPath], tempDir);
    assert.equal(result.status, 1, "the checker should fail when broken targets exist");

    const stderr = result.stderr;
    assert.ok(
      stderr.includes("missing-inline.md (target not found)"),
      "inline missing links should be reported",
    );
    assert.ok(
      stderr.includes("missing-reference.md (target not found)"),
      "reference-style missing links should appear in the output",
    );
    assert.ok(
      stderr.includes("outside.md (path escapes repository root)"),
      "plain escaping targets should produce diagnostics",
    );
    assert.ok(
      stderr.includes("outside-encoded.md (path escapes repository root)"),
      "URL-encoded escapes should also be flagged",
    );
    assert.ok(
      stderr.includes("malformed percent-encoding"),
      "percent decoding failures should surface meaningful text",
    );
  } finally {
    cleanupTempRepo(tempDir);
  }
});
