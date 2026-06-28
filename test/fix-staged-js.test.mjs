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

function runFixStagedJs(tempDir, files) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "fix-staged-js.mjs"), ...files],
    tempDir,
  );
}

test("formats given files and exits 0 when everything is auto-fixable", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "fixme.js"), "export const x=1;\n");

  const result = runFixStagedJs(tempDir, ["src/fixme.js"]);

  assert.equal(result.status, 0);
  assert.equal(readFile(tempDir, "src/fixme.js"), "export const x = 1;\n");
});

test("exits 1 when a file has remaining non-fixable lint issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "broken.js"), "const unused=1\n");

  const result = runFixStagedJs(tempDir, ["src/broken.js"]);

  // ESLint cannot fix no-unused-vars, but Prettier still reformats the file.
  assert.equal(result.status, 1);
  assert.equal(readFile(tempDir, "src/broken.js"), "const unused = 1;\n");
});
