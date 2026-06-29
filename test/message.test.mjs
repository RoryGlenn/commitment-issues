import test from "node:test";
import assert from "node:assert/strict";
import { buildAdvisoryMessage } from "../scripts/lib/message.mjs";

// picocolors emits plain text when stdout is not a TTY (as under `node --test`),
// so these assertions can match the message content directly.

test("success when there are no issues", () => {
  const { severity, lines } = buildAdvisoryMessage([]);
  assert.equal(severity, "success");
  assert.ok(lines.join("\n").includes("All pre-commit checks passed"));
});

test("warns and recommends commit:fix when amend is safe", () => {
  const { severity, lines } = buildAdvisoryMessage(
    [{ type: "format", autoFixable: true, message: "1 file with issues" }],
    { canInspectUnstagedFiles: true, unstagedTrackedFiles: [] },
  );
  const text = lines.join("\n");
  assert.equal(severity, "warning");
  assert.ok(text.includes("npm run commit:fix"));
  assert.ok(!text.includes("still need your attention"));
});

test("mixed warnings recommend commit:fix and flag manual work", () => {
  const { lines } = buildAdvisoryMessage(
    [
      { type: "format", autoFixable: true, message: "fmt" },
      { type: "tests", autoFixable: false, message: "missing tests" },
    ],
    { canInspectUnstagedFiles: true, unstagedTrackedFiles: [] },
  );
  const text = lines.join("\n");
  assert.ok(text.includes("npm run commit:fix"));
  assert.ok(text.includes("Manual items above still need your attention."));
});

test("suppresses commit:fix when tracked worktree changes block amend", () => {
  const { lines } = buildAdvisoryMessage(
    [{ type: "format", autoFixable: true, message: "fmt" }],
    { canInspectUnstagedFiles: true, unstagedTrackedFiles: ["README.md"] },
  );
  const text = lines.join("\n");
  assert.ok(!text.includes("npm run commit:fix"));
  assert.ok(text.includes("Other tracked changes will still be present"));
});

test("no fix command when nothing is auto-fixable", () => {
  const { lines } = buildAdvisoryMessage(
    [{ type: "tests", autoFixable: false, message: "missing tests" }],
    { canInspectUnstagedFiles: true, unstagedTrackedFiles: [] },
  );
  const text = lines.join("\n");
  assert.ok(text.includes("No automatic fix command"));
  assert.ok(!text.includes("npm run commit:fix"));
});

test("renders an issue's detail lines", () => {
  const { lines } = buildAdvisoryMessage([
    {
      type: "lint",
      autoFixable: false,
      message: "1 issue",
      detail: "src/a.js:1:2 (no-undef)\nsrc/b.js:3:4 (no-undef)",
    },
  ]);
  const text = lines.join("\n");
  assert.ok(text.includes("src/a.js:1:2 (no-undef)"));
  assert.ok(text.includes("src/b.js:3:4 (no-undef)"));
});

test("notes when the worktree cannot be inspected for a safe amend", () => {
  const { lines } = buildAdvisoryMessage(
    [{ type: "format", autoFixable: true, message: "fmt" }],
    { canInspectUnstagedFiles: false, unstagedTrackedFiles: [] },
  );
  const text = lines.join("\n");
  assert.ok(!text.includes("npm run commit:fix"));
  assert.ok(text.includes("could not be inspected"));
});
