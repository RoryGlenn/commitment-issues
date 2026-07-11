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
const EXISTING_PREPARE = "node scripts/existing-prepare.mjs";
const WORKSPACE_GLOBS = ["packages/*", "packages/nested/*"];
const WORKSPACE_PACKAGES = [
  {
    dir: "packages/app",
    name: "@commitment-issues-fixture/app",
    stem: "app-widget",
  },
  {
    dir: "packages/nested/lib",
    name: "@commitment-issues-fixture/nested-lib",
    stem: "nested-widget",
  },
];
const PACKAGE_LOCAL_CONFIG = {
  // This intentionally conflicts with the branches exercised below. A commit
  // started inside the nested package still succeeds because Git runs the
  // shared hook from the repository root, whose config owns the whole repo.
  blockProtectedBranches: true,
  protectedBranches: ["main", "master", "workspace-lifecycle"],
};
const MANAGED_EXPECTED_SCRIPTS = {
  "commit:fix": "commitment-issues commit-fix",
  "fix:staged": "commitment-issues fix-staged",
  "test:precommit": "commitment-issues precommit",
  doctor: "commitment-issues doctor",
};
const EXPECTED_SCRIPTS = {
  prepare: `${EXISTING_PREPARE} && commitment-issues doctor --quiet`,
  ...MANAGED_EXPECTED_SCRIPTS,
};
const HOOK_SUBCOMMANDS = {
  "pre-commit": "precommit",
  "pre-push": "prepush",
};

// Install the packed tarball plus the peer tools using the selected manager.
function installDevDeps(tarball) {
  switch (packageManager) {
    case "pnpm":
      return [
        "pnpm",
        ["add", "--save-dev", "--workspace-root", tarball, ...DEV_DEPS],
      ];
    case "yarn":
      return [
        "yarn",
        ["add", "--dev", "--ignore-workspace-root-check", tarball, ...DEV_DEPS],
      ];
    case "bun":
      return ["bun", ["add", "--dev", tarball, ...DEV_DEPS]];
    default:
      return ["npm", ["install", "-D", tarball, ...DEV_DEPS]];
  }
}

// Reinstall an already-configured checkout. This is the path that must invoke
// composed prepare repair and recreate clone-local .git/hooks files.
function installProject() {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["install"]];
    case "yarn":
      return ["yarn", ["install"]];
    case "bun":
      return ["bun", ["install"]];
    default:
      return ["npm", ["install"]];
  }
}

// Exercise each manager's own workspace traversal before Git hooks run the
// same package tests from changed paths.
function workspaceTestCommand() {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["--recursive", "run", "test"]];
    case "yarn":
      return ["yarn", ["workspaces", "run", "test"]];
    case "bun":
      return ["bun", ["run", "--workspaces", "--if-present", "test"]];
    default:
      return ["npm", ["run", "test", "--workspaces", "--if-present"]];
  }
}

function runWorkspaceTests(repoDir) {
  const [command, args] = workspaceTestCommand();
  const output = runForOutput(command, args, repoDir);
  if (output) {
    console.log(output);
  }
  for (const workspace of WORKSPACE_PACKAGES) {
    assertSmoke(
      output.includes(`${workspace.name} workspace script passed`),
      `${packageManager} should run the test script for ${workspace.name}`,
    );
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

function runForOutput(command, args, cwd) {
  const env = { ...process.env };
  delete env.HUSKY;
  delete env.COMMITMENT_ISSUES;

  const result = crossSpawn.sync(command, args, {
    cwd,
    env,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}: ${result.stderr}`,
    );
  }

  return result.stdout.trim();
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

function gitCommonDir(repoDir) {
  const commonDir = runForOutput(
    "git",
    ["rev-parse", "--git-common-dir"],
    repoDir,
  );
  return path.resolve(repoDir, commonDir);
}

function hookPath(repoDir, name) {
  return path.join(gitCommonDir(repoDir), "hooks", name);
}

function comparablePath(filePath) {
  const resolved = fs.realpathSync.native(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function sameFilesystemEntry(leftPath, rightPath) {
  const left = fs.statSync(leftPath, { bigint: true });
  const right = fs.statSync(rightPath, { bigint: true });

  // File identity avoids false mismatches between Windows short (8.3) and
  // long spellings of the same Git directory. Some filesystems report zero
  // identifiers, so retain canonical path comparison as a portable fallback.
  if (
    (left.dev !== 0n || left.ino !== 0n) &&
    left.dev === right.dev &&
    left.ino === right.ino
  ) {
    return true;
  }

  return comparablePath(leftPath) === comparablePath(rightPath);
}

function assertHookWired(repoDir, name) {
  const resolvedHookPath = hookPath(repoDir, name);
  const subcommand = HOOK_SUBCOMMANDS[name];
  assertFileContains(resolvedHookPath, `commitment-issues ${subcommand}`);

  // Git for Windows runs hook files through its bundled shell, but POSIX mode
  // bits are not a reliable signal on that filesystem. Keep the executable-bit
  // check where it is meaningful and rely on the real commit/push below on
  // Windows to prove the hooks actually run.
  if (process.platform !== "win32") {
    assertSmoke(
      Boolean(fs.statSync(resolvedHookPath).mode & 0o111),
      `${resolvedHookPath} should be executable`,
    );
  }
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

function assertWorkspaceConfigured(repoDir) {
  const rootPackage = readJson(path.join(repoDir, "package.json"));
  assertSmoke(
    JSON.stringify(rootPackage.workspaces) === JSON.stringify(WORKSPACE_GLOBS),
    `root package.json should keep workspaces ${JSON.stringify(WORKSPACE_GLOBS)}`,
  );

  for (const workspace of WORKSPACE_PACKAGES) {
    const workspacePackage = readJson(
      path.join(repoDir, workspace.dir, "package.json"),
    );
    assertSmoke(
      workspacePackage.name === workspace.name,
      `${workspace.dir}/package.json should keep its package name`,
    );
    assertSmoke(
      JSON.stringify(workspacePackage.precommitChecks) ===
        JSON.stringify(PACKAGE_LOCAL_CONFIG),
      `${workspace.dir}/package.json should keep package-local config untouched`,
    );
    assertSmoke(
      !Object.hasOwn(
        workspacePackage.devDependencies ?? {},
        "commitment-issues",
      ),
      `${workspace.dir} should not own the commitment-issues install`,
    );
  }

  if (packageManager === "pnpm") {
    assertFileContains(
      path.join(repoDir, "pnpm-workspace.yaml"),
      '  - "packages/nested/*"',
    );
  }
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

function assertGeneratedSetupRemoved(repoDir) {
  const pkg = readJson(path.join(repoDir, "package.json"));
  assertSmoke(
    pkg.scripts?.prepare === EXISTING_PREPARE,
    "the project's original prepare script should be preserved",
  );
  for (const name of Object.keys(MANAGED_EXPECTED_SCRIPTS)) {
    assertSmoke(
      !Object.hasOwn(pkg.scripts ?? {}, name),
      `package.json script ${name} should be removed`,
    );
  }
  assertSmoke(
    !Object.hasOwn(pkg, "precommitChecks"),
    "package.json precommitChecks should be removed",
  );
  assertSmoke(
    Object.hasOwn(pkg.devDependencies ?? {}, "commitment-issues"),
    "the package dependency should remain until the manager removes it",
  );
  for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
    assertSmoke(
      !fs.existsSync(hookPath(repoDir, name)),
      `${name} should be removed from the common git hooks directory`,
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

function writeWorkspaceFixture(repoDir) {
  for (const workspace of WORKSPACE_PACKAGES) {
    writeFile(
      path.join(repoDir, workspace.dir, "package.json"),
      `${JSON.stringify(
        {
          name: workspace.name,
          version: "1.0.0",
          private: true,
          type: "module",
          scripts: {
            test: "node scripts/workspace.test.mjs",
          },
          precommitChecks: PACKAGE_LOCAL_CONFIG,
        },
        null,
        2,
      )}\n`,
    );
    writeFile(
      path.join(repoDir, workspace.dir, "src", `${workspace.stem}.mjs`),
      `export const value = () => ${workspace.stem.length};\n`,
    );
    writeFile(
      path.join(repoDir, workspace.dir, "src", `${workspace.stem}.test.mjs`),
      [
        'import test from "node:test";',
        'import assert from "node:assert/strict";',
        `import { value } from "./${workspace.stem}.mjs";`,
        "",
        `test("${workspace.stem}", () => assert.equal(value(), ${workspace.stem.length}));`,
        "",
      ].join("\n"),
    );
    writeFile(
      path.join(repoDir, workspace.dir, "scripts", "workspace.test.mjs"),
      [
        'import assert from "node:assert/strict";',
        `import { value } from "../src/${workspace.stem}.mjs";`,
        "",
        `assert.equal(value(), ${workspace.stem.length});`,
        `console.log("${workspace.name} workspace script passed");`,
        "",
      ].join("\n"),
    );
  }

  if (packageManager === "pnpm") {
    writeFile(
      path.join(repoDir, "pnpm-workspace.yaml"),
      `packages:\n${WORKSPACE_GLOBS.map((glob) => `  - "${glob}"`).join("\n")}\n`,
    );
  }
}

function updateNestedWorkspace(repoDir, revision) {
  const workspace = WORKSPACE_PACKAGES[1];
  writeFile(
    path.join(repoDir, workspace.dir, "src", `${workspace.stem}.mjs`),
    `export const value = () => ${revision};\n`,
  );
  writeFile(
    path.join(repoDir, workspace.dir, "src", `${workspace.stem}.test.mjs`),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      `import { value } from "./${workspace.stem}.mjs";`,
      "",
      `test("${workspace.stem}", () => assert.equal(value(), ${revision}));`,
      "",
    ].join("\n"),
  );
}

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-lifecycle-"),
);
const packDir = path.join(tempRoot, "pack");
const smokeDir = path.join(tempRoot, "repo");
const cloneDir = path.join(tempRoot, "clone");
const worktreeDir = path.join(tempRoot, "worktree");
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
        workspaces: WORKSPACE_GLOBS,
        scripts: { prepare: EXISTING_PREPARE },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(smokeDir, "scripts", "existing-prepare.mjs"),
    'process.stdout.write("existing prepare ran\\n");\n',
  );
  writeWorkspaceFixture(smokeDir);

  const [installCommand, installArgs] = installDevDeps(tarball);
  run(installCommand, installArgs, smokeDir);
  assertManagerLockfile(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  runWorkspaceTests(smokeDir);

  const [helpCommand, helpArgs] = execBin(["--help"]);
  run(helpCommand, helpArgs, smokeDir);
  const [initCommand, initArgs] = execBin(["init"]);
  run(initCommand, initArgs, smokeDir);

  assertPackageJsonConfigured(smokeDir);
  assertWorkspaceConfigured(smokeDir);
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

  const nestedWorkspaceDir = path.join(smokeDir, WORKSPACE_PACKAGES[1].dir);

  run("git", ["add", "-A"], smokeDir);
  // Starting Git lifecycle commands below the workspace root must still run
  // the root-owned hooks and config for files in both workspace depths.
  run(
    "git",
    ["commit", "-m", "first checked workspace commit"],
    nestedWorkspaceDir,
  );

  run("git", ["init", "--bare", remoteDir], tempRoot);
  run("git", ["branch", "-M", "main"], smokeDir);
  run("git", ["remote", "add", "origin", remoteDir], smokeDir);
  run("git", ["push", "-u", "origin", "main"], nestedWorkspaceDir);

  // .git/hooks is intentionally clone-local and is not present in a fresh
  // checkout. A normal install must run the preserved prepare followed by the
  // appended repair and recreate both hooks without another init call.
  run("git", ["clone", "--branch", "main", remoteDir, cloneDir], tempRoot);
  for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
    assertSmoke(
      !fs.existsSync(hookPath(cloneDir, name)),
      `fresh clone should start without a ${name} hook`,
    );
  }
  const [projectInstallCommand, projectInstallArgs] = installProject();
  run(projectInstallCommand, projectInstallArgs, cloneDir);
  assertPackageJsonConfigured(cloneDir);
  assertWorkspaceConfigured(cloneDir);
  assertHookWired(cloneDir, "pre-commit");
  assertHookWired(cloneDir, "pre-push");

  // A linked worktree has a `.git` file rather than its own `.git/hooks`.
  // Dependencies remain worktree-local, while native hooks live in the shared
  // common Git directory and must run correctly from a nested package.
  run(
    "git",
    ["worktree", "add", "-b", "workspace-lifecycle", worktreeDir, "main"],
    smokeDir,
  );
  assertSmoke(
    sameFilesystemEntry(gitCommonDir(worktreeDir), gitCommonDir(smokeDir)),
    "linked worktree should use the primary checkout's common Git directory",
  );
  assertHookWired(worktreeDir, "pre-commit");
  assertHookWired(worktreeDir, "pre-push");

  run(projectInstallCommand, projectInstallArgs, worktreeDir);
  assertPackageJsonConfigured(worktreeDir);
  assertWorkspaceConfigured(worktreeDir);
  assertHookWired(worktreeDir, "pre-commit");
  assertHookWired(worktreeDir, "pre-push");

  updateNestedWorkspace(worktreeDir, 42);
  run(
    "git",
    [
      "add",
      `${WORKSPACE_PACKAGES[1].dir}/src/${WORKSPACE_PACKAGES[1].stem}.mjs`,
      `${WORKSPACE_PACKAGES[1].dir}/src/${WORKSPACE_PACKAGES[1].stem}.test.mjs`,
    ],
    worktreeDir,
  );
  run(
    "git",
    ["commit", "-m", "check nested package from linked worktree"],
    path.join(worktreeDir, WORKSPACE_PACKAGES[1].dir),
  );

  const [uninstallPreviewCommand, uninstallPreviewArgs] = execBin([
    "uninstall",
    "--dry-run",
  ]);
  run(uninstallPreviewCommand, uninstallPreviewArgs, smokeDir);
  assertPackageJsonConfigured(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  assertHookWired(smokeDir, "pre-commit");
  assertHookWired(smokeDir, "pre-push");

  const [uninstallCommand, uninstallArgs] = execBin(["uninstall"]);
  run(uninstallCommand, uninstallArgs, smokeDir);
  assertGeneratedSetupRemoved(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  assertGitignoreConfigured(smokeDir);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
