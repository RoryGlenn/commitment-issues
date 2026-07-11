// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyHook,
  hookBody,
  hookCommand,
  hookNamesForConfig,
  writeHook,
} from "../scripts/lib/hooks.mjs";

test("commit-msg wiring is opt-in and quotes Git's message-file argument", () => {
  assert.deepEqual(hookNamesForConfig({}), ["pre-commit", "pre-push"]);
  assert.deepEqual(hookNamesForConfig({ commitMessage: { enabled: false } }), [
    "pre-commit",
    "pre-push",
  ]);
  assert.deepEqual(hookNamesForConfig({ commitMessage: { enabled: true } }), [
    "pre-commit",
    "pre-push",
    "commit-msg",
  ]);
  assert.equal(hookCommand("commit-msg"), 'commitment-issues commit-msg "$1"');
  assert.match(hookBody("commit-msg"), /commitment-issues commit-msg "\$1"/);
});

test("generated commit-msg hooks are executable and exact-match owned", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-msg-hook-"));
  try {
    writeHook(dir, "commit-msg");
    const hookPath = path.join(dir, "commit-msg");
    assert.equal(fs.readFileSync(hookPath, "utf8"), hookBody("commit-msg"));
    assert.equal(classifyHook(dir, "commit-msg"), "wired");
    if (process.platform !== "win32") {
      assert.ok(fs.statSync(hookPath).mode & 0o111);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("custom commit-msg hooks require the safely quoted invocation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "custom-commit-msg-"));
  try {
    const hookPath = path.join(dir, "commit-msg");
    fs.writeFileSync(hookPath, "commitment-issues commit-msg $1\n");
    assert.equal(classifyHook(dir, "commit-msg"), "custom-without-command");

    fs.writeFileSync(
      hookPath,
      '# commitment-issues commit-msg "$1"\necho custom\n',
    );
    assert.equal(classifyHook(dir, "commit-msg"), "custom-without-command");

    fs.writeFileSync(
      hookPath,
      'echo custom\ncommitment-issues commit-msg "$1"\n',
    );
    assert.equal(classifyHook(dir, "commit-msg"), "custom-with-command");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
