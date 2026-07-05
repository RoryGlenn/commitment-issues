import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";

test("precommit uses fun tone from package config", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { tone: "fun" });
  writeFile(
    path.join(tempDir, "src", "lonely.mjs"),
    "export const lonely = 1;\n",
  );

  run("git", ["add", "src/lonely.mjs"], tempDir);

  const result = run("node", ["scripts/precommit.mjs"], tempDir);
  const text = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(text, /Relationship notes/);
  assert.match(text, /Pre-commit suggestions found/);
});
