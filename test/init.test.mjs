import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

test("init wires up hooks, scripts, and config; is idempotent", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Start from a bare package.json so init has work to do.
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify({ name: "x", version: "1.0.0", private: true, type: "module" }, null, 2)}\n`,
  );

  const first = runInit(tempDir);
  assert.equal(first.status, 0);

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  assert.equal(pkg.scripts["commit:fix"], "node scripts/commit-fix.mjs");
  assert.equal(pkg.scripts["fix:staged"], "node scripts/fix-staged.mjs");
  assert.equal(pkg.scripts.doctor, "node scripts/doctor.mjs");
  assert.equal(pkg.scripts.prepare, "node scripts/doctor.mjs --quiet");
  assert.ok(pkg["lint-staged"]);
  assert.ok(pkg.precommitChecks);

  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-push")));
  assert.match(readFile(tempDir, ".gitignore"), /\.prettiercache/);

  // Re-running changes nothing.
  const second = runInit(tempDir);
  assert.equal(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /Already configured/);
});
