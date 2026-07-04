import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  readFile,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runInit(tempDir) {
  return run("node", [path.join(tempDir, "scripts", "init.mjs")], tempDir);
}

test("init adds node_modules to gitignore defaults", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, ".gitignore"), "dist\n");

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const gitignore = readFile(tempDir, ".gitignore");
  assert.match(gitignore, /^dist$/m);
  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^\.eslintcache$/m);
  assert.match(gitignore, /^\.prettiercache$/m);
});

test("init does not duplicate an existing node_modules gitignore entry", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, ".gitignore"), "node_modules\n");

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const nodeModulesEntries = readFile(tempDir, ".gitignore")
    .split("\n")
    .map((line) => line.trim().replace(/\/$/, ""))
    .filter((line) => line === "node_modules");
  assert.equal(nodeModulesEntries.length, 1);
});
