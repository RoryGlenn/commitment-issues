// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdvisoryMessage,
  buildCommitMessageCheckMessage,
} from "../scripts/lib/message.mjs";

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

test("flags manual work when a fixable+manual mix has amend blocked", () => {
  const { lines } = buildAdvisoryMessage(
    [
      { type: "format", autoFixable: true, message: "fmt" },
      { type: "tests", autoFixable: false, message: "missing tests" },
    ],
    { canInspectUnstagedFiles: true, unstagedTrackedFiles: ["README.md"] },
  );
  const text = lines.join("\n");
  // Amend is unsafe (other tracked changes), but the manual items are still
  // called out alongside the blocked-amend note.
  assert.ok(!text.includes("npm run commit:fix"));
  assert.ok(text.includes("Manual items above still need your attention."));
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

test("maps the Prettier failure message across tones", () => {
  const issue = {
    type: "format",
    autoFixable: false,
    message: "Prettier failed to complete",
  };
  const standard = buildAdvisoryMessage([issue]).lines.join("\n");
  assert.ok(standard.includes("Prettier failed to complete"));

  const fun = buildAdvisoryMessage([issue], { tone: "fun" }).lines.join("\n");
  assert.ok(fun.includes("Prettier left you on read"));
});

test("commit-message copy is advisory by default and blocking only on opt-in", () => {
  const advisory = buildCommitMessageCheckMessage({
    outcome: "reported",
    detail: "type must be one of feat, fix",
  });
  assert.equal(advisory.severity, "warning");
  assert.match(advisory.lines.join("\n"), /Commit message needs attention/);
  assert.match(advisory.lines.join("\n"), /Commit will continue/);
  assert.match(advisory.lines.join("\n"), /type must be one of feat, fix/);

  const blocking = buildCommitMessageCheckMessage({
    outcome: "reported",
    blocking: true,
  });
  assert.equal(blocking.severity, "error");
  assert.match(blocking.lines.join("\n"), /Commit blocked/);
  assert.match(blocking.lines.join("\n"), /git commit --no-verify/);
});

test("commit-message copy explains local-only tools and bring-your-own rules", () => {
  const missingTool = buildCommitMessageCheckMessage({
    outcome: "missing-tool",
    installCommand: "pnpm add -D @commitlint/cli",
  }).lines.join("\n");
  assert.match(missingTool, /No npx, network, or global-tool fallback/);
  assert.match(missingTool, /pnpm add -D @commitlint\/cli/);

  const missingConfig = buildCommitMessageCheckMessage({
    outcome: "missing-config",
  }).lines.join("\n");
  assert.match(missingConfig, /Add a commitlint config/);
  assert.match(missingConfig, /No built-in Conventional Commits rules/);
});

test("commit-message failures have complete fun-tone variants", () => {
  for (const outcome of [
    "reported",
    "missing-tool",
    "missing-config",
    "unreadable",
    "timeout",
    "unavailable",
  ]) {
    const text = buildCommitMessageCheckMessage({
      outcome,
      tone: "fun",
    }).lines.join("\n");
    assert.match(text, /relationship|stood|space|left|missing/i);
    assert.match(text, /relationship note/);
  }

  const blocking = buildCommitMessageCheckMessage({
    outcome: "unavailable",
    tone: "fun",
    blocking: true,
  });
  assert.equal(blocking.severity, "error");
  assert.match(blocking.lines.join("\n"), /blocking mode is official/);
  assert.match(blocking.lines.join("\n"), /git commit --no-verify/);
});
