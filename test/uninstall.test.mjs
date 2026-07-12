// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hookBody } from "../scripts/lib/hooks.mjs";
import {
  compactTerminalBoxText,
  countTerminalBoxes,
} from "./helpers/output.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  readFile,
  repoRoot,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runScript(tempDir, script, args = []) {
  return run(
    "node",
    [path.join(tempDir, "scripts", `${script}.mjs`), ...args],
    tempDir,
  );
}

function writePackage(tempDir, pkg) {
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
}

function readPackage(tempDir) {
  return JSON.parse(readFile(tempDir, "package.json"));
}

function gitHook(tempDir, name) {
  return path.join(tempDir, ".git", "hooks", name);
}

test("uninstall removes generated setup and preserves shared project state", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    scripts: { build: "node build.mjs" },
    devDependencies: { "commitment-issues": "^3.2.0" },
  });

  assert.equal(runScript(tempDir, "init").status, 0);
  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Commitment Issues setup was removed/);
  assert.match(output, /npm remove commitment-issues/);

  const pkg = readPackage(tempDir);
  assert.deepEqual(pkg.scripts, { build: "node build.mjs" });
  assert.equal("precommitChecks" in pkg, false);
  assert.equal(pkg.devDependencies["commitment-issues"], "^3.2.0");

  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
  assert.match(readFile(tempDir, ".gitignore"), /node_modules\//);
  assert.match(readFile(tempDir, ".gitignore"), /\.eslintcache/);

  const second = runScript(tempDir, "uninstall");
  assert.equal(second.status, 0);
  assert.match(
    `${second.stdout}${second.stderr}`,
    /No generated setup was found to remove/,
  );
});

test("uninstall --dry-run previews the exact cleanup without writing", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "consumer", version: "1.0.0" });
  assert.equal(runScript(tempDir, "init").status, 0);

  const beforePackage = readFile(tempDir, "package.json");
  const beforeCommitHook = readFile(tempDir, ".git/hooks/pre-commit");
  const result = runScript(tempDir, "uninstall", ["--dry-run"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /uninstall preview/i);
  assert.match(output, /Would remove:/);
  assert.match(output, /package scripts: prepare/);
  assert.match(output, /\.git\/hooks\/pre-commit/);
  assert.equal(countTerminalBoxes(output), 1);
  assert.equal(readFile(tempDir, "package.json"), beforePackage);
  assert.equal(readFile(tempDir, ".git/hooks/pre-commit"), beforeCommitHook);
});

test("uninstall previews and removes standalone configuration", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "consumer", version: "1.0.0" });
  writeFile(
    path.join(tempDir, ".commitmentrc.json"),
    '{\n  "requireTests": false\n}\n',
  );
  assert.equal(runScript(tempDir, "init").status, 0);

  const preview = runScript(tempDir, "uninstall", ["--dry-run"]);
  assert.equal(preview.status, 0);
  assert.match(`${preview.stdout}${preview.stderr}`, /\.commitmentrc\.json/);
  assert.equal(fs.existsSync(path.join(tempDir, ".commitmentrc.json")), true);

  const result = runScript(tempDir, "uninstall");
  assert.equal(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /\.commitmentrc\.json/);
  assert.equal(fs.existsSync(path.join(tempDir, ".commitmentrc.json")), false);
  assert.equal("precommitChecks" in readPackage(tempDir), false);
});

test("uninstall rejects malformed standalone config before cleanup", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    scripts: { doctor: "commitment-issues doctor" },
  });
  writeFile(path.join(tempDir, ".commitmentrc.json"), "[invalid\n");
  const beforePackage = readFile(tempDir, "package.json");

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Invalid \.commitmentrc\.json/);
  assert.match(output, /No files were changed/);
  assert.equal(readFile(tempDir, "package.json"), beforePackage);
  assert.equal(readFile(tempDir, ".commitmentrc.json"), "[invalid\n");
});

test("uninstall previews and removes an owned commit-msg hook", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    precommitChecks: {
      commitMessage: { enabled: true, blockOnFailure: true },
    },
  });
  assert.equal(runScript(tempDir, "init").status, 0);
  const before = readFile(tempDir, ".git/hooks/commit-msg");

  const preview = runScript(tempDir, "uninstall", ["--dry-run"]);
  assert.equal(preview.status, 0);
  assert.match(
    `${preview.stdout}${preview.stderr}`,
    /\.git\/hooks\/commit-msg/,
  );
  assert.equal(readFile(tempDir, ".git/hooks/commit-msg"), before);

  const result = runScript(tempDir, "uninstall");
  assert.equal(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /\.git\/hooks\/commit-msg/);
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
});

test("uninstall preserves customized commit-msg hooks for manual cleanup", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    precommitChecks: { commitMessage: { enabled: true } },
  });
  writeFile(
    gitHook(tempDir, "commit-msg"),
    'echo custom\ncommitment-issues commit-msg "$1"\n',
  );

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /commit-msg is customized/);
  assert.equal(countTerminalBoxes(output), 1);
  assert.equal(
    readFile(tempDir, ".git/hooks/commit-msg"),
    'echo custom\ncommitment-issues commit-msg "$1"\n',
  );
});

test("uninstall dry-run consolidates customized-hook cleanup", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const hook = gitHook(tempDir, "pre-commit");
  writeFile(hook, "echo custom\ncommitment-issues precommit\n");

  const result = runScript(tempDir, "uninstall", ["--dry-run"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /uninstall preview/i);
  assert.match(output, /Manual cleanup would still be needed/);
  assert.equal(countTerminalBoxes(output), 1);
  assert.equal(
    readFile(tempDir, ".git/hooks/pre-commit"),
    "echo custom\ncommitment-issues precommit\n",
  );
});

test("uninstall removes an appended prepare repair and preserves prepare", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    scripts: { prepare: "node build-assets.mjs" },
  });
  assert.equal(runScript(tempDir, "init").status, 0);
  assert.equal(
    readPackage(tempDir).scripts.prepare,
    "node build-assets.mjs && commitment-issues doctor --quiet",
  );

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;
  const pkg = readPackage(tempDir);

  assert.equal(result.status, 0);
  assert.deepEqual(pkg.scripts, { prepare: "node build-assets.mjs" });
  assert.match(output, /package\.json prepare repair/);
});

test("uninstall preserves customized scripts and hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    scripts: {
      prepare: "node build-assets.mjs",
      doctor: "node custom-doctor.mjs",
      "fix:staged": "commitment-issues fix-staged",
    },
    precommitChecks: { tone: "fun" },
  });
  fs.mkdirSync(path.join(tempDir, ".git", "hooks"), { recursive: true });
  fs.writeFileSync(
    gitHook(tempDir, "pre-commit"),
    "echo custom check\ncommitment-issues precommit\n",
  );

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  const pkg = readPackage(tempDir);
  assert.equal(pkg.scripts.prepare, "node build-assets.mjs");
  assert.equal(pkg.scripts.doctor, "node custom-doctor.mjs");
  assert.equal("fix:staged" in pkg.scripts, false);
  assert.equal("precommitChecks" in pkg, false);
  assert.equal(
    readFile(tempDir, ".git/hooks/pre-commit"),
    "echo custom check\ncommitment-issues precommit\n",
  );
  assert.match(output, /Manual cleanup still needed/);
  assert.match(output, /pre-commit is customized/);
  assert.equal(countTerminalBoxes(output), 1);
});

test("uninstall inspects an active custom hooks directory safely", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const customHooks = path.join(tempDir, "githooks");
  fs.mkdirSync(customHooks, { recursive: true });
  fs.writeFileSync(
    path.join(customHooks, "pre-commit"),
    hookBody("pre-commit"),
  );
  fs.writeFileSync(
    path.join(customHooks, "pre-push"),
    "echo custom push\ncommitment-issues prepush\n",
  );
  run("git", ["config", "core.hooksPath", "githooks"], tempDir);

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(customHooks, "pre-commit")), false);
  assert.equal(
    readFile(tempDir, "githooks/pre-push"),
    "echo custom push\ncommitment-issues prepush\n",
  );
  assert.match(output, /githooks\/pre-push is customized/);
});

test("uninstall displays absolute hook paths outside the project", (t) => {
  const tempDir = createTempRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-hooks-"));
  t.after(() => cleanupTempRepo(tempDir));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));

  fs.writeFileSync(path.join(external, "pre-commit"), hookBody("pre-commit"));
  fs.chmodSync(path.join(external, "pre-commit"), 0o755);
  run("git", ["config", "core.hooksPath", external], tempDir);

  const result = runScript(tempDir, "uninstall", ["--dry-run"]);

  assert.equal(result.status, 0);
  assert.match(
    compactTerminalBoxText(`${result.stdout}${result.stderr}`),
    new RegExp(external.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("uninstall reports legacy commands in an active Husky directory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);

  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal(
    readFile(tempDir, ".husky/pre-commit"),
    "commitment-issues precommit\n",
  );
  assert.match(output, /\.husky\/pre-commit is customized/);
});

test("uninstall does not inspect the native hooks directory twice", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  assert.equal(runScript(tempDir, "init").status, 0);
  run("git", ["config", "core.hooksPath", ".git/hooks"], tempDir);

  const result = runScript(tempDir, "uninstall");

  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("uninstall preserves a hook path it cannot inspect", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.mkdirSync(gitHook(tempDir, "pre-commit"), { recursive: true });
  const result = runScript(tempDir, "uninstall");
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal(fs.statSync(gitHook(tempDir, "pre-commit")).isDirectory(), true);
  assert.match(output, /pre-commit could not be inspected/);
  assert.match(output, /left unchanged/);
});

test("uninstall cleans package.json outside a git repository and warns", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-nongit-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  writePackage(tempDir, {
    name: "consumer",
    version: "1.0.0",
    scripts: { doctor: "commitment-issues doctor" },
    precommitChecks: { advisePushTests: true },
  });

  const result = run(
    "node",
    [path.join(repoRoot, "scripts", "uninstall.mjs")],
    tempDir,
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.equal("scripts" in readPackage(tempDir), false);
  assert.equal("precommitChecks" in readPackage(tempDir), false);
  assert.match(output, /not a git repository/);
});

test("uninstall errors clearly without a valid package.json", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-errors-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const missing = run(
    "node",
    [path.join(repoRoot, "scripts", "uninstall.mjs")],
    tempDir,
  );
  assert.equal(missing.status, 1);
  assert.match(`${missing.stdout}${missing.stderr}`, /No package\.json found/);

  writeFile(path.join(tempDir, "package.json"), "{ invalid\n");
  const invalid = run(
    "node",
    [path.join(repoRoot, "scripts", "uninstall.mjs")],
    tempDir,
  );
  assert.equal(invalid.status, 1);
  assert.match(`${invalid.stdout}${invalid.stderr}`, /Invalid package\.json/);
});
