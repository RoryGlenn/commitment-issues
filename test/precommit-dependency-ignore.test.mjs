import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runHook(tempDir) {
  return run("node", [path.join(tempDir, "scripts", "precommit.mjs")], tempDir);
}

test("precommit ignores accidentally staged node_modules files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.rmSync(path.join(tempDir, "node_modules"), { recursive: true, force: true });
  writeFile(
    path.join(tempDir, "node_modules", "package-a", "index.js"),
    "const ignored = 1;\n",
  );
  run("git", ["add", "-f", "node_modules/package-a/index.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /No project files to check/);
  assert.doesNotMatch(output, /missing unit tests/);
  assert.doesNotMatch(output, /ESLint issue/);
});

test("precommit checks project files while ignoring staged node_modules files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.rmSync(path.join(tempDir, "node_modules"), { recursive: true, force: true });
  writeFile(
    path.join(tempDir, "node_modules", "package-a", "index.js"),
    "const ignored = 1;\n",
  );
  writeFile(path.join(tempDir, "src", "needs-test.js"), "export const x = 1;\n");
  run("git", ["add", "-f", "node_modules/package-a/index.js"], tempDir);
  run("git", ["add", "src/needs-test.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /1 staged source file missing unit tests/);
  assert.match(output, /src\/needs-test\.js/);
  assert.doesNotMatch(output, /node_modules\/package-a\/index\.js/);
});
