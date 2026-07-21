// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanupTempRepo,
  createTempRepo,
  repoRoot,
  run,
} from "./helpers/temp-repo.mjs";

const initScript = path.join(repoRoot, "scripts", "init.mjs");

function hookPath(repoDir, name) {
  const commonDir = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    repoDir,
  ).stdout.trim();
  return path.join(commonDir, "hooks", name);
}

function assertNativeHooks(repoDir) {
  for (const [name, invocation] of [
    ["pre-commit", /commitment-issues precommit/],
    ["pre-push", /commitment-issues prepush "\$@"/],
  ]) {
    const filePath = hookPath(repoDir, name);
    assert.match(fs.readFileSync(filePath, "utf8"), invocation);
  }
}

test("init wires native hooks in a shallow clone", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "commitment-shallow-"));
  const cloneDir = path.join(parent, "clone");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  const cloned = run(
    "git",
    ["clone", "--depth", "1", pathToFileURL(repoRoot).href, cloneDir],
    parent,
  );
  assert.equal(cloned.status, 0, cloned.stderr);
  assert.equal(
    run(
      "git",
      ["rev-parse", "--is-shallow-repository"],
      cloneDir,
    ).stdout.trim(),
    "true",
  );

  const result = run("node", [initScript], cloneDir);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assertNativeHooks(cloneDir);
});

test("init uses the submodule's own Git common directory", (t) => {
  const parent = createTempRepo();
  t.after(() => cleanupTempRepo(parent));
  const submoduleDir = path.join(parent, "vendor", "commitment-issues");

  const added = run(
    "git",
    [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      pathToFileURL(repoRoot).href,
      "vendor/commitment-issues",
    ],
    parent,
  );
  assert.equal(added.status, 0, added.stderr);

  const commonDir = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    submoduleDir,
  ).stdout.trim();
  assert.match(
    commonDir.replaceAll("\\", "/"),
    /\.git\/modules\/vendor\/commitment-issues$/,
  );

  const result = run("node", [initScript], submoduleDir);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assertNativeHooks(submoduleDir);
  assert.equal(
    fs.existsSync(path.join(parent, ".git", "hooks", "pre-commit")),
    false,
  );
});

test("temporary Git fixtures ignore inherited hook repository routing", (t) => {
  const caller = createTempRepo();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nested-git-fixture-"));
  t.after(() => cleanupTempRepo(caller));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const callerHead = run("git", ["rev-parse", "HEAD"], caller).stdout.trim();
  const callerGitDir = path.join(caller, ".git");
  const initialized = run("git", ["init"], fixture, {
    env: {
      ...process.env,
      GIT_DIR: callerGitDir,
      GIT_WORK_TREE: caller,
      GIT_INDEX_FILE: path.join(callerGitDir, "index"),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
    },
  });

  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(fs.existsSync(path.join(fixture, ".git")), true);
  assert.equal(
    run("git", ["rev-parse", "HEAD"], caller).stdout.trim(),
    callerHead,
  );
  assert.equal(
    run("git", ["config", "--bool", "core.bare"], caller).stdout.trim(),
    "false",
  );
});
