#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function commandName(name) {
  if (process.platform === "win32" && ["npm", "npx"].includes(name)) {
    return `${name}.cmd`;
  }
  return name;
}

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.HUSKY;

  const result = spawnSync(commandName(command), args, {
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

  run(
    "npm",
    [
      "install",
      "-D",
      tarball,
      "husky",
      "lint-staged",
      "eslint",
      "prettier",
      "@eslint/js",
      "globals",
    ],
    smokeDir,
  );

  run("npx", ["--no-install", "commitment-issues", "--help"], smokeDir);
  run("npx", ["--no-install", "commitment-issues", "init"], smokeDir);

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
