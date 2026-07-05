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
  stubBinEnv,
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

test("doctor accepts a custom hook that still invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring + exact hook bodies
  // A user adds their own line but keeps our subcommand — still healthy.
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "echo running my own lint step\ncommitment-issues precommit\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
});

test("doctor reports a pre-commit hook that never invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "echo my own unrelated hook\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  assert.match(output, /\.husky\/pre-commit/);
  // The user's own hook body must never be overwritten.
  assert.equal(
    fs.readFileSync(path.join(tempDir, ".husky", "pre-commit"), "utf8"),
    "echo my own unrelated hook\n",
  );
});

test("doctor reports a pre-push hook that never invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-push"),
    "echo my own unrelated hook\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  assert.match(output, /\.husky\/pre-push/);
  assert.equal(
    fs.readFileSync(path.join(tempDir, ".husky", "pre-push"), "utf8"),
    "echo my own unrelated hook\n",
  );
});

test("doctor --quiet warns but exits 0 when a hook does not invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "echo my own unrelated hook\n",
  );

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), "--quiet"],
    tempDir,
  );
  const output = `${result.stdout}${result.stderr}`;

  // Never break an install, but do not silently claim health either.
  assert.equal(result.status, 0);
  assert.match(output, /do not invoke commitment-issues/);
  assert.equal(
    fs.readFileSync(path.join(tempDir, ".husky", "pre-commit"), "utf8"),
    "echo my own unrelated hook\n",
  );
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

test("doctor errors (interactive) when there is no package.json", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-nopkg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // No --quiet: the "not applicable" guard prints a box and exits 1.
  const result = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs")],
    dir,
  );

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /No package\.json found/);
});

test("doctor reports failure when husky wiring cannot be repaired", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Stub `npx` so `npx husky` fails; the wiring repair cannot complete.
  const env = stubBinEnv(tempDir, "npx", 1);
  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs")],
    tempDir,
    { env },
  );

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Could not repair the Husky wiring/,
  );
});

test("doctor --quiet warns but never fails when repair cannot complete", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const env = stubBinEnv(tempDir, "npx", 1);
  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), "--quiet"],
    tempDir,
    { env },
  );

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /could not wire up git hooks/,
  );
});

test("doctor reports when the wiring is still broken after repair", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // `npx husky` "succeeds" but does nothing, so hooksPath stays unset and the
  // post-repair verification still finds the wiring broken.
  const env = stubBinEnv(tempDir, "npx", 0);
  const result = run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs")],
    tempDir,
    { env },
  );

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /still looks broken after repair/,
  );
});
