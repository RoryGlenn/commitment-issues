// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { MAX_TIMEOUT_MS } from "../scripts/lib/config.mjs";
import {
  run,
  toolInvocation,
  runTool,
  spawnAsync,
  isPackageInstalled,
  isToolInstalled,
} from "../scripts/lib/process.mjs";

test("toolInvocation resolves a local bin and runs it via the current Node", () => {
  const eslint = toolInvocation("eslint", ["--version"]);
  assert.equal(eslint.command, process.execPath);
  assert.match(eslint.args[0], /eslint/);

  const prettier = toolInvocation("prettier", ["--version"]);
  assert.equal(prettier.command, process.execPath);
  assert.match(prettier.args[0], /prettier/);
});

test("toolInvocation returns a missing-tool invocation without npx", () => {
  const inv = toolInvocation("definitely-not-installed-xyz", ["--help"]);
  assert.equal(inv.command, null);
  assert.deepEqual(inv.args, []);
  assert.equal(inv.missingTool, "definitely-not-installed-xyz");
});

test("toolInvocation reports a resolvable package with no bin as missing", () => {
  // picocolors is installed (its package.json resolves) but exposes no `bin`,
  // so it cannot be executed as a tool.
  const inv = toolInvocation("picocolors", ["--help"]);
  assert.equal(inv.command, null);
  assert.deepEqual(inv.args, []);
  assert.equal(inv.missingTool, "picocolors");
});

test("toolInvocation resolves only from the selected project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-project-"));
  try {
    assert.equal(
      toolInvocation("eslint", ["--version"], dir).missingTool,
      "eslint",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isPackageInstalled resolves a package present in the project", () => {
  // Resolves from process.cwd() (the repo root under `npm test`), where these
  // are installed, using the same manifest resolution the hooks rely on.
  assert.equal(isPackageInstalled("eslint"), true);
  assert.equal(isPackageInstalled("picocolors"), true);
});

test("isPackageInstalled reports a package that cannot be resolved", () => {
  assert.equal(isPackageInstalled("definitely-not-installed-xyz"), false);
});

test("isToolInstalled requires a real package bin", () => {
  assert.equal(isToolInstalled("eslint"), true);
  assert.equal(isToolInstalled("picocolors"), false);
});

test("isPackageInstalled resolves relative to the given project root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-installed-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"host"}\n');
    // A dependency present in this project's node_modules resolves...
    const pkgDir = path.join(dir, "node_modules", "present-dep");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      '{"name":"present-dep","version":"1.0.0"}\n',
    );
    assert.equal(isPackageInstalled("present-dep", dir), true);
    // ...while one that is not installed there does not.
    assert.equal(isPackageInstalled("absent-dep", dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("run captures stdout synchronously", () => {
  const result = run("node", ["-e", "process.stdout.write('hi')"]);
  assert.equal(result.outcome, "success");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "hi");
});

test("run passes a space-containing argument as a single argv", () => {
  // cross-spawn runs without shell:true, so an argument with spaces must arrive
  // intact rather than being word-split by a shell (the Windows footgun this
  // migration removes). This also keeps us clear of the Node DEP0190 warning.
  const result = run("node", [
    "-e",
    "process.stdout.write(process.argv[1])",
    "hello world",
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "hello world");
});

test("run passes shell-sensitive tokens as literal argv", () => {
  const tokens = [
    "has space",
    "quote'file",
    "semi;colon",
    "unicode-猫",
    "glob[abc].js",
    String.raw`windows\\path.js`,
  ];

  const result = run("node", [
    "-e",
    "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
    ...tokens,
  ]);

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), tokens);
});

test("runTool runs a resolved local tool", async () => {
  const result = await runTool("prettier", ["--version"]);
  assert.equal(result.outcome, "success");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+\.\d+/);
});

test("runTool returns missing-tool without invoking a command fallback", async () => {
  const result = await runTool("definitely-not-installed-xyz", ["--help"]);
  assert.equal(result.outcome, "missing-tool");
  assert.equal(result.missingTool, "definitely-not-installed-xyz");
  assert.equal(result.status, null);
  assert.equal(result.error, undefined);
});

test("spawnAsync captures output and resolves a status", async () => {
  const result = await spawnAsync("node", [
    "-e",
    "process.stdout.write('out'); process.stderr.write('err')",
  ]);
  assert.equal(result.outcome, "success");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "out");
  assert.equal(result.stderr, "err");
});

test("spawnAsync resolves an error for a missing binary", async () => {
  const result = await spawnAsync("definitely-not-a-real-binary-xyz", []);
  assert.equal(result.outcome, "spawn-error");
  assert.ok(result.error);
  assert.equal(result.status, null);
});

test("spawnAsync resolves an error when spawn throws synchronously", async () => {
  // An invalid `cwd` makes the spawn throw synchronously; spawnAsync must catch
  // it and resolve a result rather than letting the throw escape.
  const result = await spawnAsync("node", ["-v"], { cwd: 12345 });
  assert.equal(result.outcome, "spawn-error");
  assert.ok(result.error);
  assert.equal(result.status, null);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("spawnAsync enforces Node's maximum timer delay", async () => {
  const accepted = await spawnAsync(
    "node",
    ["-e", "process.stdout.write('ok')"],
    { timeoutMs: MAX_TIMEOUT_MS },
  );
  assert.equal(accepted.outcome, "success");
  assert.equal(accepted.stdout, "ok");

  const rejected = await spawnAsync("node", ["-e", "process.exit(0)"], {
    timeoutMs: MAX_TIMEOUT_MS + 1,
  });
  assert.equal(rejected.outcome, "spawn-error");
  assert.equal(rejected.error?.code, "ERR_OUT_OF_RANGE");
  assert.match(rejected.error?.message ?? "", /2147483647/);
});

test("spawnAsync reports a non-zero status", async () => {
  const result = await spawnAsync("node", ["-e", "process.exit(3)"]);
  assert.equal(result.outcome, "nonzero");
  assert.equal(result.status, 3);
});

test("spawnAsync with echo tees output while capturing it", async () => {
  // Let the test reporter flush the previous result before temporarily
  // replacing its stdout writer.
  await delay(10);
  const original = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  let echoed = "";
  // Capture without forwarding so the child's output doesn't pollute the runner.
  process.stdout.write = (chunk) => {
    echoed += chunk;
    return true;
  };
  process.stderr.write = (chunk) => {
    echoed += chunk;
    return true;
  };
  try {
    const result = await spawnAsync(
      "node",
      ["-e", "process.stdout.write('teed'); process.stderr.write('errteed')"],
      { echo: true },
    );
    assert.equal(result.stdout, "teed");
    assert.equal(result.stderr, "errteed");
    assert.match(echoed, /teed/);
    assert.match(echoed, /errteed/);
  } finally {
    process.stdout.write = original;
    process.stderr.write = originalErr;
  }
});

test(
  "spawnAsync distinguishes termination by signal",
  { skip: process.platform === "win32" },
  async () => {
    const result = await spawnAsync("node", [
      "-e",
      "process.kill(process.pid, 'SIGTERM')",
    ]);
    assert.equal(result.outcome, "signal");
    assert.equal(result.signal, "SIGTERM");
  },
);

test("spawnAsync reports timeout separately and cleans up grandchildren", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "process-tree-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const heartbeat = path.join(dir, "grandchild-heartbeat");
  const pidFile = path.join(dir, "grandchild-pid");
  const grandchild = [
    "const fs = require('node:fs');",
    `const heartbeat = ${JSON.stringify(heartbeat)};`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
    "let beat = 0;",
    "fs.writeFileSync(heartbeat, String(beat));",
    "setInterval(() => fs.writeFileSync(heartbeat, String(++beat)), 50);",
  ].join("\n");
  const parent = [
    "const { spawn } = require('node:child_process');",
    `spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });`,
    "setInterval(() => {}, 1000);",
  ].join("\n");

  const result = await spawnAsync("node", ["-e", parent], { timeoutMs: 1000 });
  assert.equal(result.outcome, "timeout");
  assert.equal(result.timedOut, true);
  assert.match(
    result.cleanup,
    /process-group|taskkill-tree|direct-child|already-exited/,
  );

  assert.equal(fs.existsSync(pidFile), true, "grandchild should start");
  const grandchildPid = Number(fs.readFileSync(pidFile, "utf8"));
  const beatAtTimeout = fs.readFileSync(heartbeat, "utf8");
  await delay(350);
  const beatAfterTimeout = fs.readFileSync(heartbeat, "utf8");
  if (beatAfterTimeout !== beatAtTimeout) {
    try {
      process.kill(grandchildPid, "SIGKILL");
    } catch {
      // It may have exited between the heartbeat read and cleanup attempt.
    }
  }
  assert.equal(beatAfterTimeout, beatAtTimeout);
});

test("test environment still resolves path module", () => {
  assert.equal(path.basename("a/b.js"), "b.js");
});
