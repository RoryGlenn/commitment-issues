// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  run,
  localToolInvocation,
  toolInvocation,
  runTool,
  spawnAsync,
  isPackageInstalled,
} from "../scripts/lib/process.mjs";

test("toolInvocation resolves a local bin and runs it via the current Node", () => {
  const eslint = toolInvocation("eslint", ["--version"]);
  assert.equal(eslint.command, process.execPath);
  assert.match(eslint.args[0], /eslint/);

  const prettier = toolInvocation("prettier", ["--version"]);
  assert.equal(prettier.command, process.execPath);
  assert.match(prettier.args[0], /prettier/);
});

test("toolInvocation falls back to npx for an unresolved tool", () => {
  const inv = toolInvocation("definitely-not-installed-xyz", ["--help"]);
  assert.equal(inv.command, "npx");
  assert.deepEqual(inv.args, ["definitely-not-installed-xyz", "--help"]);
});

test("toolInvocation falls back to npx for a resolvable package with no bin", () => {
  // picocolors is installed (its package.json resolves) but exposes no `bin`,
  // so resolveTool returns null and we fall back to npx.
  const inv = toolInvocation("picocolors", ["--help"]);
  assert.equal(inv.command, "npx");
  assert.deepEqual(inv.args, ["picocolors", "--help"]);
});

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

test("isPackageInstalled resolves a package present in the project", () => {
  // Resolves from process.cwd() (the repo root under `npm test`), where these
  // are installed, using the same manifest resolution the hooks rely on.
  assert.equal(isPackageInstalled("eslint"), true);
  assert.equal(isPackageInstalled("picocolors"), true);
});

test("isPackageInstalled reports a package that cannot be resolved", () => {
  assert.equal(isPackageInstalled("definitely-not-installed-xyz"), false);
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

test("runTool runs a resolved tool synchronously", () => {
  const result = runTool("prettier", ["--version"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+\.\d+/);
});

test("spawnAsync captures output and resolves a status", async () => {
  const result = await spawnAsync("node", [
    "-e",
    "process.stdout.write('out'); process.stderr.write('err')",
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "out");
  assert.equal(result.stderr, "err");
});

test("spawnAsync resolves an error for a missing binary", async () => {
  const result = await spawnAsync("definitely-not-a-real-binary-xyz", []);
  assert.ok(result.error);
  assert.equal(result.status, null);
});

test("spawnAsync resolves an error when spawn throws synchronously", async () => {
  // An invalid `cwd` makes the spawn throw synchronously; spawnAsync must catch
  // it and resolve a result rather than letting the throw escape.
  const result = await spawnAsync("node", ["-v"], { cwd: 12345 });
  assert.ok(result.error);
  assert.equal(result.status, null);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("spawnAsync reports a non-zero status", async () => {
  const result = await spawnAsync("node", ["-e", "process.exit(3)"]);
  assert.equal(result.status, 3);
});

test("spawnAsync with echo tees output while capturing it", async () => {
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

test("test environment still resolves path module", () => {
  assert.equal(path.basename("a/b.js"), "b.js");
});
