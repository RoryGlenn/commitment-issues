import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { cleanupTempRepo, createTempRepo, run } from "./helpers/temp-repo.mjs";

function cli(tempDir, args) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "cli.mjs"), ...args],
    tempDir,
  );
}

test("cli prints usage and exits 0 for --help", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /commitment-issues <command>/);
  assert.match(result.stdout, /init, doctor, precommit/);
});

test("cli errors on an unknown command", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["bogus"]);
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /unknown command 'bogus'/);
});

test("cli dispatches to doctor", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = cli(tempDir, ["doctor"]);
  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Repaired the git hook wiring|Git hooks are healthy/,
  );
});

test("cli dispatches to precommit", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Nothing is staged in a fresh temp repo, so precommit is a clean no-op.
  const result = cli(tempDir, ["precommit"]);
  assert.equal(result.status, 0);
});

test("cli forwards arguments to the subcommand", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  cli(tempDir, ["doctor"]); // establish healthy wiring
  const result = cli(tempDir, ["doctor", "--quiet"]);
  assert.equal(result.status, 0);
  // `--quiet` reached doctor: silent when already healthy.
  assert.equal(`${result.stdout}${result.stderr}`.trim(), "");
});
