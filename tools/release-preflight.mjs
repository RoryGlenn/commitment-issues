// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "commitment-issues";
const REPOSITORY = "RoryGlenn/commitment-issues";
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function normalizeReleaseVersion(input) {
  const version = String(input ?? "").replace(/^v/, "");
  if (!SEMVER.test(version)) {
    throw new Error(
      `Expected an exact semantic version, received '${input ?? ""}'.`,
    );
  }
  return version;
}

function defaultRunGit(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

async function defaultRequest(url) {
  const parsed = new URL(url);
  const headers = { "User-Agent": "commitment-issues-release-preflight" };
  if (parsed.hostname === "api.github.com") {
    headers.Accept = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
  }

  const response = await fetch(url, { headers });
  if (response.body) await response.body.cancel();
  return { status: response.status };
}

function gitFailure(label, result) {
  const detail =
    result.error?.message || result.stderr?.trim() || "unknown error";
  return new Error(`${label} failed: ${detail}`);
}

export async function checkReleaseAvailability(
  input,
  { runGit = defaultRunGit, request = defaultRequest } = {},
) {
  const version = normalizeReleaseVersion(input);
  const tag = `v${version}`;
  const collisions = [];

  const localTag = runGit([
    "show-ref",
    "--verify",
    "--quiet",
    `refs/tags/${tag}`,
  ]);
  if (localTag.error || ![0, 1].includes(localTag.status)) {
    throw gitFailure("Local tag check", localTag);
  }
  if (localTag.status === 0) collisions.push(`local Git tag ${tag}`);

  const remoteTag = runGit([
    "ls-remote",
    "--tags",
    "--refs",
    "origin",
    `refs/tags/${tag}`,
  ]);
  if (remoteTag.error || remoteTag.status !== 0) {
    throw gitFailure("Remote tag check", remoteTag);
  }
  if (remoteTag.stdout.trim()) collisions.push(`remote Git tag ${tag}`);

  const checks = [
    {
      label: `GitHub Release ${tag}`,
      url: `https://api.github.com/repos/${REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`,
    },
    {
      label: `npm ${PACKAGE_NAME}@${version}`,
      url: `https://registry.npmjs.org/${PACKAGE_NAME}/${encodeURIComponent(version)}`,
    },
  ];

  for (const check of checks) {
    const response = await request(check.url);
    if (response.status === 200) {
      collisions.push(check.label);
    } else if (response.status !== 404) {
      throw new Error(
        `${check.label} check failed with HTTP ${response.status}.`,
      );
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `Release ${tag} is not available:\n${collisions.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  return { version, tag };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkReleaseAvailability(process.argv[2]);
    console.log(
      `${result.tag} is available locally, on origin, on GitHub Releases, and on npm.`,
    );
  } catch (error) {
    console.error(`release preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
