import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  repoRoot,
  run,
} from "./helpers/temp-repo.mjs";

function runDoctor(tempDir) {
  return run("node", [path.join(tempDir, "scripts", "doctor.mjs")], tempDir);
}

function hooksPath(tempDir) {
  return run(
    "git",
    ["config", "--get", "core.hooksPath"],
    tempDir,
  ).stdout.trim();
}

test("doctor repairs a repo with no husky wiring", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.equal(hooksPath(tempDir), ".husky/_");
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "_", "pre-commit")));
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-push")));
});

test("doctor reports healthy once everything is wired", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // first run repairs
  const result = runDoctor(tempDir); // second run: nothing to fix
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
});

test("doctor restores wiring after .husky/_ is removed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.rmSync(path.join(tempDir, ".husky", "_"), {
    recursive: true,
    force: true,
  });

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "_", "pre-push")));
});

test("doctor recreates a missing hook file", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring + hook files
  fs.rmSync(path.join(tempDir, ".husky", "pre-push"), { force: true });

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-push")));
});

test("doctor --quiet stays silent when the wiring is healthy", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), "--quiet"],
    tempDir,
  );

  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.trim(), "");
});

test("doctor --quiet repairs and reports in one line", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), "--quiet"],
    tempDir,
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /repaired git hooks/);
  assert.equal(hooksPath(tempDir), ".husky/_");
});

test("doctor --quiet never breaks an install outside a git repo", (t) => {
  // Simulates `prepare` running during `npm install` in CI/Docker with no .git.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-nongit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}\n');

  const result = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs"), "--quiet"],
    dir,
  );

  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.trim(), "");
});
