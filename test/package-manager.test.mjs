// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectPackageManager,
  devInstallCommand,
  installCommand,
  isWorkspaceRoot,
  isYarnBerry,
  removeCommand,
  runScript,
} from "../scripts/lib/package-manager.mjs";

// detectPackageManager reads process.env.npm_config_user_agent, which `npm test`
// sets. Save/restore it around each test so the environment stays hermetic.
function setUserAgent(t, value) {
  const previous = process.env.npm_config_user_agent;
  if (value === undefined) {
    delete process.env.npm_config_user_agent;
  } else {
    process.env.npm_config_user_agent = value;
  }
  t.after(() => {
    if (previous === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = previous;
    }
  });
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-detect-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("detects the package manager from npm_config_user_agent", (t) => {
  setUserAgent(t, "pnpm/8.15.0 npm/? node/v22.11.0 linux x64");
  assert.equal(detectPackageManager(), "pnpm");
});

test("recognizes yarn, bun, and npm user agents", (t) => {
  setUserAgent(t, "yarn/1.22.19 npm/? node/v22.11.0");
  assert.equal(detectPackageManager(), "yarn");

  process.env.npm_config_user_agent = "bun/1.1.0 node/v22.11.0";
  assert.equal(detectPackageManager(), "bun");

  process.env.npm_config_user_agent = "npm/10.2.0 node/v22.11.0";
  assert.equal(detectPackageManager(), "npm");
});

test("falls back to the lockfile when no user agent is set", (t) => {
  setUserAgent(t, undefined);
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "");
  assert.equal(detectPackageManager(dir), "pnpm");
});

test("recognizes yarn and bun lockfiles", (t) => {
  setUserAgent(t, undefined);

  const yarnDir = tempDir(t);
  fs.writeFileSync(path.join(yarnDir, "yarn.lock"), "");
  assert.equal(detectPackageManager(yarnDir), "yarn");

  const bunDir = tempDir(t);
  fs.writeFileSync(path.join(bunDir, "bun.lockb"), "");
  assert.equal(detectPackageManager(bunDir), "bun");
});

test("prefers the user agent over a conflicting lockfile", (t) => {
  setUserAgent(t, "pnpm/8 node/v22.11.0");
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
  assert.equal(detectPackageManager(dir), "pnpm");
});

test("defaults to npm when nothing indicates a manager", (t) => {
  setUserAgent(t, undefined);
  const dir = tempDir(t);
  assert.equal(detectPackageManager(dir), "npm");
});

test("workspace-root detection covers package and pnpm declarations", (t) => {
  const arrayRoot = tempDir(t);
  fs.writeFileSync(
    path.join(arrayRoot, "package.json"),
    JSON.stringify({ workspaces: ["packages/*"] }),
  );
  assert.equal(isWorkspaceRoot(arrayRoot), true);

  const objectRoot = tempDir(t);
  fs.writeFileSync(
    path.join(objectRoot, "package.json"),
    JSON.stringify({ workspaces: { packages: ["packages/*"] } }),
  );
  assert.equal(isWorkspaceRoot(objectRoot), true);

  const pnpmRoot = tempDir(t);
  fs.writeFileSync(
    path.join(pnpmRoot, "pnpm-workspace.yaml"),
    "packages: []\n",
  );
  assert.equal(isWorkspaceRoot(pnpmRoot), true);

  const invalidRoot = tempDir(t);
  fs.writeFileSync(path.join(invalidRoot, "package.json"), "not json");
  assert.equal(isWorkspaceRoot(invalidRoot), false);
});

test("Yarn Berry detection covers the manager version and project config", (t) => {
  const dir = tempDir(t);
  setUserAgent(t, "yarn/4.17.0 npm/? node/v24.0.0");
  assert.equal(isYarnBerry(dir), true);

  process.env.npm_config_user_agent = "yarn/1.22.22 npm/? node/v24.0.0";
  assert.equal(isYarnBerry(dir), false);
  delete process.env.npm_config_user_agent;
  assert.equal(isYarnBerry(dir), false);
  fs.writeFileSync(path.join(dir, ".yarnrc.yml"), "nodeLinker: node-modules\n");
  assert.equal(isYarnBerry(dir), true);
});

test("runScript and installCommand format for the detected manager", (t) => {
  setUserAgent(t, "pnpm/8 node/v22.11.0");
  assert.equal(runScript("commit:fix"), "pnpm run commit:fix");
  assert.equal(installCommand(), "pnpm install");

  process.env.npm_config_user_agent = "npm/10 node/v22.11.0";
  assert.equal(runScript("fix:staged"), "npm run fix:staged");
});

test("devInstallCommand builds the dev-install form for each manager", (t) => {
  setUserAgent(t, "npm/10.2.0 node/v22.11.0");
  assert.equal(
    devInstallCommand(["eslint", "prettier"]),
    "npm install -D eslint@^9 prettier@^3",
  );

  process.env.npm_config_user_agent = "pnpm/8.15.0 node/v22.11.0";
  assert.equal(devInstallCommand(["eslint"]), "pnpm add -D eslint@^9");

  process.env.npm_config_user_agent = "yarn/1.22.19 node/v22.11.0";
  assert.equal(devInstallCommand(["prettier"]), "yarn add -D prettier@^3");

  process.env.npm_config_user_agent = "bun/1.1.0 node/v22.11.0";
  assert.equal(devInstallCommand(["eslint"]), "bun add --dev eslint@^9");

  process.env.npm_config_user_agent = "npm/10.2.0 node/v22.11.0";
  assert.equal(
    devInstallCommand(["@commitlint/cli"]),
    "npm install -D @commitlint/cli",
  );
});

test("removeCommand uses the detected package manager", (t) => {
  setUserAgent(t, "pnpm/8.15.0 node/v22.11.0");
  assert.equal(
    removeCommand(["commitment-issues"]),
    "pnpm remove commitment-issues",
  );

  process.env.npm_config_user_agent = "yarn/1.22.19 node/v22.11.0";
  assert.equal(removeCommand(["a", "b"]), "yarn remove a b");
});

test("workspace-root install and removal hints use required manager flags", (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ private: true, workspaces: ["packages/*"] })}\n`,
  );

  setUserAgent(t, "pnpm/10 node/v22.11.0");
  assert.equal(
    devInstallCommand(["eslint@^9", "prettier@^3"], dir),
    "pnpm add -D --workspace-root eslint@^9 prettier@^3",
  );
  assert.equal(
    removeCommand(["commitment-issues"], dir),
    "pnpm remove --workspace-root commitment-issues",
  );

  process.env.npm_config_user_agent = "yarn/1.22.22 node/v22.11.0";
  assert.equal(
    devInstallCommand(["eslint@^9", "prettier@^3"], dir),
    "yarn add -D --ignore-workspace-root-check eslint@^9 prettier@^3",
  );
  assert.equal(
    removeCommand(["commitment-issues"], dir),
    "yarn remove --ignore-workspace-root-check commitment-issues",
  );

  process.env.npm_config_user_agent = "yarn/4.17.0 node/v24.0.0";
  assert.equal(
    devInstallCommand(["eslint@^9", "prettier@^3"], dir),
    "yarn add -D eslint@^9 prettier@^3",
  );
  assert.equal(
    removeCommand(["commitment-issues"], dir),
    "yarn remove commitment-issues",
  );
});
