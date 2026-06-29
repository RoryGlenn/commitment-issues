import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPrecommitConfig } from "../scripts/lib/config.mjs";

test("loadPrecommitConfig reads precommitChecks from package.json", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ precommitChecks: { runStagedTests: true } }),
  );
  process.chdir(dir);
  assert.deepEqual(loadPrecommitConfig(), { runStagedTests: true });
});

test("loadPrecommitConfig returns {} when package.json is missing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.chdir(dir);
  assert.deepEqual(loadPrecommitConfig(), {});
});

test("loadPrecommitConfig returns {} when precommitChecks is absent", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  const cwd = process.cwd();
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "x" }),
  );
  process.chdir(dir);
  assert.deepEqual(loadPrecommitConfig(), {});
});
