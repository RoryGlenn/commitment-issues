import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeEslintJson,
  parsePrettierList,
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
