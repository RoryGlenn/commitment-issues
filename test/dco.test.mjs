// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  findUnsignedCommits,
  hasDcoSignoff,
} from "../tools/check-dco-range.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "tools", "check-dco-range.mjs");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(cwd, subject, { signed = false } = {}) {
  const args = ["commit", "--allow-empty", "-m", subject];
  if (signed) {
    args.push("-m", "Signed-off-by: Test Maintainer <test@example.com>");
  }
  git(cwd, args);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dco-range-"));
  git(cwd, ["init"]);
  git(cwd, ["config", "user.name", "Test Maintainer"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  const baseline = commit(cwd, "historical unsigned baseline");
  const signed = commit(cwd, "signed change", { signed: true });
  const unsigned = commit(cwd, "unsigned change");
  return { cwd, baseline, signed, unsigned };
}

function divergedFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dco-diverged-range-"));
  git(cwd, ["init"]);
  git(cwd, ["config", "user.name", "Test Maintainer"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  const baseBranch = git(cwd, ["branch", "--show-current"]);
  const baseline = commit(cwd, "shared baseline");

  git(cwd, ["checkout", "-b", "feature"]);
  const head = commit(cwd, "signed feature change", { signed: true });

  git(cwd, ["checkout", baseBranch]);
  const advancedBase = commit(cwd, "signed base branch change", {
    signed: true,
  });
  return { cwd, baseline, head, advancedBase };
}

test("recognizes a well-formed DCO trailer", () => {
  assert.equal(
    hasDcoSignoff(
      "Subject\n\nSigned-off-by: Test Maintainer <test@example.com>\n",
    ),
    true,
  );
  assert.equal(hasDcoSignoff("Signed off by Test Maintainer"), false);
  assert.equal(
    hasDcoSignoff(
      "Subject\n\nSigned-off-by: Test Maintainer <test@example.com>\n\nMore body text after the claimed sign-off.\n",
    ),
    false,
    "a matching body line is not a parsed Git trailer",
  );
});

test("audits only commits after the prospective baseline", (t) => {
  const repo = fixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  assert.deepEqual(findUnsignedCommits(repo.baseline, repo.signed, repo), []);
  assert.deepEqual(findUnsignedCommits(repo.baseline, repo.unsigned, repo), [
    { commit: repo.unsigned, subject: "unsigned change" },
  ]);
});

test("pull-request mode audits from the merge base when main advances", (t) => {
  const repo = divergedFixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  assert.throws(
    () => findUnsignedCommits(repo.advancedBase, repo.head, repo),
    /missing from the ancestry/,
  );
  assert.deepEqual(
    findUnsignedCommits(repo.advancedBase, repo.head, {
      ...repo,
      useMergeBase: true,
    }),
    [],
  );
});

test("post-merge audit catches an unsigned server-generated squash", (t) => {
  const repo = fixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));
  const tree = git(repo.cwd, ["rev-parse", `${repo.baseline}^{tree}`]);
  const squash = git(repo.cwd, [
    "commit-tree",
    tree,
    "-p",
    repo.baseline,
    "-m",
    "unsigned server squash",
  ]);

  assert.deepEqual(findUnsignedCommits(repo.baseline, squash, repo), [
    { commit: squash, subject: "unsigned server squash" },
  ]);
});

test("CLI reports every unsigned commit and exits non-zero", (t) => {
  const repo = fixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [script, repo.baseline, repo.unsigned],
    {
      cwd: repo.cwd,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(repo.unsigned));
  assert.match(result.stderr, /unsigned change/);
  assert.doesNotMatch(result.stderr, new RegExp(repo.baseline));
});

test("CLI rejects abbreviated or otherwise malformed commit ids", (t) => {
  const repo = fixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [script, "abc123", repo.unsigned],
    {
      cwd: repo.cwd,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /base must be a full 40- or 64-character/);
});
