import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  isWindows,
  run,
  toolInvocation,
  runTool,
  spawnAsync,
} from "../scripts/lib/process.mjs";

test("toolInvocation resolves a local bin and runs it via the current Node", () => {
  const eslint = toolInvocation("eslint", ["--version"]);
  assert.equal(eslint.command, process.execPath);
  assert.match(eslint.args[0], /eslint/);
  assert.equal(eslint.shell, false);

  const prettier = toolInvocation("prettier", ["--version"]);
  assert.equal(prettier.command, process.execPath);
  assert.match(prettier.args[0], /prettier/);
});

test("toolInvocation falls back to npx for an unresolved tool", () => {
  const inv = toolInvocation("definitely-not-installed-xyz", ["--help"]);
  assert.equal(inv.command, "npx");
  assert.deepEqual(inv.args, ["definitely-not-installed-xyz", "--help"]);
  assert.equal(inv.shell, isWindows);
});

test("run captures stdout synchronously", () => {
  const result = run("node", ["-e", "process.stdout.write('hi')"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "hi");
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
