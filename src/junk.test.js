import test from "node:test";
import assert from "node:assert/strict";
import { add } from "./junk.js";

// Deliberately failing tests for the junk fixture. These exist so the opt-in
// staged-test runner (precommitChecks.runStagedTests) reports failures when
// src/junk.js is staged. Sibling placement (src/junk.test.js) makes the hook's
// missing-test check pass while staying out of `npm test`'s test/**/*.test.mjs
// glob, so the real suite stays green.

test("junk add() returns the wrong sum on purpose", () => {
  // add(2, 3) is really 5; asserting 6 forces a failure.
  assert.equal(add(2, 3), 6);
});

test("junk add() does not actually concatenate (intentional fail)", () => {
  assert.equal(add("a", "b"), " value-that-will-never-match");
});
