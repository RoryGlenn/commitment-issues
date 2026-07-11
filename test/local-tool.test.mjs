// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localToolInvocation } from "../scripts/lib/local-tool.mjs";

test("localToolInvocation resolves only a project node_modules bin", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-tool-"));
  try {
    const binDir = path.join(dir, "node_modules", ".bin");
    const nested = path.join(dir, "packages", "app");
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(binDir, "commitlint"), "#!/bin/sh\nexit 0\n");
    fs.writeFileSync(path.join(binDir, "commitlint.cmd"), "@exit /b 0\r\n");

    const args = ["--edit", "message file;literal"];
    const invocation = localToolInvocation("commitlint", args, nested);
    assert.ok(invocation);
    assert.match(invocation.command, /commitlint(?:\.cmd)?$/);
    assert.deepEqual(invocation.args, args);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("localToolInvocation has no npx, global PATH, or missing-tool fallback", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-tool-missing-"));
  try {
    assert.equal(
      localToolInvocation("definitely-not-installed-xyz", ["--help"], dir),
      null,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
