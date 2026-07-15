#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";

const mainlineRef = "refs/remotes/origin/main";
const tagName = process.env.GITHUB_REF_NAME || "the release tag";

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(`Unable to run Git: ${result.error.message}`);
  }
  return result;
}

function resolveCommit(ref, description) {
  const result = runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
  if (result.status !== 0) {
    throw new Error(`Cannot resolve ${description}; refusing to publish`);
  }
  return result.stdout.trim();
}

try {
  const releaseCommit = resolveCommit("HEAD", "the release tag to a commit");
  const mainCommit = resolveCommit(
    mainlineRef,
    "the freshly fetched origin/main",
  );
  const ancestry = runGit([
    "merge-base",
    "--is-ancestor",
    releaseCommit,
    mainCommit,
  ]);

  if (ancestry.status === 1) {
    throw new Error(
      `Tag ${tagName} points to ${releaseCommit}, which is not reachable from origin/main (${mainCommit}). Merge through the normal PR path and create a new version tag; never move or reuse this tag.`,
    );
  }
  if (ancestry.status !== 0) {
    throw new Error(
      `Unable to compare the release commit with origin/main; refusing to publish${ancestry.stderr.trim() ? `: ${ancestry.stderr.trim()}` : ""}`,
    );
  }

  console.log(
    `Release commit ${releaseCommit} belongs to reviewed origin/main history.`,
  );
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
}
