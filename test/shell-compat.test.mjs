// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runLauncher(args) {
  const env = { ...process.env };
  delete env.SHELL_COMPAT_TARGET;
  return spawnSync(
    process.execPath,
    ["tools/run-shell-compat-test.mjs", ...args],
    { cwd: root, env, encoding: "utf8" },
  );
}

test("shell compatibility launcher rejects missing and malformed inputs", () => {
  const missing = runLauncher([]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /A shell target is required/u);

  const unsupported = runLauncher(["xonsh"]);
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /Unsupported shell target "xonsh"/u);

  const missingTarball = runLauncher(["sh", "--tarball"]);
  assert.equal(missingTarball.status, 1);
  assert.match(missingTarball.stderr, /--tarball requires a path/u);

  const unknownOption = runLauncher(["sh", "--network"]);
  assert.equal(unknownOption.status, 1);
  assert.match(unknownOption.stderr, /Unknown shell compatibility option/u);
});

test("tracked shell adapters expose the same black-box actions", () => {
  const fixtures = [
    "test/fixtures/shell-compat/invoke.sh",
    "test/fixtures/shell-compat/invoke.fish",
    "test/fixtures/shell-compat/invoke.ps1",
    "test/fixtures/shell-compat/invoke.cmd",
  ];
  for (const fixture of fixtures) {
    const contents = read(fixture);
    assert.doesNotMatch(contents, /\r/u, `${fixture} should use LF endings`);
    for (const action of [
      "version",
      "init",
      "commit",
      "push",
      "doctor",
      "uninstall",
    ]) {
      assert.match(contents, new RegExp(`\\b${action}\\b`, "u"));
    }
  }

  assert.match(read(fixtures[0]), /^#!\/bin\/sh\n/u);
  assert.match(read(fixtures[1]), /^#!\/usr\/bin\/env fish\n/u);
  assert.match(read(fixtures[2]), /OutputEncoding/u);
  assert.match(read(fixtures[3]), /call "%SHELL_COMPAT_BIN%"/u);
});

test("required CI runs the packed shell matrix behind the aggregate gate", () => {
  const workflow = read(".github/workflows/ci.yml");
  const job = workflow
    .split(/^ {2}shell-compat:$/mu)[1]
    ?.split(/^ {2}pm-lifecycle:$/mu)[0];
  assert.ok(job, "ci.yml should define the shell-compat job");

  const matrix = [
    ["Linux /bin/sh", "ubuntu-latest", "sh"],
    ["Linux Bash", "ubuntu-latest", "bash"],
    ["Linux Fish", "ubuntu-latest", "fish"],
    ["macOS /bin/sh", "macos-latest", "sh"],
    ["macOS Zsh", "macos-latest", "zsh"],
    ["Windows PowerShell", "windows-latest", "powershell"],
    ["Windows Command Prompt", "windows-latest", "cmd"],
  ];
  for (const [name, os, target] of matrix) {
    assert.match(
      job,
      new RegExp(
        `- name: ${escapeRegExp(name)}\\s+os: ${os}\\s+target: ${target}`,
        "u",
      ),
    );
  }
  assert.equal(
    (job.match(/^\s+- name: (?:Linux|macOS|Windows)/gmu) ?? []).length,
    7,
  );
  assert.match(job, /node-version: "24"/u);
  assert.match(job, /if: matrix\.target == 'fish'/u);
  assert.match(job, /sudo apt-get update && sudo apt-get install --yes fish/u);
  assert.match(job, /SHELL_COMPAT_TARGET: \$\{\{ matrix\.target \}\}/u);
  assert.match(job, /run: npm run test:shell-compat/u);
  assert.doesNotMatch(job, /run:[^\n]*\$\{\{/u);

  const aggregate = workflow.split(/^ {2}ci-success:$/mu)[1] ?? "";
  assert.match(aggregate, /shell-compat/u);
  assert.match(aggregate, /needs\['shell-compat'\]\.result != 'success'/u);
});

test("black-box shell scenario keeps the compatibility boundary hostile and offline", () => {
  const launcher = read("tools/run-shell-compat-test.mjs");
  assert.match(launcher, /path \$cash & tea café/u);
  assert.match(launcher, /"-ExecutionPolicy"/u);
  assert.match(launcher, /npm_config_offline = "true"/u);
  assert.match(launcher, /"--offline"/u);
  assert.match(
    launcher,
    /\[rootPackage\.name\]: localPackageSpec\(repoDir, tarball\)/u,
  );
  assert.match(launcher, /Object\.keys\(rootPackage\.dependencies/u);
  assert.match(launcher, /Object\.keys\(rootPackage\.peerDependencies/u);
  assert.match(launcher, /project-owned hook remains untouched/u);
  assert.match(launcher, /body\.startsWith\("#!\/bin\/sh\\n"\)/u);
  assert.match(launcher, /!body\.includes\("\\r"\)/u);
  assert.match(launcher, /fs\.statSync\(hookPath\)\.mode & 0o111/u);
  assert.match(launcher, /const strippedEnv = withPath/u);
  assert.match(launcher, /Running tests for pushed files/u);
  assert.match(launcher, /Git hooks are healthy/u);
  assert.match(launcher, /Commitment Issues setup was removed/u);
  assert.doesNotMatch(launcher, /shell:\s*true/u);
});

test("documentation separates automated shells from manual Git clients", () => {
  const compatibility = read("docs/compatibility.md");
  const faq = read("docs/faq.md");
  const checklist = read("docs/git-client-release-checklist.md");
  const index = read("docs/index.md");
  const definition = read("docs/definition-of-done.md");

  for (const target of [
    "POSIX `/bin/sh`",
    "Bash and Fish",
    "Zsh",
    "Windows PowerShell and Command Prompt",
  ]) {
    assert.match(compatibility, new RegExp(escapeRegExp(target), "u"));
  }
  assert.match(compatibility, /Manual release check/u);
  assert.match(compatibility, /GUI Git-client checklist/u);
  assert.match(faq, /integrated terminal proves its selected shell/iu);
  assert.doesNotMatch(faq, /Until\s+\[#83\]/u);

  for (const client of [
    "VS Code Source Control",
    "IntelliJ IDEA or PyCharm",
    "GitHub Desktop on macOS",
    "GitHub Desktop on Windows",
  ]) {
    assert.match(checklist, new RegExp(escapeRegExp(client), "u"));
  }
  assert.match(checklist, /exact release-candidate tarball/u);
  assert.match(index, /git-client-release-checklist\.md/u);
  assert.match(definition, /GUI Git-client checklist/u);
});
