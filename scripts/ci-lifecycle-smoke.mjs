#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crossSpawn from "cross-spawn";

const root = process.cwd();

// Which package manager to exercise end to end. Defaults to npm; pass "pnpm" as
// the first arg (the pnpm-smoke CI job does) to prove the tool installs, wires
// its hooks, and runs under pnpm's linked node_modules layout.
const packageManager = process.argv[2] || "npm";
const SUPPORTED_MANAGERS = new Set(["npm", "pnpm"]);
if (!SUPPORTED_MANAGERS.has(packageManager)) {
  throw new Error(
    `Unsupported package manager "${packageManager}" (expected: ${[
      ...SUPPORTED_MANAGERS,
    ].join(", ")}).`,
  );
}

const DEV_DEPS = [
  "husky",
  "lint-staged",
  "eslint",
  "prettier",
  "@eslint/js",
  "globals",
];

// Install the packed tarball plus the peer tools using the selected manager.
function installDevDeps(tarball) {
  if (packageManager === "pnpm") {
    return ["pnpm", ["add", "-D", tarball, ...DEV_DEPS]];
  }
  return ["npm", ["install", "-D", tarball, ...DEV_DEPS]];
}

// Run the installed commitment-issues bin using the selected manager.
function execBin(args) {
  if (packageManager === "pnpm") {
    return ["pnpm", ["exec", "commitment-issues", ...args]];
  }
  return ["npx", ["--no-install", "commitment-issues", ...args]];
}

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.HUSKY;

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

  const [helpCommand, helpArgs] = execBin(["--help"]);
  run(helpCommand, helpArgs, smokeDir);
  const [initCommand, initArgs] = execBin(["init"]);
  run(initCommand, initArgs, smokeDir);

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
