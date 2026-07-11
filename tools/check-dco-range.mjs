#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DCO_ENFORCEMENT_BASELINE =
  "81a9e412bc347f01300df62505ee378284646d15";

const COMMIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
const DCO_TRAILER = /^Signed-off-by:\s+\S(?:.*\S)?\s+<[^<>@\s]+@[^<>\s]+>\s*$/m;

export function hasDcoSignoff(message) {
  // A matching line in the message body is not a DCO trailer. Delegate the
  // trailer-block boundary and unfolding rules to Git, then validate only the
  // parsed trailer output. --parse ignores trailer.* config and commands.
  const parsed = git(["interpret-trailers", "--parse"], {
    allowFailure: true,
    input: String(message ?? ""),
  });
  return parsed.status === 0 && DCO_TRAILER.test(parsed.stdout);
}

function git(args, { cwd = process.cwd(), allowFailure = false, input } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", input });
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git failed").trim();
    throw new Error(detail);
  }
  return result;
}

function assertCommitSha(value, label) {
  if (!COMMIT_SHA.test(value ?? "")) {
    throw new Error(`${label} must be a full 40- or 64-character commit SHA`);
  }
}

function resolveAuditBase(
  base,
  head,
  { cwd = process.cwd(), useMergeBase = false } = {},
) {
  assertCommitSha(base, "base");
  assertCommitSha(head, "head");

  if (useMergeBase) {
    const commonAncestor = git(["merge-base", base, head], {
      cwd,
      allowFailure: true,
    });
    const auditBase = (commonAncestor.stdout ?? "").trim().split(/\r?\n/, 1)[0];
    if (commonAncestor.status !== 0 || !COMMIT_SHA.test(auditBase)) {
      throw new Error(
        `no common ancestor exists between pull-request base ${base} and head ${head}`,
      );
    }
    return auditBase;
  }

  const ancestry = git(["merge-base", "--is-ancestor", base, head], {
    cwd,
    allowFailure: true,
  });
  if (ancestry.status !== 0) {
    throw new Error(
      `DCO baseline ${base} is missing from the ancestry of ${head}`,
    );
  }
  return base;
}

export function auditDcoRange(
  base,
  head,
  { cwd = process.cwd(), useMergeBase = false } = {},
) {
  const auditBase = resolveAuditBase(base, head, {
    cwd,
    useMergeBase,
  });

  const commits = git(["rev-list", "--reverse", `${auditBase}..${head}`], {
    cwd,
  })
    .stdout.trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const unsigned = commits.flatMap((commit) => {
    const message = git(["log", "-1", "--format=%B", commit], { cwd }).stdout;
    if (hasDcoSignoff(message)) {
      return [];
    }
    const subject = git(["log", "-1", "--format=%s", commit], { cwd }).stdout;
    return [{ commit, subject: subject.trim() }];
  });
  return { auditBase, unsigned };
}

export function findUnsignedCommits(base, head, options = {}) {
  return auditDcoRange(base, head, options).unsigned;
}

function main(argv) {
  const useMergeBase = argv[0] === "--merge-base";
  const [base, head, ...extra] = useMergeBase ? argv.slice(1) : argv;
  if (!base || !head || extra.length > 0) {
    console.error(
      "Usage: node tools/check-dco-range.mjs [--merge-base] <base-sha> <head-sha>",
    );
    return 2;
  }

  try {
    const { auditBase, unsigned } = auditDcoRange(base, head, {
      useMergeBase,
    });
    for (const { commit, subject } of unsigned) {
      console.error(`Missing DCO sign-off: ${commit} ${subject}`);
    }
    if (unsigned.length > 0) {
      console.error(
        "\nEvery commit after the prospective baseline must include a Signed-off-by trailer. Use: git commit -s",
      );
      return 1;
    }
    console.log(`DCO verified for ${auditBase}..${head}`);
    return 0;
  } catch (error) {
    console.error(`DCO audit failed: ${error.message}`);
    return 2;
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  process.exitCode = main(process.argv.slice(2));
}
