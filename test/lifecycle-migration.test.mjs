// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createIsolatedMigrationEnvironment,
  loadMigrationManifest,
  readBoundedFixtureResponse,
  validateFixtureBytes,
  validateMigrationManifest,
} from "./integration/helpers/lifecycle-migration.mjs";
import {
  parseMigrationArgs,
  runMigrationLifecycle,
} from "../tools/run-migration-lifecycle-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-migration-unit-"),
  );
  try {
    return callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("migration manifest pins reviewed immutable release assets", () => {
  const manifest = loadMigrationManifest(root);
  assert.deepEqual(
    manifest.fixtures.map(({ version, kind }) => ({ version, kind })),
    [
      { version: "2.5.1", kind: "husky" },
      { version: "3.2.0", kind: "native" },
      { version: "3.3.2", kind: "native" },
    ],
  );
  assert.ok(manifest.fixtures.every((fixture) => fixture.size > 100_000));
});

test("migration manifest rejects mutable or mismatched fixture metadata", () => {
  const manifest = loadMigrationManifest(root);
  const mutableUrl = structuredClone(manifest);
  mutableUrl.fixtures[0].url = "https://registry.npmjs.org/commitment-issues";
  assert.throws(
    () => validateMigrationManifest(mutableUrl),
    /github\.com|release/u,
  );

  const duplicate = structuredClone(manifest);
  duplicate.fixtures[1].id = duplicate.fixtures[0].id;
  assert.throws(
    () => validateMigrationManifest(duplicate),
    /duplicate fixture id/u,
  );

  const mismatchedFilename = structuredClone(manifest);
  mismatchedFilename.fixtures[0].filename = "commitment-issues-latest.tgz";
  assert.throws(
    () => validateMigrationManifest(mismatchedFilename),
    /Expected values to be strictly equal/u,
  );

  const oversized = structuredClone(manifest);
  oversized.fixtures[0].size = 6 * 1024 * 1024;
  assert.throws(
    () => validateMigrationManifest(oversized),
    /at most 5242880 bytes/u,
  );
});

test("fixture bytes must match both the reviewed size and digest", () => {
  const bytes = Buffer.from("immutable release fixture");
  const fixture = {
    id: "example",
    size: bytes.length,
    sha256: "bcb1efa68d5a9f2f26b9ca5055b7e66f8ed2542c46df20e74c830ef8afdacb06",
  };
  assert.deepEqual(validateFixtureBytes(fixture, bytes), bytes);
  assert.throws(
    () => validateFixtureBytes({ ...fixture, size: bytes.length + 1 }, bytes),
    /fixture size/u,
  );
  assert.throws(
    () => validateFixtureBytes({ ...fixture, sha256: "0".repeat(64) }, bytes),
    /fixture digest/u,
  );
});

test("fixture downloads stop before buffering more than the reviewed size", async () => {
  const exactBytes = Buffer.from("abc");
  const fixture = {
    id: "bounded",
    size: exactBytes.length,
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  };
  assert.deepEqual(
    await readBoundedFixtureResponse(fixture, new Response(exactBytes)),
    exactBytes,
  );
  await assert.rejects(
    readBoundedFixtureResponse(fixture, new Response(Buffer.from("abcd"))),
    /exceeded the reviewed size/u,
  );
});

test("migration child environment is allowlisted and forces isolated config", () => {
  withTempDir((tempDir) => {
    const env = createIsolatedMigrationEnvironment(tempDir, {
      PATH: "/safe/bin",
      NPM_CONFIG_REGISTRY: "https://example.invalid/",
      npm_config_registry: "https://example.invalid/",
      GITHUB_ENV: "/tmp/github-env",
      GITHUB_PATH: "/tmp/github-path",
      GIT_CONFIG_GLOBAL: "/tmp/host-gitconfig",
      GIT_SSH_COMMAND: "unsafe-command",
      HTTPS_PROXY: "https://proxy.example.invalid",
      AWS_SECRET_ACCESS_KEY: "secret",
      NODE_AUTH_TOKEN: "token",
    });
    assert.equal(env.PATH, "/safe/bin");
    assert.equal(env.NPM_CONFIG_REGISTRY, "https://registry.npmjs.org/");
    assert.equal(env.npm_config_registry, "https://registry.npmjs.org/");
    assert.equal(env.GITHUB_ENV, undefined);
    assert.equal(env.GITHUB_PATH, undefined);
    assert.equal(env.GIT_SSH_COMMAND, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(env.NODE_AUTH_TOKEN, undefined);
    assert.ok(env.GIT_CONFIG_GLOBAL.startsWith(tempDir));
    assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
    assert.ok(env.npm_config_userconfig.startsWith(tempDir));
  });
});

test("migration runner parses package managers and exact tarballs", () => {
  assert.deepEqual(parseMigrationArgs([], root), {
    packageManager: "npm",
    tarball: undefined,
  });
  assert.deepEqual(parseMigrationArgs(["pnpm"], root), {
    packageManager: "pnpm",
    tarball: undefined,
  });

  withTempDir((tempDir) => {
    const tarball = path.join(tempDir, "candidate.tgz");
    fs.writeFileSync(tarball, "candidate");
    assert.deepEqual(parseMigrationArgs(["npm", "--tarball", tarball], root), {
      packageManager: "npm",
      tarball: fs.realpathSync.native(tarball),
    });
    assert.throws(
      () =>
        parseMigrationArgs(
          ["npm", "--tarball", tarball, "--tarball", tarball],
          root,
        ),
      /only once/u,
    );
  });
});

test("migration runner rejects unsupported or unsafe arguments", () => {
  assert.throws(() => parseMigrationArgs(["pip"], root), /Unsupported/u);
  assert.throws(() => parseMigrationArgs(["npm", "--wat"], root), /Unknown/u);
  assert.throws(
    () => parseMigrationArgs(["npm", "--tarball"], root),
    /requires a path/u,
  );
  assert.throws(
    () => parseMigrationArgs(["npm", "--tarball", "candidate.zip"], root),
    /\.tgz extension/u,
  );
  assert.throws(
    () => parseMigrationArgs(["npm", "--tarball", "missing.tgz"], root),
    /does not exist/u,
  );
});

test("migration runner forwards only its explicit control variables", () => {
  const originalCommitmentIssues = process.env.COMMITMENT_ISSUES;
  const originalHusky = process.env.HUSKY;
  const originalManager = process.env.COMMITMENT_ISSUES_MIGRATION_PM;
  const originalTarball = process.env.COMMITMENT_ISSUES_MIGRATION_TARBALL;
  process.env.COMMITMENT_ISSUES = "0";
  process.env.HUSKY = "0";
  process.env.COMMITMENT_ISSUES_MIGRATION_PM = "stale";
  process.env.COMMITMENT_ISSUES_MIGRATION_TARBALL = "/tmp/stale.tgz";

  let invocation;
  try {
    const result = runMigrationLifecycle(
      { packageManager: "yarn", tarball: "/tmp/candidate.tgz" },
      {
        cwd: root,
        spawn(command, args, options) {
          invocation = { command, args, options };
          return { status: 0 };
        },
      },
    );
    assert.equal(result.status, 0);
  } finally {
    for (const [key, value] of [
      ["COMMITMENT_ISSUES", originalCommitmentIssues],
      ["HUSKY", originalHusky],
      ["COMMITMENT_ISSUES_MIGRATION_PM", originalManager],
      ["COMMITMENT_ISSUES_MIGRATION_TARBALL", originalTarball],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [
    "--test",
    "test/integration/lifecycle-migration.test.mjs",
  ]);
  assert.equal(invocation.options.cwd, root);
  assert.equal(invocation.options.env.COMMITMENT_ISSUES, undefined);
  assert.equal(invocation.options.env.HUSKY, undefined);
  assert.equal(invocation.options.env.COMMITMENT_ISSUES_MIGRATION_PM, "yarn");
  assert.equal(
    invocation.options.env.COMMITMENT_ISSUES_MIGRATION_TARBALL,
    "/tmp/candidate.tgz",
  );
});
