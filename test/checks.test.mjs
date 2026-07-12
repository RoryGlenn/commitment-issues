// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeEslintJson,
  parsePrettierList,
  eslintManualIssues,
  formatEslintManualIssue,
  parseNodeTestSummary,
} from "../scripts/lib/checks.mjs";

test("summarizeEslintJson totals errors/warnings and fixables", () => {
  const json = JSON.stringify([
    {
      errorCount: 2,
      warningCount: 1,
      fixableErrorCount: 1,
      fixableWarningCount: 0,
    },
    {
      errorCount: 0,
      warningCount: 3,
      fixableErrorCount: 0,
      fixableWarningCount: 2,
    },
  ]);
  assert.deepEqual(summarizeEslintJson(json), {
    issueCount: 6,
    fixableCount: 3,
  });
});

test("summarizeEslintJson handles empty or invalid input", () => {
  assert.deepEqual(summarizeEslintJson(""), { issueCount: 0, fixableCount: 0 });
  assert.deepEqual(summarizeEslintJson("not json"), {
    issueCount: 0,
    fixableCount: 0,
  });
  assert.deepEqual(summarizeEslintJson("[]"), {
    issueCount: 0,
    fixableCount: 0,
  });
});

test("summarizeEslintJson defaults missing counts to zero", () => {
  // ESLint results may omit count fields; the `|| 0` guards must treat them as
  // zero rather than NaN.
  const json = JSON.stringify([{ errorCount: 1 }]);
  assert.deepEqual(summarizeEslintJson(json), {
    issueCount: 1,
    fixableCount: 0,
  });
});

test("parsePrettierList returns trimmed, non-empty lines", () => {
  assert.deepEqual(parsePrettierList(1, "a.js\n  b.ts \n\n"), {
    failed: false,
    files: ["a.js", "b.ts"],
  });
  assert.deepEqual(parsePrettierList(0, "ignored-output.js\n"), {
    failed: false,
    files: [],
  });
});

test("parsePrettierList uses exit status to identify a Prettier failure", () => {
  assert.deepEqual(parsePrettierList(2, "src/a.json\n"), {
    failed: true,
    files: [],
  });
});

test("parsePrettierList treats [error] in a filename as a formatting path", () => {
  assert.deepEqual(parsePrettierList(1, "src/[error]-report.json\n"), {
    failed: false,
    files: ["src/[error]-report.json"],
  });
});

test("eslintManualIssues returns only messages without an auto-fix", () => {
  const json = JSON.stringify([
    {
      filePath: "/repo/src/a.js",
      messages: [
        { ruleId: "no-unused-vars", line: 1, column: 7 },
        { ruleId: "semi", line: 2, column: 10, fix: { range: [0, 1] } },
      ],
    },
    {
      filePath: "/repo/src/b.js",
      messages: [{ ruleId: "no-undef", line: 3, column: 5 }],
    },
  ]);
  assert.deepEqual(eslintManualIssues(json), [
    {
      filePath: "/repo/src/a.js",
      line: 1,
      column: 7,
      ruleId: "no-unused-vars",
    },
    { filePath: "/repo/src/b.js", line: 3, column: 5, ruleId: "no-undef" },
  ]);
});

test("eslintManualIssues handles empty or invalid input", () => {
  assert.deepEqual(eslintManualIssues(""), []);
  assert.deepEqual(eslintManualIssues("not json"), []);
  assert.deepEqual(eslintManualIssues("[]"), []);
});

test("eslintManualIssues skips file results that have no messages array", () => {
  // ESLint omits `messages` for files it didn't report on; the `|| []` guard
  // must treat that as no manual issues rather than throwing.
  const json = JSON.stringify([{ filePath: "/repo/src/c.js" }]);
  assert.deepEqual(eslintManualIssues(json), []);
});

test("formatEslintManualIssue handles locations, rules, and path fallbacks", () => {
  assert.equal(
    formatEslintManualIssue(
      {
        filePath: "/repo/src/a.js",
        line: 2,
        column: 7,
        ruleId: "no-undef",
      },
      "/repo",
    ),
    "src/a.js:2:7 (no-undef)",
  );
  assert.equal(
    formatEslintManualIssue(
      { filePath: "/repo/src/b.js", ruleId: null },
      "/repo",
    ),
    "src/b.js",
  );
  assert.equal(
    formatEslintManualIssue(
      { filePath: "/repo", line: 1, column: 1, ruleId: null },
      "/repo",
    ),
    "/repo:1:1",
  );
});

test("parseNodeTestSummary reads TAP and spec reporter counts", () => {
  assert.deepEqual(parseNodeTestSummary("# tests 47\n# pass 46\n# fail 1\n"), {
    passed: 46,
    failed: 1,
  });
  assert.deepEqual(parseNodeTestSummary("\u2139 pass 5\n\u2139 fail 0\n"), {
    passed: 5,
    failed: 0,
  });
});

test("parseNodeTestSummary returns null for unrecognized output", () => {
  assert.equal(parseNodeTestSummary(""), null);
  assert.equal(parseNodeTestSummary("Tests: 1 failed, 2 passed"), null);
});

test("parseNodeTestSummary handles pass-only and fail-only output", () => {
  assert.deepEqual(parseNodeTestSummary("# pass 3\n"), {
    passed: 3,
    failed: 0,
  });
  assert.deepEqual(parseNodeTestSummary("# fail 2\n"), {
    passed: 0,
    failed: 2,
  });
});
