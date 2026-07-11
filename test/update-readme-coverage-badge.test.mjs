// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

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

function fakeNpmEnv(tempDir, { output = "", status = 0, signal = "" } = {}) {
  const binDir = path.join(tempDir, ".fakebin");
  fs.mkdirSync(binDir, { recursive: true });

  const shimPath = path.join(binDir, "npm-shim.mjs");
  writeFile(
    shimPath,
    [
      "const args = process.argv.slice(2);",
      'if (args.length === 2 && args[0] === "run" && args[1] === "test:coverage") {',
      '  process.stdout.write(process.env.FAKE_NPM_OUTPUT || "");',
      "  if (process.env.FAKE_NPM_SIGNAL) {",
      "    process.kill(process.pid, process.env.FAKE_NPM_SIGNAL);",
      "  }",
      '  process.exit(Number.parseInt(process.env.FAKE_NPM_STATUS || "0", 10));',
      "}",
      'process.stderr.write(`unexpected npm args: ${args.join(" ")}\\n`);',
      "process.exit(2);",
      "",
    ].join("\n"),
  );

  const unixShimPath = path.join(binDir, "npm");
  writeFile(unixShimPath, `#!/bin/sh\nexec node "${shimPath}" "$@"\n`);
  fs.chmodSync(unixShimPath, 0o755);
  writeFile(path.join(binDir, "npm.cmd"), `@node "${shimPath}" %*\r\n`);

  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_NPM_OUTPUT: output,
    FAKE_NPM_STATUS: String(status),
    FAKE_NPM_SIGNAL: signal,
  };
}

test("updates README badge from test:coverage output", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  writeFile(
    readmePath,
    "[![Branch coverage: 93.13%](https://img.shields.io/badge/branch%20coverage-93.13%25-brightgreen.svg)](docs/branch-coverage.md)\n",
  );

  const coverageOutput = [
    "start of coverage report",
    "all files | 99.99 | 88.88 | 100.00 |",
    "end of coverage report",
    "",
  ].join("\n");

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    { env: fakeNpmEnv(tempDir, { output: coverageOutput, status: 0 }) },
  );

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Updated README branch coverage badge to 88.9%/,
  );
  assert.match(
    fs.readFileSync(readmePath, "utf8"),
    /Branch coverage: 88\.9%\]\(https:\/\/img\.shields\.io\/badge\/branch%20coverage-88\.9%25-green\.svg\)/,
  );
});

test("exits non-zero when test:coverage fails", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme =
    "[![Branch coverage: 93.13%](https://img.shields.io/badge/branch%20coverage-93.13%25-brightgreen.svg)](docs/branch-coverage.md)\n";
  writeFile(readmePath, initialReadme);

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "coverage failed\n",
        status: 1,
      }),
    },
  );

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /coverage failed/);
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});

test("reports when the badge is already up to date", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme =
    "[![Branch coverage: 88.9%](https://img.shields.io/badge/branch%20coverage-88.9%25-green.svg)](docs/branch-coverage.md)\n";
  writeFile(readmePath, initialReadme);

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "all files | 99.99 | 88.88 | 100.00 |\n",
        status: 0,
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /README branch coverage badge is up to date \(88\.9%\)/,
  );
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});

test("errors when coverage output cannot be parsed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme = fs.readFileSync(readmePath, "utf8");

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "tests passed but no coverage table\n",
        status: 0,
      }),
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Could not parse branch coverage from test output/,
  );
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});

test("errors when npm cannot be spawned", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A PATH with no npm on it makes the spawn itself fail (ENOENT).
  const emptyBinDir = path.join(tempDir, ".emptybin");
  fs.mkdirSync(emptyBinDir, { recursive: true });

  const result = run(
    process.execPath,
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    { env: { ...process.env, PATH: emptyBinDir } },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /ENOENT/);
});

test("exits 1 when the coverage run is killed by a signal", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme = fs.readFileSync(readmePath, "utf8");

  // A signal-killed npm run reports status null (POSIX) or a non-zero code
  // (Windows); either way the script must fail instead of "succeeding" with
  // unparseable output.
  const result = run(
    "node",
    [path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs")],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "all files | 99.99 | 88.88 | 100.00 |\n",
        signal: "SIGKILL",
      }),
    },
  );

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    /Updated README branch coverage badge/,
  );
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});

test("--check rejects a stale badge without writing it", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme =
    "[![Branch coverage: 91.00%](https://img.shields.io/badge/branch%20coverage-91.00%25-brightgreen.svg)](docs/branch-coverage.md)\n";
  writeFile(readmePath, initialReadme);

  const result = run(
    "node",
    [
      path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs"),
      "--check",
    ],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "all files | 99.99 | 88.88 | 100.00 |\n",
        status: 0,
      }),
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /README branch coverage badge is stale.*coverage:badge/s,
  );
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});

test("--check accepts the exact generated badge", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme =
    "[![Branch coverage: 88.9%](https://img.shields.io/badge/branch%20coverage-88.9%25-green.svg)](docs/branch-coverage.md)\n";
  writeFile(readmePath, initialReadme);

  const result = run(
    "node",
    [
      path.join(tempDir, "scripts", "update-readme-coverage-badge.mjs"),
      "--check",
    ],
    tempDir,
    {
      env: fakeNpmEnv(tempDir, {
        output: "all files | 99.99 | 88.88 | 100.00 |\n",
        status: 0,
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /README branch coverage badge is up to date \(88\.9%\)/,
  );
  assert.equal(fs.readFileSync(readmePath, "utf8"), initialReadme);
});
