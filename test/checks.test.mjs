import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeEslintJson,
  parsePrettierList,
  eslintManualIssues,
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

test("parsePrettierList returns trimmed, non-empty lines", () => {
  assert.deepEqual(parsePrettierList("a.js\n  b.ts \n\n"), ["a.js", "b.ts"]);
  assert.deepEqual(parsePrettierList(""), []);
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
