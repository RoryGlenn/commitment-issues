import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  readFile,
  repoRoot,
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
  assert.equal(pkg.scripts["commit:fix"], "commitment-issues commit-fix");
  assert.equal(pkg.scripts["fix:staged"], "commitment-issues fix-staged");
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
  assert.equal(pkg.scripts.prepare, "commitment-issues doctor --quiet");
  assert.equal(
    pkg["lint-staged"]["*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"][0],
    "commitment-issues fix-staged-js",
  );
  assert.equal(pkg.precommitChecks.advisePushTests, true);

  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-push")));
  assert.match(
    readFile(tempDir, ".husky/pre-commit"),
    /commitment-issues precommit/,
  );
  assert.match(
    readFile(tempDir, ".husky/pre-push"),
    /commitment-issues prepush/,
  );
  assert.match(readFile(tempDir, ".gitignore"), /\.prettiercache/);

  // Re-running changes nothing.
  const second = runInit(tempDir);
  assert.equal(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /Already configured/);
});

test("init upgrades a legacy 1.x (vendored) setup to the bin", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(
      {
        name: "x",
        version: "1.0.0",
        type: "module",
        scripts: {
          prepare: "husky",
          "commit:fix": "node scripts/commit-fix.mjs",
          "fix:staged": "node scripts/fix-staged.mjs",
          "test:precommit": "node scripts/precommit-unified.mjs",
          doctor: "node scripts/doctor.mjs",
        },
        "lint-staged": {
          "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
            "node scripts/fix-staged-js.mjs",
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "node scripts/precommit-unified.mjs\n",
  );
  writeFile(
    path.join(tempDir, ".husky", "pre-push"),
    "node scripts/prepush.mjs\n",
  );

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  assert.equal(pkg.scripts.prepare, "commitment-issues doctor --quiet");
  assert.equal(pkg.scripts["commit:fix"], "commitment-issues commit-fix");
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
  assert.equal(pkg.precommitChecks.advisePushTests, true);
  assert.equal(
    pkg["lint-staged"]["*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"][0],
    "commitment-issues fix-staged-js",
  );
  assert.match(
    readFile(tempDir, ".husky/pre-commit"),
    /commitment-issues precommit/,
  );
  assert.match(
    readFile(tempDir, ".husky/pre-push"),
    /commitment-issues prepush/,
  );
});

test("init preserves explicit push blocking config", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(
      {
        name: "x",
        version: "1.0.0",
        type: "module",
        precommitChecks: {
          blockPushOnTestFailure: true,
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  assert.equal(pkg.precommitChecks.blockPushOnTestFailure, true);
  assert.equal("advisePushTests" in pkg.precommitChecks, false);
});

test("init leaves a customized hook untouched", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify({ name: "x", version: "1.0.0", type: "module" }, null, 2)}\n`,
  );
  writeFile(path.join(tempDir, ".husky", "pre-commit"), "echo custom hook\n");

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  // A non-legacy body is a user's own hook — never clobber it.
  assert.equal(readFile(tempDir, ".husky/pre-commit"), "echo custom hook\n");
});

test("init errors and exits when there is no package.json", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-nopkg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Run the real script (resolves its own lib/ imports) from a dir with no
  // package.json to hit the early "run this from your project root" guard.
  const result = run("node", [path.join(repoRoot, "scripts", "init.mjs")], dir);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /No package\.json found/);
});

test("init creates a .gitignore when none exists", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.rmSync(path.join(tempDir, ".gitignore"), { force: true });
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify({ name: "x", version: "1.0.0", type: "module" }, null, 2)}\n`,
  );

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.match(readFile(tempDir, ".gitignore"), /\.eslintcache/);
});

test("init appends caches to a .gitignore with no trailing newline", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, ".gitignore"), "dist");
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify({ name: "x", version: "1.0.0", type: "module" }, null, 2)}\n`,
  );

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.match(readFile(tempDir, ".gitignore"), /dist\n\.eslintcache/);
});
