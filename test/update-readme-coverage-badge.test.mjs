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

function fakeNpmEnv(tempDir, { output = "", status = 0 } = {}) {
  const binDir = path.join(tempDir, ".fakebin");
  fs.mkdirSync(binDir, { recursive: true });

  const shimPath = path.join(binDir, "npm-shim.mjs");
  writeFile(
    shimPath,
    [
      "const args = process.argv.slice(2);",
      'if (args.length === 2 && args[0] === "run" && args[1] === "test:coverage") {',
      '  process.stdout.write(process.env.FAKE_NPM_OUTPUT || "");',
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
  };
}

test("updates README badge from test:coverage output", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  writeFile(
    readmePath,
    "[![Coverage: 93.13%](https://img.shields.io/badge/coverage-93.13%25-brightgreen.svg)](docs/scenario-coverage.md)\n",
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
    /Updated README coverage badge to 88.88%/,
  );
  assert.match(
    fs.readFileSync(readmePath, "utf8"),
    /Coverage: 88\.88%\]\(https:\/\/img\.shields\.io\/badge\/coverage-88\.88%25-brightgreen\.svg\)/,
  );
});

test("exits non-zero when test:coverage fails", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const readmePath = path.join(tempDir, "README.md");
  const initialReadme =
    "[![Coverage: 93.13%](https://img.shields.io/badge/coverage-93.13%25-brightgreen.svg)](docs/scenario-coverage.md)\n";
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
