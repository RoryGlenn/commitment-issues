#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import crossSpawn from "cross-spawn";
import {
  formatLifecycleManagers,
  hasExactOutputLine,
  isSupportedLifecycleManager,
  shouldEnforcePosixPackageModes,
  SUPPLIED_TARBALL_DIGEST_PREFIX,
  YARN_BERRY_VERSION,
  YARN_CLASSIC_VERSION,
} from "./lib/lifecycle-managers.mjs";
import {
  findBrokenMarkdownLinksInDirectory,
  formatBrokenMarkdownLink,
} from "../tools/packed-markdown-links.mjs";

const root = process.cwd();

// Which package manager to exercise end to end. Defaults to npm. Yarn Classic
// and Yarn Berry are separate identities so their versions, commands, layouts,
// and CI evidence cannot accidentally satisfy one another's support claims.
const args = process.argv.slice(2);
const packageManager =
  args[0] && !args[0].startsWith("-") ? args.shift() : "npm";
if (!isSupportedLifecycleManager(packageManager)) {
  throw new Error(
    `Unsupported package manager "${packageManager}" (expected: ${formatLifecycleManagers()}).`,
  );
}

const yarnClassicCli = path.join(
  root,
  "node_modules",
  "yarn",
  "bin",
  "yarn.js",
);
const yarnBerryFixtureDir = path.join(root, "test", "fixtures", "yarn-berry");
const yarnBerryCli = path.join(
  yarnBerryFixtureDir,
  "node_modules",
  "@yarnpkg",
  "cli-dist",
  "bin",
  "yarn.js",
);
const isYarnBerryLifecycle = packageManager === "yarn-berry";
const packageManagerHint =
  packageManager === "yarn-berry" ? "yarn" : packageManager;

function managerInvocation(args) {
  if (packageManager === "yarn") {
    return [process.execPath, [yarnClassicCli, ...args]];
  }
  if (isYarnBerryLifecycle) {
    return [process.execPath, [yarnBerryCli, ...args]];
  }
  return [packageManager, args];
}

let suppliedTarballInput;
while (args.length > 0) {
  const option = args.shift();
  if (option !== "--tarball") {
    throw new Error(`Unknown lifecycle option: ${option}`);
  }
  if (suppliedTarballInput !== undefined) {
    throw new Error("Lifecycle tarball may be provided only once.");
  }
  suppliedTarballInput = args.shift();
  if (!suppliedTarballInput) {
    throw new Error("--tarball requires a path to a packed .tgz file.");
  }
}

function resolveTarball(input) {
  if (input === undefined) return undefined;

  const resolved = path.resolve(root, input);
  if (path.extname(resolved) !== ".tgz") {
    throw new Error(`Lifecycle tarball must use the .tgz extension: ${input}`);
  }
  try {
    if (!fs.lstatSync(resolved).isFile()) {
      throw new Error(`Lifecycle tarball is not a regular file: ${input}`);
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return fs.realpathSync.native(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Lifecycle tarball does not exist: ${input}`);
    }
    if (error?.code === "EACCES") {
      throw new Error(`Lifecycle tarball is not readable: ${input}`);
    }
    throw error;
  }
}

const suppliedTarball = resolveTarball(suppliedTarballInput);

// Keep the exact Node 22.11.0 lane on ESLint 9: ESLint 10 and its current
// transitive packages require a newer Node 22 patch. Newer supported runtimes
// exercise ESLint 10 so both declared peer majors stay covered.
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const eslintMajor = nodeMajor === 22 && nodeMinor < 13 ? 9 : 10;
const DEV_DEPS = [
  `eslint@^${eslintMajor}`,
  "prettier@^3",
  `@eslint/js@^${eslintMajor}`,
  "globals@^17",
];
const EXISTING_PREPARE = "node scripts/existing-prepare.mjs";
const ROOT_PACKAGE_CONFIG = { tone: "standard" };
const STANDALONE_CONFIG = { commitMessage: { enabled: true } };
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
  "commit-msg": 'commit-msg "$1"',
};

// Yarn Berry's file protocol expects a package identity and has ambiguous
// absolute-drive handling on Windows. Stage the unchanged bytes at a fixed
// sibling path so every OS can resolve the same relative locator.
function yarnBerryTarballSpec(tarball) {
  const artifactDir = path.join(tempRoot, "yarn-berry-artifact");
  const artifact = path.join(artifactDir, "commitment-issues.tgz");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.copyFileSync(tarball, artifact);
  assertSmoke(
    sha256(artifact) === sha256(tarball),
    "the staged Yarn Berry tarball must match the packed artifact",
  );
  return "commitment-issues@file:../yarn-berry-artifact/commitment-issues.tgz";
}

// Install the packed tarball plus the peer tools using the selected manager.
function installDevDeps(tarball) {
  switch (packageManager) {
    case "pnpm":
      return [
        "pnpm",
        ["add", "--save-dev", "--workspace-root", tarball, ...DEV_DEPS],
      ];
    case "yarn":
      return managerInvocation([
        "add",
        "--dev",
        "--ignore-workspace-root-check",
        tarball,
        ...DEV_DEPS,
      ]);
    case "yarn-berry":
      return managerInvocation([
        "add",
        "--dev",
        yarnBerryTarballSpec(tarball),
        ...DEV_DEPS,
      ]);
    case "bun":
      return ["bun", ["add", "--dev", tarball, ...DEV_DEPS]];
    default:
      return ["npm", ["install", "-D", tarball, ...DEV_DEPS]];
  }
}

// Reinstall an already-configured checkout. This is the path that must invoke
// composed prepare repair and recreate clone-local .git/hooks files.
function installProject({ ignoreScripts = false } = {}) {
  const scriptArgs = ignoreScripts ? ["--ignore-scripts"] : [];
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["install", ...scriptArgs]];
    case "yarn":
      return managerInvocation(["install", ...scriptArgs]);
    case "yarn-berry":
      return managerInvocation([
        "install",
        ...(ignoreScripts ? ["--mode=skip-build"] : []),
      ]);
    case "bun":
      return ["bun", ["install", ...scriptArgs]];
    default:
      return ["npm", ["install", ...scriptArgs]];
  }
}

// Remove the package dependency after its own uninstaller has removed only the
// configuration and hook artifacts it owns.
function removeInstalledPackage() {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["remove", "--workspace-root", "commitment-issues"]];
    case "yarn":
      return managerInvocation([
        "remove",
        "--ignore-workspace-root-check",
        "commitment-issues",
      ]);
    case "yarn-berry":
      return managerInvocation(["remove", "commitment-issues"]);
    case "bun":
      return ["bun", ["remove", "commitment-issues"]];
    default:
      return ["npm", ["remove", "commitment-issues"]];
  }
}

function expectedRemoveGuidance() {
  switch (packageManager) {
    case "pnpm":
      return "pnpm remove --workspace-root commitment-issues";
    case "yarn":
      return "yarn remove --ignore-workspace-root-check commitment-issues";
    case "yarn-berry":
      return "yarn remove commitment-issues";
    case "bun":
      return "bun remove commitment-issues";
    default:
      return "npm remove commitment-issues";
  }
}

// Exercise each manager's own workspace traversal before Git hooks run the
// same package tests from changed paths.
function workspaceTestCommand() {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["--recursive", "run", "test"]];
    case "yarn":
      return managerInvocation(["workspaces", "run", "test"]);
    case "yarn-berry":
      return managerInvocation([
        "workspaces",
        "foreach",
        "--all",
        "run",
        "test",
      ]);
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

// Run the installed commitment-issues bin through each manager's offline/local
// execution surface so a missing packed bin cannot be hidden by a download.
function execBin(args) {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", ["exec", "commitment-issues", ...args]];
    case "yarn":
    case "yarn-berry":
      return managerInvocation(["run", "commitment-issues", ...args]);
    case "bun":
      return ["bunx", ["--no-install", "commitment-issues", ...args]];
    default:
      return ["npx", ["--no-install", "commitment-issues", ...args]];
  }
}

function lifecycleEnv() {
  const env = { ...process.env };
  // CI invokes this integration through an outer npm script. Let manager
  // subprocesses set their own user agent and let Git hooks use the fixture's
  // lockfile instead of inheriting a false npm identity.
  delete env.npm_config_user_agent;
  delete env.HUSKY;
  delete env.COMMITMENT_ISSUES;
  delete env.COMMITMENT_ISSUES_LIFECYCLE_PM;
  delete env.COMMITMENT_ISSUES_LIFECYCLE_TARBALL;
  // Captured lifecycle output should use the renderer's stable default width.
  // Narrow-terminal wrapping is exercised separately by the welcome tests.
  delete env.COLUMNS;
  return env;
}

function run(command, args, cwd) {
  const result = crossSpawn.sync(command, args, {
    cwd,
    env: lifecycleEnv(),
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
  const result = crossSpawn.sync(command, args, {
    cwd,
    env: lifecycleEnv(),
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

function runForCombinedOutput(command, args, cwd) {
  const result = crossSpawn.sync(command, args, {
    cwd,
    env: lifecycleEnv(),
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}: ${output}`,
    );
  }

  return output;
}

function assertSmoke(condition, message) {
  if (!condition) {
    throw new Error(`[lifecycle smoke] ${message}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertPackedModes(metadata) {
  // npm creates executable package bins on every platform, but npm's tarball
  // metadata on Windows does not expose authoritative POSIX mode information.
  // The Ubuntu release producer and every POSIX lifecycle lane enforce the
  // archive-mode contract; Windows still exercises every semantic CLI check.
  if (!shouldEnforcePosixPackageModes()) {
    console.log(
      "[lifecycle smoke] POSIX package modes: enforced by the Ubuntu/macOS lanes\n",
    );
    return;
  }

  const executableFiles = metadata.files
    .filter((file) => (file.mode & 0o111) !== 0)
    .map((file) => file.path)
    .sort();
  assertSmoke(
    JSON.stringify(executableFiles) === JSON.stringify(["scripts/cli.mjs"]),
    `only scripts/cli.mjs should be executable, found ${JSON.stringify(executableFiles)}`,
  );
  const cli = metadata.files.find((file) => file.path === "scripts/cli.mjs");
  assertSmoke(
    cli?.mode === 0o755,
    `scripts/cli.mjs should have packed mode 0755, found ${cli?.mode ?? "missing"}`,
  );
  const nonCliModeDrift = metadata.files
    .filter((file) => file.path !== "scripts/cli.mjs" && file.mode !== 0o644)
    .map((file) => `${file.path}:${file.mode}`);
  assertSmoke(
    nonCliModeDrift.length === 0,
    `non-CLI files should have packed mode 0644, found ${nonCliModeDrift.join(", ")}`,
  );
}

function inspectPackedTarball(tarball) {
  const output = runForOutput(
    "npm",
    ["pack", tarball, "--dry-run", "--json", "--ignore-scripts"],
    root,
  );
  let records;
  try {
    records = JSON.parse(output);
  } catch {
    throw new Error("npm did not return valid JSON metadata for the tarball");
  }

  assertSmoke(
    Array.isArray(records) && records.length === 1,
    "npm should report metadata for exactly one packed artifact",
  );
  const metadata = records[0];
  assertSmoke(
    metadata.name === "commitment-issues" &&
      typeof metadata.version === "string",
    "packed metadata should identify commitment-issues and its version",
  );
  assertSmoke(
    Array.isArray(metadata.files),
    "packed metadata should include the exact file inventory",
  );

  assertPackedModes(metadata);

  return metadata;
}

function assertInstalledCli(repoDir, packedMetadata) {
  const packageDir = path.join(repoDir, "node_modules", "commitment-issues");
  const installedPackage = readJson(path.join(packageDir, "package.json"));
  assertSmoke(
    installedPackage.name === packedMetadata.name &&
      installedPackage.version === packedMetadata.version,
    "the installed package identity should match the supplied tarball metadata",
  );
  assertSmoke(
    JSON.stringify(installedPackage.bin) ===
      JSON.stringify({ "commitment-issues": "scripts/cli.mjs" }),
    "the packed package bin should point only to scripts/cli.mjs",
  );

  const cliSource = fs.readFileSync(
    path.join(packageDir, "scripts", "cli.mjs"),
    "utf8",
  );
  assertSmoke(
    cliSource.startsWith("#!/usr/bin/env node\n"),
    "scripts/cli.mjs should start with the exact Node shebang",
  );

  const [versionCommand, versionArgs] = execBin(["--version"]);
  const versionOutput = runForOutput(versionCommand, versionArgs, repoDir);
  assertSmoke(
    hasExactOutputLine(versionOutput, packedMetadata.version),
    `packed CLI should report ${packedMetadata.version} on its own line, found ${JSON.stringify(versionOutput)}`,
  );
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

function welcomeMarkerPath(repoDir) {
  return path.join(gitCommonDir(repoDir), "commitment-issues", "welcome-v1");
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
    JSON.stringify(pkg.precommitChecks) === JSON.stringify(ROOT_PACKAGE_CONFIG),
    "package.json should preserve package-owned config without copying standalone keys",
  );

  const standalone = readJson(path.join(repoDir, ".commitmentrc.json"));
  assertSmoke(
    standalone.advisePushTests === true,
    ".commitmentrc.json should enable advisory pre-push tests by default",
  );
  assertSmoke(
    standalone.commitMessage?.enabled === true,
    ".commitmentrc.json should preserve the opt-in commit-message configuration",
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

  if (isYarnBerryLifecycle) {
    assertSmoke(
      rootPackage.packageManager === `yarn@${YARN_BERRY_VERSION}`,
      `Yarn Berry projects should pin yarn@${YARN_BERRY_VERSION}`,
    );
    assertFileContains(
      path.join(repoDir, ".yarnrc.yml"),
      "nodeLinker: node-modules",
    );
    assertSmoke(
      fs.existsSync(path.join(repoDir, "node_modules")),
      "Yarn Berry node-modules mode should create node_modules",
    );
    assertSmoke(
      !fs.existsSync(path.join(repoDir, ".pnp.cjs")),
      "the supported Yarn Berry fixture must not generate Plug'n'Play state",
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
    !fs.existsSync(path.join(repoDir, ".commitmentrc.json")),
    ".commitmentrc.json should be removed",
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

function assertPackageDependencyRemoved(repoDir) {
  const pkg = readJson(path.join(repoDir, "package.json"));
  assertSmoke(
    !Object.hasOwn(pkg.devDependencies ?? {}, "commitment-issues"),
    `${packageManager} should remove commitment-issues from devDependencies`,
  );
  for (const suffix of ["", ".cmd", ".ps1"]) {
    assertSmoke(
      !fs.existsSync(
        path.join(
          repoDir,
          "node_modules",
          ".bin",
          `commitment-issues${suffix}`,
        ),
      ),
      `${packageManager} should remove the local commitment-issues${suffix} bin`,
    );
  }
}

function assertManagerLockfile(repoDir) {
  const expectedLockfiles = {
    npm: ["package-lock.json"],
    pnpm: ["pnpm-lock.yaml"],
    yarn: ["yarn.lock"],
    "yarn-berry": ["yarn.lock"],
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

const tempBase = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-lifecycle-"),
);
const tempRoot = path.join(tempBase, "path with spaces café");
const packDir = path.join(tempRoot, "pack");
const smokeDir = path.join(tempRoot, "repo");
const cloneDir = path.join(tempRoot, "clone");
const worktreeDir = path.join(tempRoot, "worktree");
const remoteDir = path.join(tempRoot, "remote.git");

fs.mkdirSync(smokeDir, { recursive: true });

try {
  console.log(`\n[lifecycle smoke] package manager: ${packageManager}\n`);
  if (isYarnBerryLifecycle) {
    assertSmoke(
      fs.existsSync(yarnBerryCli),
      `install the pinned Yarn Berry fixture with npm ci --ignore-scripts --prefix ${path.relative(root, yarnBerryFixtureDir)}`,
    );
  }
  const [managerVersionCommand, managerVersionArgs] = managerInvocation([
    "--version",
  ]);
  const managerVersion = runForOutput(
    managerVersionCommand,
    managerVersionArgs,
    root,
  );
  console.log(
    `[lifecycle smoke] ${packageManager} version: ${managerVersion}\n`,
  );
  if (packageManager === "yarn" || isYarnBerryLifecycle) {
    const expectedVersion = isYarnBerryLifecycle
      ? YARN_BERRY_VERSION
      : YARN_CLASSIC_VERSION;
    assertSmoke(
      hasExactOutputLine(managerVersion, expectedVersion),
      `${packageManager} should resolve exact version ${expectedVersion}`,
    );
  }
  let tarball = suppliedTarball;
  if (tarball) {
    console.log(`[lifecycle smoke] supplied tarball: ${tarball}\n`);
  } else {
    fs.mkdirSync(packDir, { recursive: true });
    run("npm", ["pack", "--pack-destination", packDir], root);
    const tarballs = fs
      .readdirSync(packDir)
      .filter((file) => file.endsWith(".tgz"))
      .map((file) => path.join(packDir, file));
    if (tarballs.length !== 1) {
      throw new Error(
        `npm pack should produce exactly one tarball, found ${tarballs.length}`,
      );
    }
    [tarball] = tarballs;
  }

  if (!tarball) {
    throw new Error("npm pack did not produce a tarball");
  }
  const initialTarballHash = sha256(tarball);
  if (suppliedTarball) {
    console.log(`${SUPPLIED_TARBALL_DIGEST_PREFIX} ${initialTarballHash}\n`);
  }
  const packedMetadata = inspectPackedTarball(tarball);

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
        ...(isYarnBerryLifecycle
          ? { packageManager: `yarn@${YARN_BERRY_VERSION}` }
          : {}),
        workspaces: WORKSPACE_GLOBS,
        scripts: { prepare: EXISTING_PREPARE },
        precommitChecks: ROOT_PACKAGE_CONFIG,
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(smokeDir, "scripts", "existing-prepare.mjs"),
    'process.stdout.write("existing prepare ran\\n");\n',
  );
  writeFile(
    path.join(smokeDir, ".commitmentrc.json"),
    `${JSON.stringify(STANDALONE_CONFIG, null, 2)}\n`,
  );
  if (isYarnBerryLifecycle) {
    writeFile(path.join(smokeDir, ".yarnrc.yml"), "nodeLinker: node-modules\n");
  }
  writeWorkspaceFixture(smokeDir);

  const [installCommand, installArgs] = installDevDeps(tarball);
  run(installCommand, installArgs, smokeDir);
  assertInstalledCli(smokeDir, packedMetadata);
  const installedPackage = path.join(
    smokeDir,
    "node_modules",
    "commitment-issues",
  );
  const brokenInstalledLinks =
    findBrokenMarkdownLinksInDirectory(installedPackage);
  assertSmoke(
    brokenInstalledLinks.length === 0,
    `installed package has broken relative Markdown links:\n${brokenInstalledLinks
      .map(formatBrokenMarkdownLink)
      .join("\n")}`,
  );
  assertManagerLockfile(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  if (isYarnBerryLifecycle) {
    const [configCommand, configArgs] = managerInvocation([
      "config",
      "get",
      "nodeLinker",
    ]);
    assertSmoke(
      hasExactOutputLine(
        runForOutput(configCommand, configArgs, smokeDir),
        "node-modules",
      ),
      "Yarn Berry should resolve nodeLinker to node-modules",
    );
  }
  runWorkspaceTests(smokeDir);

  const [helpCommand, helpArgs] = execBin(["--help"]);
  run(helpCommand, helpArgs, smokeDir);
  const [initCommand, initArgs] = execBin(["init"]);
  run(initCommand, initArgs, smokeDir);
  // A repeated setup must remain idempotent under the manager's real local
  // runner, not only in the unit fixture.
  run(initCommand, initArgs, smokeDir);

  assertPackageJsonConfigured(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  assertGitignoreConfigured(smokeDir);
  assertHookWired(smokeDir, "pre-commit");
  assertHookWired(smokeDir, "pre-push");
  assertHookWired(smokeDir, "commit-msg");

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

  // Guarantee a fixable staged finding so the manager-specific recovery hint
  // is observable instead of depending on formatter drift in fixture files.
  writeFile(
    path.join(smokeDir, WORKSPACE_PACKAGES[0].dir, "src", "app-widget.mjs"),
    "export const value=()=>10;\n",
  );
  run("git", ["add", "-A"], smokeDir);
  const [firstCheckCommand, firstCheckArgs] = execBin(["precommit"]);
  const firstCheck = runForOutput(firstCheckCommand, firstCheckArgs, smokeDir);
  assertSmoke(
    firstCheck.includes(`${packageManagerHint} run commit:fix`),
    `pre-commit guidance should use ${packageManagerHint}'s run command`,
  );
  assertSmoke(
    !fs.existsSync(welcomeMarkerPath(smokeDir)),
    "a new clone should not start with a welcome marker",
  );
  // Starting Git lifecycle commands below the workspace root must still run
  // the root-owned hooks and config for files in both workspace depths.
  const checkedCommit = runForCombinedOutput(
    "git",
    ["commit", "-m", "first checked workspace commit"],
    nestedWorkspaceDir,
  );
  if (checkedCommit) {
    console.log(checkedCommit);
  }
  assertSmoke(
    checkedCommit.includes("Pre-commit suggestions found"),
    "a real git commit should execute the installed pre-commit hook",
  );
  assertSmoke(
    checkedCommit.includes("Commit-message check unavailable"),
    "a real git commit should execute the installed commit-msg hook",
  );
  assertSmoke(
    !fs.existsSync(welcomeMarkerPath(smokeDir)),
    "a first commit with findings should defer the welcome marker",
  );

  const [precommitCommand, precommitArgs] = execBin(["precommit"]);
  const deferredWelcome = runForOutput(
    precommitCommand,
    precommitArgs,
    smokeDir,
  );
  if (deferredWelcome) {
    console.log(deferredWelcome);
  }
  assertSmoke(
    deferredWelcome.includes("Commitment Issues is active here."),
    "the next eligible pre-commit invocation should show the deferred welcome",
  );
  assertSmoke(
    deferredWelcome.includes(
      `Verify or repair the hooks anytime: ${packageManagerHint} run doctor`,
    ),
    "the welcome should name hook repair with the detected package manager",
  );
  assertSmoke(
    fs.existsSync(welcomeMarkerPath(smokeDir)),
    "the deferred welcome should create the shared marker",
  );

  run("git", ["init", "--bare", remoteDir], tempRoot);
  run("git", ["branch", "-M", "main"], smokeDir);
  run("git", ["remote", "add", "origin", remoteDir], smokeDir);
  const checkedPush = runForCombinedOutput(
    "git",
    ["push", "-u", "origin", "main"],
    nestedWorkspaceDir,
  );
  if (checkedPush) {
    console.log(checkedPush);
  }
  assertSmoke(
    checkedPush.includes("Running tests for pushed files") &&
      checkedPush.includes("All tests passed: 4 passed, 0 failed."),
    "a real git push should execute the installed pre-push hook",
  );

  // .git/hooks is intentionally clone-local and is not present in a fresh
  // checkout. A scripts-disabled install must leave hooks absent while keeping
  // the local CLI available. Explicit doctor repair works for every manager.
  // npm, pnpm, Yarn Classic, and Bun also run the consumer-owned prepare repair
  // during a later normal install. Yarn Berry deliberately doesn't support
  // prepare and disables postinstall by default, so it requires explicit doctor
  // repair instead of pretending that a no-change install repaired the clone.
  run("git", ["clone", "--branch", "main", remoteDir, cloneDir], tempRoot);
  for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
    assertSmoke(
      !fs.existsSync(hookPath(cloneDir, name)),
      `fresh clone should start without a ${name} hook`,
    );
  }
  const [ignoredInstallCommand, ignoredInstallArgs] = installProject({
    ignoreScripts: true,
  });
  run(ignoredInstallCommand, ignoredInstallArgs, cloneDir);
  for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
    assertSmoke(
      !fs.existsSync(hookPath(cloneDir, name)),
      `--ignore-scripts should leave ${name} absent until explicit repair`,
    );
  }
  const [cloneHelpCommand, cloneHelpArgs] = execBin(["--help"]);
  run(cloneHelpCommand, cloneHelpArgs, cloneDir);
  const [cloneDoctorCommand, cloneDoctorArgs] = execBin(["doctor"]);
  run(cloneDoctorCommand, cloneDoctorArgs, cloneDir);
  for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
    assertHookWired(cloneDir, name);
    fs.rmSync(hookPath(cloneDir, name));
  }

  const [projectInstallCommand, projectInstallArgs] = installProject();
  run(projectInstallCommand, projectInstallArgs, cloneDir);
  if (isYarnBerryLifecycle) {
    for (const name of Object.keys(HOOK_SUBCOMMANDS)) {
      assertSmoke(
        !fs.existsSync(hookPath(cloneDir, name)),
        `a normal Yarn Berry install should leave ${name} absent until explicit repair`,
      );
    }
    run(cloneDoctorCommand, cloneDoctorArgs, cloneDir);
  }
  assertPackageJsonConfigured(cloneDir);
  assertWorkspaceConfigured(cloneDir);
  assertHookWired(cloneDir, "pre-commit");
  assertHookWired(cloneDir, "pre-push");
  assertHookWired(cloneDir, "commit-msg");

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
  assertSmoke(
    sameFilesystemEntry(
      welcomeMarkerPath(worktreeDir),
      welcomeMarkerPath(smokeDir),
    ),
    "linked worktrees should share the once-per-clone welcome marker",
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
  assertHookWired(smokeDir, "commit-msg");

  const [uninstallCommand, uninstallArgs] = execBin(["uninstall"]);
  const uninstallOutput = runForOutput(
    uninstallCommand,
    uninstallArgs,
    smokeDir,
  );
  const [removeCommand, removeArgs] = removeInstalledPackage();
  const removeGuidance = expectedRemoveGuidance();
  assertSmoke(
    uninstallOutput.includes(removeGuidance),
    `uninstall guidance should use ${packageManager}'s workspace-aware remove command`,
  );
  assertGeneratedSetupRemoved(smokeDir);
  assertWorkspaceConfigured(smokeDir);
  assertGitignoreConfigured(smokeDir);
  run(removeCommand, removeArgs, smokeDir);
  assertPackageDependencyRemoved(smokeDir);
  assertManagerLockfile(smokeDir);
  assertSmoke(
    sha256(tarball) === initialTarballHash,
    "the lifecycle integration must not modify the supplied tarball",
  );
} finally {
  fs.rmSync(tempBase, { recursive: true, force: true });
}
