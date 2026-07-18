// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceSupportedNodeVersion,
  minimumNodeVersion,
  unsupportedNodeVersionMessage,
} from "../scripts/lib/runtime.mjs";

test("extracts the minimum Node version from the package engine", () => {
  assert.equal(minimumNodeVersion(">=22.11.0"), "22.11.0");
  assert.equal(minimumNodeVersion("not-a-range"), null);
  assert.throws(
    () => unsupportedNodeVersionMessage("22.11.0", "not-a-range"),
    /Unsupported Node engine range/,
  );
});

test("reports a clear diagnostic below the supported Node boundary", () => {
  assert.equal(
    unsupportedNodeVersionMessage("22.10.9", ">=22.11.0"),
    "commitment-issues: Node.js 22.11.0 or newer is required; found 22.10.9.",
  );
  assert.equal(
    unsupportedNodeVersionMessage("21.99.99", ">=22.11.0"),
    "commitment-issues: Node.js 22.11.0 or newer is required; found 21.99.99.",
  );
  assert.equal(
    unsupportedNodeVersionMessage("22.11.0", ">=22.11.1"),
    "commitment-issues: Node.js 22.11.1 or newer is required; found 22.11.0.",
  );
});

test("accepts the exact minimum and newer Node versions", () => {
  assert.equal(unsupportedNodeVersionMessage("22.11.0", ">=22.11.0"), null);
  assert.equal(unsupportedNodeVersionMessage("22.11.1", ">=22.11.0"), null);
  assert.equal(unsupportedNodeVersionMessage("22.12.0", ">=22.11.0"), null);
  assert.equal(unsupportedNodeVersionMessage("24.0.0", ">=22.11.0"), null);
});

test("the runtime guard reports once and exits nonzero", (t) => {
  const errors = [];
  let exitCode = null;
  t.mock.method(console, "error", (message) => errors.push(message));
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  enforceSupportedNodeVersion("20.19.4", ">=22.11.0");
  assert.deepEqual(errors, [
    "commitment-issues: Node.js 22.11.0 or newer is required; found 20.19.4.",
  ]);
  assert.equal(exitCode, 1);

  enforceSupportedNodeVersion("22.11.0", ">=22.11.0");
  assert.equal(errors.length, 1);
});
