#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu;
const SIMPLE_STATUS = /^(?:A|M|D|T|U|X|B)$/u;
const SCORED_STATUS = /^(R|C)(\d{1,3})$/u;
const MAX_DIFF_BYTES = 64 * 1024 * 1024;

const DOCUMENTATION_FILES = new Set([
  "ADOPTION.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "DCO",
  "GOVERNANCE.md",
  "LICENSE",
  "README.md",
  "ROADMAP.md",
  ".github/CODE_OF_CONDUCT.md",
  ".github/CONTRIBUTING.md",
  ".github/FUNDING.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/SECURITY.md",
  ".github/SUPPORT.md",
  ".github/copilot-instructions.md",
  "docs/json-output.schema.json",
  "promo/launch.md",
]);

const PACKAGE_MANAGER_FILES = new Set([
  ".npmrc",
  ".yarnrc.yml",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "scripts/ci-lifecycle-smoke.mjs",
  "scripts/lib/lifecycle-managers.mjs",
  "scripts/run-lifecycle-test.mjs",
  "tools/run-migration-lifecycle-test.mjs",
  "tools/run-prebuilt-lifecycle-test.mjs",
  "tools/run-shell-compat-test.mjs",
]);

const RELEASE_TOOLS = new Set([
  "tools/release-preflight.mjs",
  "tools/release-recovery.mjs",
  "tools/validate-release-metadata.mjs",
  "tools/verify-release-mainline.mjs",
]);

const DEMO_TOOLS = new Set([
  "tools/compare-demo-gifs.mjs",
  "tools/gen-message-state-svgs.mjs",
  "tools/show-message-states.mjs",
]);

const CATEGORY_ORDER = [
  "runtime-cli-hooks",
  "package-manager",
  "tests-fixtures",
  "workflow-release",
  "documentation-metadata",
  "demo-assets",
  "unknown",
];

function fullResult(reason, categories = ["unknown"]) {
  return {
    route: "full",
    fullGraph: true,
    docsOnly: false,
    categories: [...new Set(categories)].sort(
      (left, right) =>
        CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right),
    ),
    reason,
  };
}

function hasCanonicalRepoPath(file) {
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    file.includes("\0") ||
    file.includes("\\") ||
    file.includes("\uFFFD") ||
    file.startsWith("/") ||
    file.endsWith("/")
  ) {
    return false;
  }
  const segments = file.split("/");
  return !segments.some(
    (segment) => segment === "" || segment === "." || segment === "..",
  );
}

export function classifyRepoPath(file) {
  if (!hasCanonicalRepoPath(file)) return "unknown";

  if (
    file.startsWith(".github/workflows/") ||
    file.startsWith(".github/actions/") ||
    file === ".github/CODEOWNERS" ||
    file === ".github/dependabot.yml" ||
    file === ".github/release-history.json" ||
    RELEASE_TOOLS.has(file)
  ) {
    return "workflow-release";
  }

  if (file === "test" || file.startsWith("test/")) {
    return "tests-fixtures";
  }

  if (PACKAGE_MANAGER_FILES.has(file)) {
    return "package-manager";
  }

  if (file === "scripts" || file.startsWith("scripts/")) {
    return "runtime-cli-hooks";
  }

  if (
    file === "assets" ||
    file.startsWith("assets/") ||
    file === "promo/demo.tape" ||
    DEMO_TOOLS.has(file)
  ) {
    return "demo-assets";
  }

  if (
    DOCUMENTATION_FILES.has(file) ||
    (file.startsWith("docs/") && file.endsWith(".md")) ||
    /^\.github\/ISSUE_TEMPLATE\/[^/]+\.ya?ml$/u.test(file) ||
    /^\.github\/skills\/[^/]+\/SKILL\.md$/u.test(file)
  ) {
    return "documentation-metadata";
  }

  return "unknown";
}

/**
 * Parse literal NUL-delimited `git diff --name-status -z` output. Rename and
 * copy records retain both path fields; no path is split on whitespace.
 */
export function parseNameStatusRecords(output) {
  if (typeof output !== "string") {
    throw new TypeError("name-status output must be a string");
  }
  if (output === "") return [];
  if (!output.endsWith("\0")) {
    throw new Error("name-status output is not NUL-terminated");
  }

  const fields = output.slice(0, -1).split("\0");
  const records = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (
      !status ||
      (!SIMPLE_STATUS.test(status) && !SCORED_STATUS.test(status))
    ) {
      throw new Error("name-status output contains an invalid status");
    }

    const firstPath = fields[index++];
    if (firstPath === undefined || firstPath.length === 0) {
      throw new Error("name-status output contains an empty path");
    }

    const scored = status.match(SCORED_STATUS);
    if (scored && Number(scored[2]) > 100) {
      throw new Error(
        "name-status output contains an invalid similarity score",
      );
    }
    if (scored) {
      const secondPath = fields[index++];
      if (secondPath === undefined || secondPath.length === 0) {
        throw new Error(
          "name-status rename or copy is missing its second path",
        );
      }
      records.push({ status, paths: [firstPath, secondPath] });
    } else {
      records.push({ status, paths: [firstPath] });
    }
  }
  return records;
}

export function classifyChangeRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return fullResult("empty-diff");
  }

  const categories = new Set();
  let unsupportedStatus = false;
  let structuralChange = false;
  for (const record of records) {
    if (
      !record ||
      typeof record.status !== "string" ||
      !Array.isArray(record.paths)
    ) {
      return fullResult("malformed-diff");
    }

    const scored = record.status.match(SCORED_STATUS);
    const expectedPaths = scored ? 2 : 1;
    if (
      record.paths.length !== expectedPaths ||
      (scored && Number(scored[2]) > 100)
    ) {
      return fullResult("malformed-diff");
    }
    if (!/^(?:A|M|D|R\d{1,3}|C\d{1,3})$/u.test(record.status)) {
      unsupportedStatus = true;
    }
    if (/^(?:D|R\d{1,3}|C\d{1,3})$/u.test(record.status)) {
      structuralChange = true;
    }
    for (const file of record.paths) {
      categories.add(classifyRepoPath(file));
    }
  }

  if (unsupportedStatus) {
    categories.add("unknown");
    return fullResult("unsupported-status", [...categories]);
  }
  if (structuralChange) {
    return fullResult("structural-change", [...categories]);
  }
  if (categories.has("unknown")) {
    return fullResult("unknown-path", [...categories]);
  }
  if (categories.size === 1 && categories.has("documentation-metadata")) {
    return {
      route: "docs",
      fullGraph: false,
      docsOnly: true,
      categories: ["documentation-metadata"],
      reason: "docs-only",
    };
  }
  return fullResult("full-category", [...categories]);
}

function defaultRunGit(args, { cwd }) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_DIFF_BYTES,
  });
}

function gitSucceeded(result) {
  return !result?.error && result?.status === 0 && result?.signal == null;
}

function commitExists(commit, options) {
  const result = options.runGit(
    ["cat-file", "-e", `${commit}^{commit}`],
    options,
  );
  return gitSucceeded(result);
}

export function collectPullRequestChanges({
  base,
  head,
  cwd = process.cwd(),
  runGit = defaultRunGit,
}) {
  if (!COMMIT_SHA.test(base ?? "") || !COMMIT_SHA.test(head ?? "")) {
    return { result: fullResult("invalid-commit") };
  }

  const options = { cwd, runGit };
  const shallow = runGit(["rev-parse", "--is-shallow-repository"], options);
  if (!gitSucceeded(shallow)) {
    return { result: fullResult("history-check-failed") };
  }
  if (shallow.stdout.trim() !== "false") {
    return { result: fullResult("shallow-history") };
  }
  if (!commitExists(base, options) || !commitExists(head, options)) {
    return { result: fullResult("missing-commit") };
  }

  const mergeBase = runGit(["merge-base", base, head], options);
  const commonAncestor = mergeBase.stdout?.trim().split(/\r?\n/u, 1)[0] ?? "";
  if (!gitSucceeded(mergeBase) || !COMMIT_SHA.test(commonAncestor)) {
    return { result: fullResult("merge-base-unavailable") };
  }

  const diff = runGit(
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--name-status",
      "-z",
      "--find-renames",
      commonAncestor,
      head,
      "--",
    ],
    options,
  );
  if (!gitSucceeded(diff)) {
    return { result: fullResult("diff-failed") };
  }

  try {
    return { records: parseNameStatusRecords(diff.stdout) };
  } catch {
    return { result: fullResult("malformed-diff") };
  }
}

export function classifyCiChange({
  eventName,
  base,
  head,
  cwd = process.cwd(),
  runGit = defaultRunGit,
}) {
  if (eventName !== "pull_request") {
    return fullResult("non-pull-request");
  }
  const collected = collectPullRequestChanges({ base, head, cwd, runGit });
  return collected.result ?? classifyChangeRecords(collected.records);
}

export function formatGithubOutputs(result) {
  return [
    `route=${result.route}`,
    `full_graph=${String(result.fullGraph)}`,
    `docs_only=${String(result.docsOnly)}`,
    `categories=${result.categories.join(",")}`,
    `reason=${result.reason}`,
  ].join("\n");
}

export function main(env = process.env) {
  const result = classifyCiChange({
    eventName: env.GITHUB_EVENT_NAME,
    base: env.CI_BASE_SHA,
    head: env.CI_HEAD_SHA,
  });
  const outputs = formatGithubOutputs(result);
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, `${outputs}\n`, "utf8");
  }
  console.log(
    `CI route: ${result.route} (${result.reason}; ${result.categories.join(", ")}).`,
  );
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`CI change classification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
