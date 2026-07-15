#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import { withoutGitLocalEnvironment } from "../scripts/lib/process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(root, "test", "fixtures", "shell-compat");
const TARGETS = {
  sh: {
    platforms: new Set(["linux", "darwin"]),
    executable: "/bin/sh",
    fixture: "invoke.sh",
    runner: "shell-compat.sh",
  },
  bash: {
    platforms: new Set(["linux"]),
    executable: "bash",
    fixture: "invoke.sh",
    runner: "shell-compat.sh",
  },
  fish: {
    platforms: new Set(["linux"]),
    executable: "fish",
    fixture: "invoke.fish",
    runner: "shell-compat.fish",
  },
  zsh: {
    platforms: new Set(["darwin"]),
    executable: "zsh",
    fixture: "invoke.sh",
    runner: "shell-compat.sh",
  },
  powershell: {
    platforms: new Set(["win32"]),
    executable: "powershell.exe",
    fixture: "invoke.ps1",
    runner: "shell-compat.ps1",
    binExtension: ".ps1",
  },
  cmd: {
    platforms: new Set(["win32"]),
    executable: "cmd.exe",
    fixture: "invoke.cmd",
    runner: "shell-compat.cmd",
    binExtension: ".cmd",
  },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveTarball(input) {
  const resolved = path.resolve(root, input);
  if (path.extname(resolved) !== ".tgz") {
    fail(`Shell compatibility tarball must use the .tgz extension: ${input}`);
  }
  try {
    if (!fs.lstatSync(resolved).isFile()) {
      fail(`Shell compatibility tarball is not a regular file: ${input}`);
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return fs.realpathSync.native(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Shell compatibility tarball does not exist: ${input}`);
    }
    if (error?.code === "EACCES") {
      fail(`Shell compatibility tarball is not readable: ${input}`);
    }
    throw error;
  }
}

const args = process.argv.slice(2);
const positionalTarget =
  args[0] && !args[0].startsWith("-") ? args.shift() : undefined;
const targetName = process.env.SHELL_COMPAT_TARGET || positionalTarget;
let suppliedTarball;
while (args.length > 0) {
  const option = args.shift();
  if (option !== "--tarball") {
    fail(`Unknown shell compatibility option: ${option}`);
  }
  if (suppliedTarball) {
    fail("Shell compatibility tarball may be provided only once.");
  }
  const value = args.shift();
  if (!value) {
    fail("--tarball requires a path to a packed .tgz file.");
  }
  suppliedTarball = resolveTarball(value);
}

if (!targetName) {
  fail(
    `A shell target is required (expected: ${Object.keys(TARGETS).join(", ")}).`,
  );
}
const target = TARGETS[targetName];
if (!target) {
  fail(
    `Unsupported shell target "${targetName}" (expected: ${Object.keys(TARGETS).join(", ")}).`,
  );
}
if (!target.platforms.has(process.platform)) {
  fail(`Shell target "${targetName}" is not supported on ${process.platform}.`);
}

function executableCandidates(name) {
  if (path.isAbsolute(name)) return [name];
  const extensions =
    process.platform === "win32" && path.extname(name) === ""
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];
  return (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((entry) =>
      extensions.map((extension) =>
        path.join(entry.replace(/^"|"$/g, ""), `${name}${extension}`),
      ),
    );
}

function findExecutable(name) {
  for (const candidate of executableCandidates(name)) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return fs.realpathSync.native(candidate);
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error(`Required executable was not found on PATH: ${name}`);
}

function cleanEnv() {
  const env = withoutGitLocalEnvironment(process.env);
  delete env.COMMITMENT_ISSUES;
  delete env.HUSKY;
  delete env.SHELL_COMPAT_ACTION;
  delete env.SHELL_COMPAT_BIN;
  delete env.SHELL_COMPAT_ENTRY;
  env.NO_COLOR = "1";
  return env;
}

function withPath(env, directories) {
  const result = { ...env };
  for (const key of Object.keys(result)) {
    if (key.toLowerCase() === "path") delete result[key];
  }
  result.PATH = [...new Set(directories)].join(path.delimiter);
  return result;
}

function run(command, commandArgs, { cwd = root, env = cleanEnv() } = {}) {
  const result = crossSpawn.sync(command, commandArgs, {
    cwd,
    env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit ${result.status}:\n${output}`,
    );
  }
  return output;
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function localPackageSpec(fromDir, packagePath) {
  const relative = path
    .relative(
      fs.realpathSync.native(fromDir),
      fs.realpathSync.native(packagePath),
    )
    .split(path.sep)
    .join("/");
  return `file:${relative}`;
}

function hasExactLine(output, expected) {
  return output.split(/\r?\n/u).some((line) => line.trim() === expected);
}

function shellArgs(runner) {
  switch (targetName) {
    case "powershell":
      return [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        runner,
      ];
    case "cmd":
      return ["/d", "/s", "/c", runner];
    default:
      return [runner];
  }
}

const shellExecutable = findExecutable(target.executable);
const gitExecutable = findExecutable("git");
const tempBase = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-shell-compat-"),
);
const tempRoot = path.join(tempBase, "path $cash & tea café");
const packDir = path.join(tempRoot, "pack");
const repoDir = path.join(tempRoot, "project [shell] $cash & tea café");
const remoteDir = path.join(tempRoot, "remote & café.git");

try {
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });

  let tarball = suppliedTarball;
  if (!tarball) {
    run(
      "npm",
      ["pack", "--silent", "--ignore-scripts", "--pack-destination", packDir],
      { cwd: root },
    );
    const tarballs = fs
      .readdirSync(packDir)
      .filter((file) => file.endsWith(".tgz"));
    assert.equal(
      tarballs.length,
      1,
      `npm pack should produce exactly one tarball, found ${tarballs.length}`,
    );
    tarball = fs.realpathSync.native(path.join(packDir, tarballs[0]));
  }
  const tarballHash = sha256(tarball);
  console.log(`[shell compat] target: ${targetName}`);
  console.log(`[shell compat] executable: ${shellExecutable}`);
  console.log(`[shell compat] tarball sha256: ${tarballHash}`);

  run("git", ["init"], { cwd: repoDir });
  run("git", ["config", "user.name", "commitment-issues-shell-ci"], {
    cwd: repoDir,
  });
  run(
    "git",
    ["config", "user.email", "commitment-issues-shell-ci@example.com"],
    { cwd: repoDir },
  );
  // The compatibility fixture owns no signing key. Do not let a maintainer's
  // global commit.gpgsign setting expand the intentionally minimal PATH.
  run("git", ["config", "commit.gpgsign", "false"], { cwd: repoDir });

  const rootPackage = readJson(path.join(root, "package.json"));
  const localPackages = [
    ...Object.keys(rootPackage.dependencies || {}),
    ...Object.keys(rootPackage.peerDependencies || {}),
  ];
  writeFile(
    path.join(repoDir, "package.json"),
    `${JSON.stringify(
      {
        name: "commitment-issues-shell-compat",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { test: "node --test" },
        devDependencies: {
          [rootPackage.name]: localPackageSpec(repoDir, tarball),
          ...Object.fromEntries(
            localPackages.map((name) => [
              name,
              localPackageSpec(repoDir, path.join(root, "node_modules", name)),
            ]),
          ),
        },
        precommitChecks: {
          showWelcomeOnFirstCommit: false,
          tone: "standard",
          commitMessage: { enabled: true },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(repoDir, "eslint.config.js"),
    'export default [{ files: ["**/*.mjs"] }];\n',
  );

  const installEnv = cleanEnv();
  installEnv.npm_config_offline = "true";
  installEnv.npm_config_audit = "false";
  installEnv.npm_config_fund = "false";
  run(
    "npm",
    ["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
    { cwd: repoDir, env: installEnv },
  );

  // npm 11's fresh CI cache contains tarballs after `npm ci` but not always the
  // registry manifests needed for a second offline resolution. The fixture
  // installs the product from its exact tarball and exposes the already
  // lockfile-installed runtime and peer packages through local file specs. The
  // package-manager lifecycle suite owns independent registry-install coverage.
  for (const name of localPackages) {
    const version = readJson(
      path.join(root, "node_modules", name, "package.json"),
    ).version;
    assert.equal(
      readJson(path.join(repoDir, "node_modules", name, "package.json"))
        .version,
      version,
    );
  }

  const installedPackage = readJson(
    path.join(repoDir, "node_modules", "commitment-issues", "package.json"),
  );
  assert.equal(installedPackage.version, rootPackage.version);
  assert.deepEqual(installedPackage.bin, {
    "commitment-issues": "scripts/cli.mjs",
  });

  const runner = path.join(".git", target.runner);
  fs.copyFileSync(
    path.join(fixtureDir, target.fixture),
    path.join(repoDir, runner),
  );
  const binBase = path.join(
    repoDir,
    "node_modules",
    ".bin",
    "commitment-issues",
  );
  const bin = `${binBase}${target.binExtension || ""}`;
  const entry = path.join(
    repoDir,
    "node_modules",
    rootPackage.name,
    installedPackage.bin[rootPackage.name],
  );
  assert.ok(fs.existsSync(bin), `installed bin should exist: ${bin}`);
  assert.ok(fs.existsSync(binBase), `hook bin should exist: ${binBase}`);
  assert.ok(fs.existsSync(entry), `packed CLI entry should exist: ${entry}`);

  const fullEnv = cleanEnv();
  const invoke = (action, env = fullEnv) =>
    run(shellExecutable, shellArgs(runner), {
      cwd: repoDir,
      env: {
        ...env,
        SHELL_COMPAT_ACTION: action,
        SHELL_COMPAT_BIN: bin,
        SHELL_COMPAT_ENTRY: entry,
      },
    });

  assert.ok(
    hasExactLine(invoke("version"), rootPackage.version),
    `packed CLI should report version ${rootPackage.version}`,
  );

  const customHook = path.join(repoDir, ".git", "hooks", "pre-commit");
  const customHookBody =
    "#!/bin/sh\nprintf '%s\\n' 'project-owned hook remains untouched'\n";
  writeFile(customHook, customHookBody);
  if (process.platform !== "win32") fs.chmodSync(customHook, 0o755);

  invoke("init");
  assert.equal(
    fs.readFileSync(customHook, "utf8"),
    customHookBody,
    "init must preserve an existing project-owned hook",
  );
  fs.rmSync(customHook);
  assert.match(invoke("doctor"), /Repaired the git hook wiring/u);

  for (const [name, subcommand] of [
    ["pre-commit", "precommit"],
    ["pre-push", "prepush"],
    ["commit-msg", 'commit-msg "$1"'],
  ]) {
    const hookPath = path.join(repoDir, ".git", "hooks", name);
    const body = fs.readFileSync(hookPath, "utf8");
    assert.ok(body.startsWith("#!/bin/sh\n"), `${name} should use POSIX sh`);
    assert.ok(!body.includes("\r"), `${name} should use LF line endings`);
    assert.ok(
      body.includes(`node_modules/.bin/commitment-issues ${subcommand}`),
      `${name} should invoke the project-local packed bin`,
    );
    if (process.platform !== "win32") {
      assert.ok(
        fs.statSync(hookPath).mode & 0o111,
        `${name} should be executable on Unix`,
      );
    }
  }

  run("git", ["init", "--bare", remoteDir], { cwd: tempRoot });
  run("git", ["branch", "-M", "main"], { cwd: repoDir });
  run("git", ["remote", "add", "origin", remoteDir], { cwd: repoDir });

  writeFile(
    path.join(repoDir, "src", "value.mjs"),
    "export const value=()=>42\n",
  );
  writeFile(
    path.join(repoDir, "src", "value.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { value } from "./value.mjs";',
      "",
      'test("value",()=>assert.equal(value(),42));',
      "",
    ].join("\n"),
  );
  run("git", ["add", "-A"], { cwd: repoDir });

  const strippedEnv = withPath(cleanEnv(), [
    path.dirname(process.execPath),
    path.dirname(gitExecutable),
  ]);
  assert.notEqual(
    strippedEnv.PATH,
    process.env.PATH,
    "GUI approximation should use a deliberately stripped PATH",
  );
  const commitOutput = invoke("commit", strippedEnv);
  assert.match(commitOutput, /Pre-commit suggestions found/u);
  assert.match(commitOutput, /Commit-message check unavailable/u);
  assert.equal(
    run("git", ["rev-list", "--count", "HEAD"], { cwd: repoDir }).trim(),
    "1",
  );

  const pushOutput = invoke("push", strippedEnv);
  assert.match(pushOutput, /Running tests for pushed files/u);
  assert.match(pushOutput, /All tests passed: 1 passed, 0 failed\./u);
  assert.match(invoke("doctor", strippedEnv), /Git hooks are healthy/u);

  const uninstallOutput = invoke("uninstall", strippedEnv);
  assert.match(uninstallOutput, /Commitment Issues setup was removed/u);
  for (const name of ["pre-commit", "pre-push", "commit-msg"]) {
    assert.ok(
      !fs.existsSync(path.join(repoDir, ".git", "hooks", name)),
      `uninstall should remove the owned ${name} hook`,
    );
  }
  assert.equal(
    sha256(tarball),
    tarballHash,
    "the shell scenario must not modify the packed artifact",
  );
  console.log(
    `[shell compat] ${targetName} passed the packed lifecycle with a stripped PATH`,
  );
} finally {
  fs.rmSync(tempBase, { recursive: true, force: true });
}
