// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GENERATED_GLOBS,
  DEFAULT_MAX_COMMIT_FILES,
  DEFAULT_MAX_COMMIT_LINES,
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_PROTECTED_BRANCHES,
  behindUpstreamIssue,
  branchFromRef,
  generatedFilesIssue,
  isProtectedBranch,
  largeCommitIssues,
  largeFileIssue,
  largeFileInspectionIssue,
  matchGeneratedPaths,
  parseBatchCheckSizes,
  parseNumstat,
  protectedBranchIssue,
  resolveGuardConfig,
} from "../scripts/lib/commit-guards.mjs";

const MB = 1024 * 1024;

test("resolveGuardConfig applies documented defaults", () => {
  const resolved = resolveGuardConfig({});

  assert.deepEqual(resolved.protectedBranches, DEFAULT_PROTECTED_BRANCHES);
  assert.equal(resolved.blockProtectedBranches, false);
  assert.equal(resolved.maxCommitFiles, DEFAULT_MAX_COMMIT_FILES);
  assert.equal(resolved.maxCommitLines, DEFAULT_MAX_COMMIT_LINES);
  assert.equal(resolved.maxFileSizeMb, DEFAULT_MAX_FILE_SIZE_MB);
  assert.deepEqual(resolved.generatedPaths, DEFAULT_GENERATED_GLOBS);
  assert.equal(resolved.adviseBehindUpstream, true);
});

test("resolveGuardConfig honors explicit values including disables", () => {
  const resolved = resolveGuardConfig({
    protectedBranches: [],
    blockProtectedBranches: true,
    maxCommitFiles: 0,
    maxCommitLines: 100,
    maxFileSizeMb: 1,
    generatedPaths: ["out/**"],
    adviseBehindUpstream: false,
  });

  assert.deepEqual(resolved.protectedBranches, []);
  assert.equal(resolved.blockProtectedBranches, true);
  assert.equal(resolved.maxCommitFiles, 0);
  assert.equal(resolved.maxCommitLines, 100);
  assert.equal(resolved.maxFileSizeMb, 1);
  assert.deepEqual(resolved.generatedPaths, ["out/**"]);
  assert.equal(resolved.adviseBehindUpstream, false);
});

test("isProtectedBranch matches names and globs, never detached HEAD", () => {
  assert.equal(isProtectedBranch("main", ["main", "master"]), true);
  assert.equal(isProtectedBranch("master", ["main", "master"]), true);
  assert.equal(isProtectedBranch("feature/x", ["main", "master"]), false);
  assert.equal(isProtectedBranch("release/1.2", ["release/*"]), true);
  assert.equal(isProtectedBranch("release/1/2", ["release/*"]), false);
  assert.equal(isProtectedBranch("release/1/2", ["release/**"]), true);
  assert.equal(isProtectedBranch("HEAD", ["HEAD", "main"]), false);
  assert.equal(isProtectedBranch(null, ["main"]), false);
  assert.equal(isProtectedBranch("main", []), false);
});

test("branchFromRef extracts branch names and rejects non-branch refs", () => {
  assert.equal(branchFromRef("refs/heads/main"), "main");
  assert.equal(branchFromRef("refs/heads/feature/x"), "feature/x");
  assert.equal(branchFromRef("refs/tags/v1.0.0"), null);
  assert.equal(branchFromRef(undefined), null);
});

test("parseNumstat totals files and lines, counting binary as 0 lines", () => {
  const stdout =
    "10\t2\tsrc/a.mjs\0-\t-\tassets/logo.png\0" + "3\t0\tdocs/b.md\0";

  assert.deepEqual(parseNumstat(stdout), { fileCount: 3, changedLines: 15 });
  assert.deepEqual(parseNumstat(""), { fileCount: 0, changedLines: 0 });
  assert.equal(parseNumstat(undefined), null);
});

test("parseNumstat counts NUL-delimited rename entries once", () => {
  const stdout =
    "5\t1\t\0src/old\tname.mjs\0src/new\nname.mjs\0" +
    "2\t3\t trailing /file.mjs\0";

  assert.deepEqual(parseNumstat(stdout), { fileCount: 2, changedLines: 11 });
  assert.equal(parseNumstat("not a numstat record\0"), null);
  assert.equal(parseNumstat("1\t0\t\0only-old.mjs\0"), null);
});

test("parseBatchCheckSizes zips sizes onto the piped file order", () => {
  const files = ["big.bin", "missing.txt", "small.txt"];
  const stdout = [
    "abc123 blob 6291456",
    ":0:missing.txt missing",
    "def456 blob 10",
  ].join("\n");

  assert.deepEqual(parseBatchCheckSizes(stdout, files), [
    { file: "big.bin", bytes: 6291456 },
    { file: "small.txt", bytes: 10 },
  ]);
  assert.deepEqual(parseBatchCheckSizes("", files), []);
});

test("parseBatchCheckSizes ignores output lines beyond the piped file list", () => {
  // Defensive: git should answer one line per object spec, but a surplus
  // line must map to no file rather than throwing or inventing entries.
  const stdout = ["abc blob 10", "def blob 20", "eee blob 30"].join("\n");

  assert.deepEqual(parseBatchCheckSizes(stdout, ["only.txt"]), [
    { file: "only.txt", bytes: 10 },
  ]);
});

test("matchGeneratedPaths flags default build/dependency artifacts anywhere", () => {
  const files = [
    "dist/bundle.js",
    "packages/app/build/main.js",
    "coverage/index.html",
    "node_modules/pkg/index.js",
    ".DS_Store",
    "sub/.DS_Store",
    "src/__pycache__/mod.pyc",
    "src/app.mjs",
    "distribution/notes.md",
  ];

  assert.deepEqual(matchGeneratedPaths(files, DEFAULT_GENERATED_GLOBS), [
    "dist/bundle.js",
    "packages/app/build/main.js",
    "coverage/index.html",
    "node_modules/pkg/index.js",
    ".DS_Store",
    "sub/.DS_Store",
    "src/__pycache__/mod.pyc",
  ]);
});

test("protectedBranchIssue warns only on protected branches", () => {
  const guardConfig = resolveGuardConfig({});

  const issue = protectedBranchIssue("main", guardConfig);
  assert.equal(issue.autoFixable, false);
  assert.equal(issue.message, 'Committing directly to protected branch "main"');
  assert.match(issue.detail, /git switch -c/);

  assert.equal(protectedBranchIssue("feature/x", guardConfig), null);
  assert.equal(
    protectedBranchIssue("main", resolveGuardConfig({ protectedBranches: [] })),
    null,
  );
});

test("largeCommitIssues fires per exceeded limit and honors 0-disables", () => {
  const guardConfig = resolveGuardConfig({
    maxCommitFiles: 3,
    maxCommitLines: 100,
  });

  assert.deepEqual(
    largeCommitIssues({ fileCount: 3, changedLines: 100 }, guardConfig),
    [],
  );

  const both = largeCommitIssues(
    { fileCount: 4, changedLines: 101 },
    guardConfig,
  );
  assert.equal(both.length, 2);
  assert.equal(both[0].message, "Large commit: 4 staged files (limit 3)");
  assert.equal(both[1].message, "Large commit: 101 changed lines (limit 100)");

  assert.deepEqual(
    largeCommitIssues(
      { fileCount: 500, changedLines: 99999 },
      resolveGuardConfig({ maxCommitFiles: 0, maxCommitLines: 0 }),
    ),
    [],
  );
});

test("largeFileIssue lists oversized files with sizes and an LFS nudge", () => {
  const guardConfig = resolveGuardConfig({ maxFileSizeMb: 5 });
  const sizes = [
    { file: "demo.mov", bytes: 42 * MB },
    { file: "small.txt", bytes: 10 },
  ];

  const issue = largeFileIssue(sizes, guardConfig);
  assert.equal(issue.message, "1 staged file over 5 MB");
  assert.deepEqual(issue.detail, [
    "42.0 MB  demo.mov",
    "Did you mean to use Git LFS?",
  ]);

  assert.equal(
    largeFileIssue([{ file: "ok.txt", bytes: MB }], guardConfig),
    null,
  );
  assert.equal(
    largeFileIssue(sizes, resolveGuardConfig({ maxFileSizeMb: 0 })),
    null,
  );
});

test("largeFileInspectionIssue distinguishes Git failures from the output ceiling", () => {
  assert.deepEqual(largeFileInspectionIssue(), {
    autoFixable: false,
    type: "shape",
    message: "Staged file-size check unavailable",
    detail:
      "Git could not inspect staged blob sizes; retry after restoring Git access.",
  });
  assert.match(
    largeFileInspectionIssue({ code: "ENOBUFS" }).detail,
    /bounded inspection buffer/,
  );
});

test("generatedFilesIssue reports matches and stays quiet otherwise", () => {
  const guardConfig = resolveGuardConfig({});

  const issue = generatedFilesIssue(
    ["dist/a.js", "src/b.mjs", "coverage/lcov.info"],
    guardConfig,
  );
  assert.equal(issue.message, "2 generated files staged");
  assert.deepEqual(issue.detail, [
    "dist/a.js, coverage/lcov.info",
    "These are usually ignored, not committed.",
  ]);

  assert.equal(generatedFilesIssue(["src/b.mjs"], guardConfig), null);
});

test("behindUpstreamIssue nudges only when actually behind", () => {
  const guardConfig = resolveGuardConfig({});

  const issue = behindUpstreamIssue(
    { behindCount: 7, upstream: "origin/main" },
    guardConfig,
  );
  assert.equal(issue.message, "Branch is 7 commits behind origin/main");

  const single = behindUpstreamIssue(
    { behindCount: 1, upstream: "origin/main" },
    guardConfig,
  );
  assert.equal(single.message, "Branch is 1 commit behind origin/main");

  assert.equal(
    behindUpstreamIssue(
      { behindCount: 0, upstream: "origin/main" },
      guardConfig,
    ),
    null,
  );
  assert.equal(behindUpstreamIssue(null, guardConfig), null);
  assert.equal(
    behindUpstreamIssue(
      { behindCount: 7, upstream: "origin/main" },
      resolveGuardConfig({ adviseBehindUpstream: false }),
    ),
    null,
  );
});
