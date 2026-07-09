#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crossSpawn from "cross-spawn";

const root = process.cwd();

// Which package manager to exercise end to end. Defaults to npm; pass "pnpm" as
// the first arg (the pnpm-smoke CI job does) to prove the tool installs, wires
// its hooks, and runs under pnpm's linked node_modules layout.
const packageManager = process.argv[2] || "npm";
const SUPPORTED_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
if (!SUPPORTED_MANAGERS.has(packageManager)) {
  throw new Error(
    `Unsupported package manager "${packageManager}" (expected: ${[
      ...SUPPORTED_MANAGERS,
    ].join(", ")}).`,
  );
}

const DEV_DEPS = ["eslint", "prettier", "@eslint/js", "globals"];
const EXPECTED_SCRIPTS = {
  prepare: "commitment-issues doctor --quiet",
  "commit:fix": "commitment-issues commit-fix",
  "fix:staged": "commitment-issues fix-staged",
  "test:precommit": "commitment-issues precommit",
  doctor: "commitment-issues doctor",
};
const HOOK_SUBCOMMANDS = {
  "pre-commit": "precommit",
  "pre-push": "prepush",
};

// Install the packed tarball plus the peer tools using the selected manager.
function installDevDeps(tarball) {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["add", "-D", tarball, ...DEV_DEPS]];
    case "yarn":
      return ["yarn", ["add", "-D", tarball, ...DEV_DEPS]];
    case "bun":
      return ["bun", ["add", "--dev", tarball, ...DEV_DEPS]];
    default:
      return ["npm", ["install", "-D", tarball, ...DEV_DEPS]];
  }
}

// Run the installed commitment-issues bin using the selected manager. npm and
// yarn both expose it on node_modules/.bin, so npx --no-install runs it without
// touching the network; pnpm and bun use their own runners.
function execBin(args) {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["exec", "commitment-issues", ...args]];
    case "bun":
      return ["bunx", ["commitment-issues", ...args]];
    default:
      return ["npx", ["--no-install", "commitment-issues", ...args]];
  }
}

function run(command, args, cwd) {
  const env = { ...process.env };
  // CI disables hooks for the outer repo; the smoke repo's commits and pushes
  // must actually exercise them, so strip the skip vars for subprocesses.
  delete env.HUSKY;
  delete env.COMMITMENT_ISSUES;

  const result = crossSpawn.sync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}`,
    );
  }
}

function assertSmoke(condition, message) {
  if (!condition) {
    throw new Error(`[lifecycle smoke] ${message}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertFileContains(filePath, expected) {
  assertSmoke(fs.existsSync(filePath), `${filePath} should exist`);
  const content = fs.readFileSync(filePath, "utf8");
  assertSmoke(
    content.includes(expected),
    `${filePath} should include ${JSON.stringify(expected)}`,
  );
}

function assertHookWired(repoDir, name) {
  const hookPath = path.join(repoDir, ".git", "hooks", name);
  const subcommand = HOOK_SUBCOMMANDS[name];
  assertFileContains(hookPath, `commitment-issues ${subcommand}`);
  assertSmoke(
    Boolean(fs.statSync(hookPath).mode & 0o111),
    `${hookPath} should be executable`,
  );
}

function assertPackageJsonConfigured(repoDir) {
  const pkg = readJson(path.join(repoDir, "package.json"));

  for (const [name, value] of Object.entries(EXPECTED_SCRIPTS)) {
    assertSmoke(
      pkg.scripts?.[name] === value,
      `package.json script ${name} should be ${JSON.stringify(value)}`,
    );
  }

  assertSmoke(
    pkg.precommitChecks?.advisePushTests === true,
    "package.json should enable advisory pre-push tests by default",
  );
}

function assertGitignoreConfigured(repoDir) {
  const gitignore = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf8");
  for (const entry of [".eslintcache", ".prettiercache", "node_modules/"]) {
    assertSmoke(
      gitignore.split("\n").includes(entry),
      `.gitignore should include ${entry}`,
    );
  }
}

function assertManagerLockfile(repoDir) {
  const expectedLockfiles = {
    npm: ["package-lock.json"],
    pnpm: ["pnpm-lock.yaml"],
    yarn: ["yarn.lock"],
    bun: ["bun.lock", "bun.lockb"],
  };
  const candidates = expectedLockfiles[packageManager];
  assertSmoke(
    candidates.some((file) => fs.existsSync(path.join(repoDir, file))),
    `${packageManager} should create one of: ${candidates.join(", ")}`,
  );
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-lifecycle-"),
);
const packDir = path.join(tempRoot, "pack");
const smokeDir = path.join(tempRoot, "repo");
const remoteDir = path.join(tempRoot, "remote.git");

fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(smokeDir, { recursive: true });

try {
  console.log(`\n[lifecycle smoke] package manager: ${packageManager}\n`);
  run("npm", ["pack", "--pack-destination", packDir], root);
  const tarball = fs
    .readdirSync(packDir)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(packDir, file))[0];

  if (!tarball) {
    throw new Error("npm pack did not produce a tarball");
  }

  run("git", ["init"], smokeDir);
  run("git", ["config", "user.name", "commitment-issues-ci"], smokeDir);
  run(
    "git",
    ["config", "user.email", "commitment-issues-ci@example.com"],
    smokeDir,
  );

  writeFile(
    path.join(smokeDir, "package.json"),
    `${JSON.stringify(
      {
        name: "commitment-issues-lifecycle-smoke",
        version: "1.0.0",
        type: "module",
        private: true,
      },
      null,
      2,
    )}\n`,
  );

  const [installCommand, installArgs] = installDevDeps(tarball);
  run(installCommand, installArgs, smokeDir);
  assertManagerLockfile(smokeDir);

  const [helpCommand, helpArgs] = execBin(["--help"]);
  run(helpCommand, helpArgs, smokeDir);
  const [initCommand, initArgs] = execBin(["init"]);
  run(initCommand, initArgs, smokeDir);

  assertPackageJsonConfigured(smokeDir);
  assertGitignoreConfigured(smokeDir);
  assertHookWired(smokeDir, "pre-commit");
  assertHookWired(smokeDir, "pre-push");

  writeFile(
    path.join(smokeDir, "eslint.config.js"),
    [
      'import js from "@eslint/js";',
      'import globals from "globals";',
      "",
      "export default [",
      "  js.configs.recommended,",
      "  {",
      "    languageOptions: {",
      "      globals: globals.node,",
      "    },",
      "  },",
      "];",
      "",
    ].join("\n"),
  );

  writeFile(
    path.join(smokeDir, "src", "widget.mjs"),
    "export const widget = () => 1;\n",
  );
  writeFile(
    path.join(smokeDir, "test", "widget.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { widget } from "../src/widget.mjs";',
      "",
      'test("widget", () => assert.equal(widget(), 1));',
      "",
    ].join("\n"),
  );

  run("git", ["add", "-A"], smokeDir);
  run("git", ["commit", "-m", "first checked commit"], smokeDir);

  run("git", ["init", "--bare", remoteDir], tempRoot);
  run("git", ["branch", "-M", "main"], smokeDir);
  run("git", ["remote", "add", "origin", remoteDir], smokeDir);
  run("git", ["push", "-u", "origin", "main"], smokeDir);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
