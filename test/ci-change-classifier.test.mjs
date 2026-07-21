// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run as runCommand } from "./helpers/temp-repo.mjs";
import {
  classifyChangeRecords,
  classifyCiChange,
  classifyRepoPath,
  collectPullRequestChanges,
  formatGithubOutputs,
  parseNameStatusRecords,
} from "../tools/classify-ci-changes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "tools", "classify-ci-changes.mjs");

function git(cwd, args) {
  const result = runCommand("git", args, cwd);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commitFile(cwd, file, content, subject) {
  const target = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  git(cwd, ["add", "--", file]);
  git(cwd, ["commit", "-m", subject]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function repositoryFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ci-classifier-"));
  git(cwd, ["init"]);
  git(cwd, ["config", "user.name", "Test Maintainer"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  git(cwd, ["config", "core.hooksPath", ".git/no-test-hooks"]);
  const branch = git(cwd, ["branch", "--show-current"]);
  const base = commitFile(cwd, "README.md", "base\n", "base");
  git(cwd, ["switch", "-c", "feature"]);
  const head = commitFile(cwd, "docs/guide.md", "guide\n", "docs");
  git(cwd, ["switch", branch]);
  const advancedBase = commitFile(cwd, "main.txt", "advanced\n", "advance");
  return { cwd, base, head, advancedBase };
}

function records(...entries) {
  return entries.map(([status, ...paths]) => ({ status, paths }));
}

test("the base-commit classifier is self-contained", () => {
  const source = fs.readFileSync(script, "utf8");
  const specifiers = [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu),
    ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gmu),
  ].map((match) => match[1]);

  assert.ok(specifiers.length > 0);
  assert.deepEqual(
    specifiers.filter((specifier) => !specifier.startsWith("node:")),
    [],
    "the workflow copies one trusted blob, so it cannot have relative imports",
  );
});

test("classifies every supported repository change category", () => {
  const cases = new Map([
    ["scripts/cli.mjs", "runtime-cli-hooks"],
    ["scripts/lib/hooks.mjs", "runtime-cli-hooks"],
    ["package.json", "package-manager"],
    ["scripts/run-lifecycle-test.mjs", "package-manager"],
    ["tools/run-shell-compat-test.mjs", "package-manager"],
    ["test/fixtures/lifecycle-migrations.json", "tests-fixtures"],
    [".github/workflows/ci.yml", "workflow-release"],
    [".github/CODEOWNERS", "workflow-release"],
    ["tools/release-recovery.mjs", "workflow-release"],
    ["README.md", "documentation-metadata"],
    ["docs/guide.md", "documentation-metadata"],
    ["docs/json-output.schema.json", "documentation-metadata"],
    [".github/ISSUE_TEMPLATE/bug_report.yml", "documentation-metadata"],
    [".github/skills/github-governance/SKILL.md", "documentation-metadata"],
    [".vscode/tasks.json", "unknown"],
    [".vscode/commitment-issues.code-workspace", "unknown"],
    ["assets/demo.gif", "demo-assets"],
    ["promo/demo.tape", "demo-assets"],
    ["tools/gen-message-state-svgs.mjs", "demo-assets"],
    ["eslint.config.js", "unknown"],
    ["new-top-level.txt", "unknown"],
  ]);

  for (const [file, expected] of cases) {
    assert.equal(classifyRepoPath(file), expected, file);
  }
});

test("the documentation allowlist is explicit and path-preserving", () => {
  for (const file of [
    "ADOPTION.md",
    "AGENTS.md",
    "CHANGELOG.md",
    "DCO",
    "GOVERNANCE.md",
    "LICENSE",
    "ROADMAP.md",
    ".github/FUNDING.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/SECURITY.md",
    ".github/copilot-instructions.md",
    "promo/launch.md",
  ]) {
    assert.equal(classifyRepoPath(file), "documentation-metadata", file);
  }
  for (const file of [
    "docs/new.json",
    ".github/ISSUE_TEMPLATE/run.mjs",
    ".github/skills/new/helper.mjs",
    ".vscode/run.mjs",
    "docs\\guide.md",
    "./docs/guide.md",
    "docs/../scripts/cli.mjs",
    "docs//guide.md",
    "/docs/guide.md",
    "docs/guide.md/",
    "docs/invalid-\uFFFD.md",
  ]) {
    assert.equal(classifyRepoPath(file), "unknown", file);
  }
});

test("parses NUL-delimited changes without interpreting unusual filenames", () => {
  const oddPaths = [
    "docs/space name.md",
    "docs/tab\tname.md",
    "docs/line\nname.md",
    "docs/-leading.md",
    "docs/café.md",
  ];
  const raw = oddPaths.map((file) => `M\0${file}\0`).join("");

  assert.deepEqual(
    parseNameStatusRecords(raw),
    oddPaths.map((file) => ({ status: "M", paths: [file] })),
  );
  assert.equal(
    classifyChangeRecords(parseNameStatusRecords(raw)).route,
    "docs",
  );
});

test("retains both rename and copy paths", () => {
  assert.deepEqual(
    parseNameStatusRecords(
      "R100\0docs/old.md\0docs/new.md\0C075\0docs/a.md\0docs/b.md\0",
    ),
    [
      { status: "R100", paths: ["docs/old.md", "docs/new.md"] },
      { status: "C075", paths: ["docs/a.md", "docs/b.md"] },
    ],
  );
});

test("rejects malformed name-status data", () => {
  for (const raw of [
    "M\0docs/a.md",
    "M\0",
    "M\0\0",
    "R100\0docs/a.md\0",
    "R101\0docs/a.md\0docs/b.md\0",
    "Q\0docs/a.md\0",
    "m\0docs/a.md\0",
  ]) {
    assert.throws(() => parseNameStatusRecords(raw), /name-status/u, raw);
  }
  assert.throws(
    () => parseNameStatusRecords(Buffer.from("M\0docs/a.md\0")),
    /must be a string/u,
  );
});

test("routes only pure added or modified documentation to the small graph", () => {
  for (const change of [
    records(["A", "docs/a.md"], ["M", "README.md"]),
    records(["M", "docs/old.md"], ["M", "docs/new.md"]),
  ]) {
    assert.deepEqual(classifyChangeRecords(change), {
      route: "docs",
      fullGraph: false,
      docsOnly: true,
      categories: ["documentation-metadata"],
      reason: "docs-only",
    });
  }

  const fullCases = [
    records(["M", "scripts/cli.mjs"]),
    records(["D", "scripts/cli.mjs"]),
    records(["M", "package.json"]),
    records(["M", "test/cli.test.mjs"]),
    records(["M", ".github/workflows/ci.yml"]),
    records(["M", "assets/demo.gif"]),
    records(["D", "ROADMAP.md"]),
    records(["R100", "docs/old.md", "docs/new.md"]),
    records(["C75", "README.md", "docs/readme.md"]),
    records(["M", "docs/a.md"], ["M", "package.json"]),
    records(["R100", "docs/a.md", "scripts/cli.mjs"]),
    records(["M", "unknown/new.file"]),
  ];
  for (const change of fullCases) {
    assert.equal(classifyChangeRecords(change).route, "full");
  }
  assert.equal(classifyChangeRecords([]).reason, "empty-diff");
});

test("deletions, renames, and copies always select the full graph", () => {
  for (const change of [
    records(["D", "docs/old.md"]),
    records(["R100", "docs/old.md", "docs/new.md"]),
    records(["C75", "README.md", "docs/readme.md"]),
    records(["D", "scripts/cli.mjs"]),
  ]) {
    const result = classifyChangeRecords(change);
    assert.equal(result.route, "full");
    assert.equal(result.reason, "structural-change");
  }
});

test("unsupported Git statuses force the full graph", () => {
  for (const status of ["T", "U", "X", "B"]) {
    const result = classifyChangeRecords(records([status, "docs/a.md"]));
    assert.equal(result.route, "full");
    assert.equal(result.reason, "unsupported-status");
    assert.deepEqual(result.categories, ["documentation-metadata", "unknown"]);
  }
});

test("record arity and similarity scores fail closed", () => {
  for (const change of [
    records(["M", "docs/a.md", "docs/b.md"]),
    records(["R100", "docs/a.md"]),
    records(["R101", "docs/a.md", "docs/b.md"]),
  ]) {
    const result = classifyChangeRecords(change);
    assert.equal(result.route, "full");
    assert.equal(result.reason, "malformed-diff");
  }
});

test("large diffs are classified locally without a files-API truncation", () => {
  const changes = Array.from({ length: 20_000 }, (_, index) => [
    "M",
    `docs/guide-${index}.md`,
  ]);
  assert.equal(classifyChangeRecords(records(...changes)).route, "docs");
  changes.push(["M", "unknown-at-the-end"]);
  const result = classifyChangeRecords(records(...changes));
  assert.equal(result.route, "full");
  assert.equal(result.reason, "unknown-path");
});

test("uses the true merge base when the destination branch advances", (t) => {
  const repo = repositoryFixture();
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  const result = classifyCiChange({
    eventName: "pull_request",
    base: repo.advancedBase,
    head: repo.head,
    cwd: repo.cwd,
  });
  assert.equal(result.route, "docs");
  assert.equal(result.reason, "docs-only");
});

test("Git inspection failures degrade to the full graph", () => {
  const sha = "a".repeat(40);
  const commandResult = (stdout = "", status = 0) => ({
    stdout,
    stderr: "",
    status,
    signal: null,
  });
  const cases = [
    {
      reason: "history-check-failed",
      runGit: () => commandResult("", 1),
    },
    {
      reason: "shallow-history",
      runGit: () => commandResult("true\n"),
    },
    {
      reason: "missing-commit",
      runGit: (args) =>
        args[0] === "rev-parse"
          ? commandResult("false\n")
          : commandResult("", 1),
    },
    {
      reason: "merge-base-unavailable",
      runGit: (args) => {
        if (args[0] === "rev-parse") return commandResult("false\n");
        if (args[0] === "cat-file") return commandResult();
        return commandResult("", 1);
      },
    },
    {
      reason: "diff-failed",
      runGit: (args) => {
        if (args[0] === "rev-parse") return commandResult("false\n");
        if (args[0] === "cat-file") return commandResult();
        if (args[0] === "merge-base") return commandResult(`${sha}\n`);
        return { ...commandResult("", 1), error: new Error("ENOBUFS") };
      },
    },
    {
      reason: "malformed-diff",
      runGit: (args) => {
        if (args[0] === "rev-parse") return commandResult("false\n");
        if (args[0] === "cat-file") return commandResult();
        if (args[0] === "merge-base") return commandResult(`${sha}\n`);
        return commandResult("M\0docs/a.md");
      },
    },
  ];

  for (const entry of cases) {
    const result = classifyCiChange({
      eventName: "pull_request",
      base: sha,
      head: sha,
      runGit: entry.runGit,
    });
    assert.equal(result.route, "full", entry.reason);
    assert.equal(result.reason, entry.reason);
  }
  assert.equal(
    classifyCiChange({
      eventName: "pull_request",
      base: "short",
      head: sha,
    }).reason,
    "invalid-commit",
  );
});

test("Git inspection uses the complete literal merge-base diff", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const mergeBase = "c".repeat(40);
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args[0] === "rev-parse") {
      return { status: 0, signal: null, stdout: "false\n", stderr: "" };
    }
    if (args[0] === "cat-file") {
      return { status: 0, signal: null, stdout: "", stderr: "" };
    }
    if (args[0] === "merge-base") {
      return { status: 0, signal: null, stdout: `${mergeBase}\n`, stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: "M\0docs/guide.md\0",
      stderr: "",
    };
  };

  const result = collectPullRequestChanges({ base, head, runGit });
  assert.deepEqual(result.records, [{ status: "M", paths: ["docs/guide.md"] }]);
  assert.deepEqual(calls, [
    ["rev-parse", "--is-shallow-repository"],
    ["cat-file", "-e", `${base}^{commit}`],
    ["cat-file", "-e", `${head}^{commit}`],
    ["merge-base", base, head],
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--name-status",
      "-z",
      "--find-renames",
      mergeBase,
      head,
      "--",
    ],
  ]);
});

test("push and manual events always take the full graph without Git", () => {
  for (const eventName of ["push", "workflow_dispatch", undefined]) {
    const result = classifyCiChange({
      eventName,
      runGit: () => {
        throw new Error("Git must not run");
      },
    });
    assert.equal(result.route, "full");
    assert.equal(result.reason, "non-pull-request");
  }
});

test("fixed workflow outputs contain decisions but never changed paths", () => {
  const output = formatGithubOutputs({
    route: "docs",
    fullGraph: false,
    docsOnly: true,
    categories: ["documentation-metadata"],
    reason: "docs-only",
  });
  assert.equal(
    output,
    "route=docs\nfull_graph=false\ndocs_only=true\ncategories=documentation-metadata\nreason=docs-only",
  );
  assert.doesNotMatch(output, /README|docs\//u);
});

test("CLI writes a docs decision for a fork-shaped divergent range", (t) => {
  const repo = repositoryFixture();
  const output = path.join(repo.cwd, "github-output.txt");
  t.after(() => fs.rmSync(repo.cwd, { recursive: true, force: true }));

  const result = runCommand(process.execPath, [script], repo.cwd, {
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request",
      CI_BASE_SHA: repo.advancedBase,
      CI_HEAD_SHA: repo.head,
      GITHUB_OUTPUT: output,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CI route: docs \(docs-only/u);
  assert.equal(
    fs.readFileSync(output, "utf8"),
    "route=docs\nfull_graph=false\ndocs_only=true\ncategories=documentation-metadata\nreason=docs-only\n",
  );
});

test("unexpected Git exceptions escape so the job has no trusted outputs", () => {
  const sha = "a".repeat(40);
  assert.throws(
    () =>
      collectPullRequestChanges({
        base: sha,
        head: sha,
        runGit: () => {
          throw new Error("unexpected classifier crash");
        },
      }),
    /unexpected classifier crash/u,
  );
});
