#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import { hasSuppliedTarballDigest } from "../scripts/lib/lifecycle-managers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "commitment-issues-prebuilt-lifecycle-"),
);

function run(command, args, options = {}) {
  const result = crossSpawn.sync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

try {
  const pack = run("npm", ["pack", "--silent", "--pack-destination", tempDir]);
  if (pack.status !== 0) {
    throw new Error(`npm pack failed with exit ${pack.status}: ${pack.stderr}`);
  }

  const tarballs = fs
    .readdirSync(tempDir)
    .filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(
      `npm pack should produce exactly one tarball, found ${tarballs.length}`,
    );
  }
  const tarball = fs.realpathSync.native(path.join(tempDir, tarballs[0]));
  const expectedTarballHash = sha256(tarball);
  const lifecycle = run(process.execPath, [
    "scripts/run-lifecycle-test.mjs",
    "npm",
    "--tarball",
    tarball,
  ]);

  process.stdout.write(lifecycle.stdout);
  process.stderr.write(lifecycle.stderr);
  if (lifecycle.status !== 0) {
    throw new Error(
      `prebuilt lifecycle integration failed with exit ${lifecycle.status}`,
    );
  }
  if (!hasSuppliedTarballDigest(lifecycle.stdout, expectedTarballHash)) {
    throw new Error(
      "lifecycle integration did not confirm that it consumed the supplied tarball bytes",
    );
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
