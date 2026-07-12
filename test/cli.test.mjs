// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  repoRoot,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";
import {
  compactTerminalBoxText,
  countTerminalBoxes,
  stripAnsi,
} from "./helpers/output.mjs";

function cli(tempDir, args, options = {}) {
  const { cwd = tempDir, ...runOptions } = options;
  return run(
    "node",
    [path.join(tempDir, "scripts", "cli.mjs"), ...args],
    cwd,
    runOptions,
  );
}

function sourceCli(cwd, args, options = {}) {
  return run(
    "node",
    [path.join(repoRoot, "scripts", "cli.mjs"), ...args],
    cwd,
    options,
  );
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snapshotWorktree(tempDir) {
  const entries = [];

  function visit(directory, prefix = "") {
    const children = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      const relativePath = prefix ? path.join(prefix, child.name) : child.name;
      if (relativePath === ".git") continue;

      const absolutePath = path.join(directory, child.name);
      if (child.isSymbolicLink()) {
        entries.push([relativePath, "symlink", fs.readlinkSync(absolutePath)]);
      } else if (child.isDirectory()) {
        entries.push([relativePath, "directory"]);
        visit(absolutePath, relativePath);
      } else {
        entries.push([
          relativePath,
          "file",
          fs.readFileSync(absolutePath).toString("base64"),
        ]);
      }
    }
  }

  visit(tempDir);
  return entries;
}

function snapshotRepositoryState(tempDir) {
  const hooksDir = path.join(tempDir, ".git", "hooks");
  const hooks = fs
    .readdirSync(hooksDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => [
      entry.name,
      entry.isFile()
        ? fs.readFileSync(path.join(hooksDir, entry.name)).toString("base64")
        : entry.isDirectory()
          ? "directory"
          : "other",
    ]);

  return {
    worktree: snapshotWorktree(tempDir),
    status: run(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      tempDir,
    ).stdout,
    config: fs.readFileSync(path.join(tempDir, ".git", "config"), "utf8"),
    head: fs.readFileSync(path.join(tempDir, ".git", "HEAD"), "utf8"),
    hooks,
  };
}

test("cli prints usage and exits 0 for --help", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);

  for (const command of [
    "init",
    "uninstall",
    "doctor",
    "commit-msg",
    "precommit",
    "prepush",
    "commit-fix",
    "fix-staged",
    "fix-staged-js",
  ]) {
    assert.match(result.stdout, new RegExp(`\\b${escapeRegExp(command)}\\b`));
  }

  const commandList = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("Commands:"));
  assert.ok(commandList);
  assert.doesNotMatch(commandList, /\bvows\b/);
  assert.match(result.stdout, /Some commitments come with vows\./);
});

test("cli prints the package version for --version and -v", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const expectedVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;

  for (const flag of ["--version", "-v"]) {
    const result = cli(tempDir, [flag]);
    assert.equal(result.status, 0);
    assert.equal(combinedOutput(result).trim(), expectedVersion);
  }
});

test("cli errors on an unknown command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["bogus"]);
  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /unknown command 'bogus'/);
  assert.doesNotMatch(combinedOutput(result), /Did you mean/);
});

test("cli suggests the closest command for a likely typo", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  for (const [typo, expected] of [
    ["docter", "doctor"],
    ["precommt", "precommit"],
    ["fix-stagged", "fix-staged"],
  ]) {
    const result = cli(tempDir, [typo]);
    assert.equal(result.status, 1);
    assert.match(
      combinedOutput(result),
      new RegExp(`Did you mean '${escapeRegExp(expected)}'\\?`),
    );
  }
});

test("cli bounds typo suggestions for accidentally pasted commands", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const pasted = "x".repeat(65);

  const result = cli(tempDir, [pasted]);

  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), new RegExp(pasted));
  assert.doesNotMatch(combinedOutput(result), /Did you mean/);
});

test("cli preserves shell-sensitive unknown command tokens", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  for (const token of [
    "has space",
    "quote'file",
    "semi;colon",
    "glob*value",
    String.raw`windows\\path`,
  ]) {
    const result = cli(tempDir, [token]);
    assert.equal(result.status, 1);
    assert.match(combinedOutput(result), new RegExp(escapeRegExp(token)));
  }
});

test("cli dispatches to init", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["init"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /Commitment Issues is set up/);
});

test("cli dispatches to uninstall", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["uninstall"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /Commitment Issues setup was removed/);
});

test("cli dispatches to doctor", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["doctor"]);
  assert.equal(result.status, 0);
  assert.match(
    combinedOutput(result),
    /Repaired the git hook wiring|Git hooks are healthy/,
  );
});

test("cli dispatches to precommit", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Nothing is staged in a fresh temp repo, so precommit is a clean no-op.
  const result = cli(tempDir, ["precommit"]);
  assert.equal(result.status, 0);
});

test("cli dispatches commit-msg and forwards the message file", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });
  const messageFile = path.join(tempDir, "message file.txt");
  writeFile(messageFile, "feat: literal path\n");

  const result = cli(tempDir, ["commit-msg", messageFile]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /project-local commitlint CLI/);
  assert.doesNotMatch(
    combinedOutput(result),
    /Unable to read the commit message/,
  );
});

test("cli dispatches to prepush", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, {
    blockPushOnTestFailure: true,
    hookOutput: "normal",
    protectedBranches: [],
  });

  const result = cli(tempDir, ["prepush"], {
    env: { ...process.env, COMMITMENT_ISSUES_ASSUME_TTY: "1" },
  });
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /No tests to run before push/);
});

test("cli dispatches to commit-fix", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["commit-fix"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /Latest commit already clean/);
});

test("cli dispatches to fix-staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["fix-staged"]);
  assert.equal(result.status, 0);
  assert.match(combinedOutput(result), /No staged files to fix/);
});

test("cli dispatches to fix-staged-js", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["fix-staged-js"]);
  assert.equal(result.status, 0);
  assert.equal(combinedOutput(result).trim(), "");
});

test("cli dispatches the deterministic, read-only vows Easter egg", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const env = { ...process.env, COLUMNS: "80", NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  const before = snapshotRepositoryState(tempDir);

  const first = cli(tempDir, ["vows"], { env });
  const second = cli(tempDir, ["vows"], { env });
  const json = cli(tempDir, ["vows", "--json"], { env });

  assert.equal(first.status, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(countTerminalBoxes(first.stdout), 1);
  for (const line of [
    "💍 The commitment-issues vows",
    "Warn before blocking.",
    "Fix only with consent.",
    "Keep your code local.",
    "Never rewrite what we cannot prove is safe.",
  ]) {
    assert.ok(first.stdout.includes(line));
  }
  assert.equal(json.status, 1);
  assert.equal(json.stdout, "");
  assert.match(json.stderr, /--json is only supported by/);
  assert.equal(countTerminalBoxes(json.stderr), 0);
  assert.deepEqual(snapshotRepositoryState(tempDir), before);
});

test("vows uses color when enabled and honors NO_COLOR", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const colorEnv = { ...process.env, COLUMNS: "80", FORCE_COLOR: "1" };
  delete colorEnv.NO_COLOR;
  const noColorEnv = { ...process.env, COLUMNS: "80", NO_COLOR: "1" };
  delete noColorEnv.FORCE_COLOR;

  const colored = cli(tempDir, ["vows"], { env: colorEnv });
  const plain = cli(tempDir, ["vows"], { env: noColorEnv });

  assert.equal(colored.status, 0);
  assert.notEqual(colored.stdout, stripAnsi(colored.stdout));
  assert.equal(plain.status, 0);
  assert.equal(plain.stdout, stripAnsi(plain.stdout));
});

test("vows remains readable in a narrow terminal", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const env = { ...process.env, COLUMNS: "24", NO_COLOR: "1" };
  delete env.FORCE_COLOR;

  const result = cli(tempDir, ["vows"], { env });
  const output = stripAnsi(result.stdout).trim();
  const compact = compactTerminalBoxText(output).replace(/\s/g, "");

  assert.equal(result.status, 0);
  assert.equal(countTerminalBoxes(output), 1);
  assert.ok(output.split(/\r?\n/).every((line) => line.length <= 24));
  for (const vow of [
    "Warn before blocking.",
    "Fix only with consent.",
    "Keep your code local.",
    "Never rewrite what we cannot prove is safe.",
  ]) {
    assert.ok(compact.includes(vow.replace(/\s/g, "")));
  }
});

test("cli forwards arguments to the subcommand", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  cli(tempDir, ["doctor"]); // establish healthy wiring
  const result = cli(tempDir, ["doctor", "--quiet"]);
  assert.equal(result.status, 0);
  // `--quiet` reached doctor: silent when already healthy.
  assert.equal(combinedOutput(result).trim(), "");
});

test("cli runs from a project subdirectory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const nested = path.join(tempDir, "nested", "deeper");
  fs.mkdirSync(nested, { recursive: true });

  const result = cli(tempDir, ["precommit"], { cwd: nested });
  assert.equal(result.status, 0);
});

test("cli help works outside a git repo and node project", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-cli-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const result = sourceCli(tempDir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);
});

test("cli reports subcommand errors outside a node project", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-cli-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const result = sourceCli(tempDir, ["doctor"]);
  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /No package.json found/);
});

test("cli prints usage to stderr and exits 1 when given no command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commitment-issues <command>/);
});

test("cli treats -h like --help", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["-h"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);
});
