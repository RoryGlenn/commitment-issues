import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cleanupTempRepo, createTempRepo, run } from "./helpers/temp-repo.mjs";

function runDoctor(tempDir, args = []) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), ...args],
    tempDir,
  );
}

test("doctor accepts custom hooks that invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "echo before\ncommitment-issues precommit\necho after\n",
  );
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-push"),
    "echo before\ncommitment-issues prepush\necho after\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
});

test("doctor reports custom hooks that do not invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  const customBody = "echo custom commit\n";
  fs.writeFileSync(path.join(tempDir, ".husky", "pre-commit"), customBody);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /not wired into every hook/);
  assert.match(output, /pre-commit exists but does not invoke/);
  assert.match(output, /commitment-issues precommit/);
  assert.equal(
    fs.readFileSync(path.join(tempDir, ".husky", "pre-commit"), "utf8"),
    customBody,
  );
});

test("doctor --quiet warns but succeeds for custom hooks without command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-push"),
    "echo custom push\n",
  );

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /custom hooks do not invoke commitment-issues/);
});
