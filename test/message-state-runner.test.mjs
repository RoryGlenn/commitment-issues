// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "tools", "show-message-states.mjs");

function runRunner(args, env = process.env) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

test("message-state runner accepts an expected blocking exit", () => {
  const result = runRunner(["precommit/protected-branch-block"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /precommit\/protected-branch-block/);
  assert.match(result.stdout, /exit 1/);
  assert.doesNotMatch(result.stdout, /expected exit 0/);
});

test("message-state runner fails overall when scenario setup fails", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "states-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const notDirectory = path.join(tempDir, "not-a-directory");
  fs.writeFileSync(notDirectory, "file");

  const result = runRunner(["precommit/all-passed"], {
    ...process.env,
    TMPDIR: notDirectory,
    TEMP: notDirectory,
    TMP: notDirectory,
  });

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /scenario error:/);
});

test("message-state runner removes NO_COLOR before forcing child color", () => {
  const result = runRunner(["precommit/all-passed"], {
    ...process.env,
    NO_COLOR: "1",
  });

  assert.equal(result.status, 0);
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    /NO_COLOR[^\n]*FORCE_COLOR|FORCE_COLOR[^\n]*NO_COLOR/i,
  );
});

test("message-state runner explicitly keeps success gallery states visible", () => {
  const result = runRunner(["precommit/all-passed"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /All pre-commit checks passed/);
  assert.match(result.stdout, /success/);
});
