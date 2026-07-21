// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEBUG_ARTIFACT_CHECK_ID,
  DEBUG_ARTIFACT_FINDING_ID,
  DEBUG_ARTIFACT_PATTERNS,
  DEBUG_ARTIFACT_UNAVAILABLE_ID,
  DEFAULT_DEBUG_ARTIFACT_EXEMPT,
  debugArtifactFindingLines,
  debugArtifactFindingsForAddedLines,
  debugArtifactScanUnavailableIssue,
  debugArtifactsIssue,
  inspectDebugArtifactDiffResult,
  inspectDiffForDebugArtifacts,
  resolveDebugArtifactConfig,
} from "../scripts/lib/debug-artifacts.mjs";

function diffFor(file, addedLines, startLine = 1) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -0,0 +${startLine},${addedLines.length} @@`,
    ...addedLines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

test("every curated debug rule matches its supported high-precision form", () => {
  const cases = [
    ["src/app.js", 'console.log("trace", value);', "javascript.console-log"],
    ["src/app.ts", "debugger; // temporary", "javascript.debugger"],
    ["src/app.py", 'print("trace", value) # temporary', "python.print"],
    ["src/app.py", "pdb.set_trace()", "python.pdb-set-trace"],
    ["src/app.rb", "binding.pry # temporary", "ruby.binding-pry"],
    [
      "src/app.mjs",
      "// TODO(owner): remove before release",
      "comment.todo-remove",
    ],
    ["src/app.py", "# FIXME: temporary workaround", "comment.fixme-temporary"],
  ];

  for (const [file, content, ruleId] of cases) {
    const inspection = inspectDiffForDebugArtifacts(diffFor(file, [content]));
    assert.equal(inspection.valid, true);
    assert.equal(inspection.findings.length, 1, `${ruleId} should match`);
    assert.equal(inspection.findings[0].ruleId, ruleId);
  }
});

test("debug scanning reports only added lines with accurate locations", () => {
  const diff = [
    "diff --git a/src/app.js b/src/app.js",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -7,2 +7,2 @@",
    '-console.log("removed");',
    ' const unchanged = "console.log(unchanged)";',
    "+const clean = true;",
    "@@ -40,0 +41 @@",
    '+console.log("added");',
    "",
  ].join("\n");

  assert.deepEqual(inspectDiffForDebugArtifacts(diff), {
    findings: [
      {
        file: "src/app.js",
        line: 41,
        ruleId: "javascript.console-log",
        label: "console.log call",
      },
    ],
    valid: true,
  });
});

test("default policy ignores documentation, fixtures, snapshots, and generated paths", () => {
  const addedLines = [
    "docs/example.js",
    "test/fixtures/example.js",
    "test/__fixtures__/example.js",
    "test/__snapshots__/example.js",
    "test/example.snap",
    "docs/example\ncontinued.js",
    "test/fixtures/example\ncontinued.js",
    "dist/example.js",
    "build/example.js",
    "coverage/example.js",
    "node_modules/example/index.js",
    "cache/__pycache__/example.py",
    ".DS_Store",
  ].map((file, index) => ({
    file,
    line: index + 1,
    content: 'console.log("example");',
  }));

  assert.deepEqual(debugArtifactFindingsForAddedLines(addedLines), []);
  assert.ok(DEFAULT_DEBUG_ARTIFACT_EXEMPT.includes("docs/**"));
});

test("line anchoring and language scope reject strings, comments, prose, and other calls", () => {
  const addedLines = [
    {
      file: "src/app.js",
      line: 1,
      content: 'const text = "console.log(value)";',
    },
    { file: "src/app.js", line: 2, content: "// console.log(value);" },
    { file: "src/app.js", line: 3, content: 'console.error("intentional");' },
    { file: "src/app.js", line: 4, content: 'const note = "TODO remove";' },
    { file: "src/app.js", line: 5, content: "const value = 1; // TODO remove" },
    { file: "src/app.py", line: 6, content: 'message = "print(value)"' },
    { file: "src/app.py", line: 7, content: "# print(value)" },
    { file: "src/app.py", line: 8, content: 'console.log("wrong language")' },
    { file: "src/app.js", line: 9, content: 'print("wrong language")' },
    { file: "notes.txt", line: 10, content: "// TODO remove" },
  ];

  assert.deepEqual(debugArtifactFindingsForAddedLines(addedLines, []), []);
});

test("multiline lexical contexts remain line-level matches and path exemptions suppress them", () => {
  const cases = [
    [
      "src/block.js",
      ["/*", 'console.log("example");', "*/"],
      "javascript.console-log",
    ],
    [
      "src/template.js",
      ["const example = `", "debugger;", "`;"],
      "javascript.debugger",
    ],
    [
      "src/triple.py",
      ['example = """', 'print("example")', '"""'],
      "python.print",
    ],
  ];

  for (const [file, lines, ruleId] of cases) {
    const inspection = inspectDiffForDebugArtifacts(diffFor(file, lines), []);
    assert.equal(inspection.valid, true);
    assert.deepEqual(
      inspection.findings.map((finding) => finding.ruleId),
      [ruleId],
    );
    assert.deepEqual(
      inspectDiffForDebugArtifacts(diffFor(file, lines), ["src/**"]).findings,
      [],
    );
    assert.deepEqual(
      inspectDiffForDebugArtifacts(
        diffFor(`docs/${file.slice("src/".length)}`, lines),
      ).findings,
      [],
    );
  }
});

test("explicit exemptions replace defaults and normalize path separators", () => {
  const additions = [
    { file: "docs\\example.js", line: 1, content: 'console.log("docs")' },
    {
      file: "src\\devtools\\trace.js",
      line: 2,
      content: 'console.log("trace")',
    },
  ];

  assert.deepEqual(
    debugArtifactFindingsForAddedLines(additions, ["src/devtools/**"]),
    [
      {
        file: "docs/example.js",
        line: 1,
        ruleId: "javascript.console-log",
        label: "console.log call",
      },
    ],
  );
  assert.equal(debugArtifactFindingsForAddedLines(additions, []).length, 2);
});

test("Ruby Rakefiles participate while unsupported files stay out", () => {
  const findings = debugArtifactFindingsForAddedLines(
    [
      { file: "Rakefile", line: 3, content: "binding.pry" },
      { file: "script.txt", line: 4, content: "binding.pry" },
    ],
    [],
  );

  assert.deepEqual(findings, [
    {
      file: "Rakefile",
      line: 3,
      ruleId: "ruby.binding-pry",
      label: "binding.pry call",
    },
  ]);
});

test("shared patch parsing preserves unusual Git-quoted paths", () => {
  const quotedPath = '"b/src/tab\\tnewline\\nquote\\042-\\347\\214\\253.js"';
  const inspection = inspectDiffForDebugArtifacts(
    [
      `diff --git ${quotedPath} ${quotedPath}`,
      '--- "a/src/tab\\tnewline\\nquote\\042-\\347\\214\\253.js"',
      `+++ ${quotedPath}`,
      "@@ -0,0 +8 @@",
      '+console.log("trace");',
      "",
    ].join("\n"),
    [],
  );

  assert.equal(inspection.valid, true);
  assert.equal(inspection.findings[0].file, 'src/tab\tnewline\nquote"-猫.js');
  assert.equal(inspection.findings[0].line, 8);

  const quotedBackslashPath = '"b/src/back\\\\slash.py"';
  const backslashInspection = inspectDiffForDebugArtifacts(
    [
      `diff --git ${quotedBackslashPath} ${quotedBackslashPath}`,
      '--- "a/src/back\\\\slash.py"',
      `+++ ${quotedBackslashPath}`,
      "@@ -0,0 +1 @@",
      '+print("trace")',
      "",
    ].join("\n"),
    [],
  );
  assert.equal(backslashInspection.valid, true);
  assert.equal(backslashInspection.findings[0].file, "src/back\\slash.py");

  const rakeLikePath = '"b/src/not-a-directory\\\\Rakefile"';
  assert.deepEqual(
    inspectDiffForDebugArtifacts(
      [
        `diff --git ${rakeLikePath} ${rakeLikePath}`,
        '--- "a/src/not-a-directory\\\\Rakefile"',
        `+++ ${rakeLikePath}`,
        "@@ -0,0 +1 @@",
        "+binding.pry",
        "",
      ].join("\n"),
      [],
    ).findings,
    [],
  );
});

test("binary, rename-only, deletion, and malformed patches are distinguished", () => {
  const binary = [
    "diff --git a/assets/data.bin b/assets/data.bin",
    "new file mode 100644",
    "index 0000000..1234567",
    "Binary files /dev/null and b/assets/data.bin differ",
    "",
  ].join("\n");
  const rename = [
    "diff --git a/old.js b/new.js",
    "similarity index 100%",
    "rename from old.js",
    "rename to new.js",
    "",
  ].join("\n");
  const deletion = [
    "diff --git a/src/removed.js b/src/removed.js",
    "--- a/src/removed.js",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    '-console.log("removed");',
    "",
  ].join("\n");

  for (const patch of [binary, rename, deletion]) {
    assert.deepEqual(inspectDiffForDebugArtifacts(patch), {
      findings: [],
      valid: true,
    });
  }
  assert.equal(inspectDiffForDebugArtifacts("not a patch").valid, false);
});

test("process inspection distinguishes Git and parser failures", () => {
  assert.deepEqual(
    inspectDebugArtifactDiffResult({ error: new Error("spawn failed") }),
    { findings: [], inspected: false, outcome: "spawn-error" },
  );
  assert.deepEqual(
    inspectDebugArtifactDiffResult({ status: 128, stdout: "" }),
    { findings: [], inspected: false, outcome: "nonzero" },
  );
  assert.deepEqual(
    inspectDebugArtifactDiffResult({ status: 0, stdout: "malformed" }),
    { findings: [], inspected: false, outcome: "malformed" },
  );
  assert.deepEqual(
    inspectDebugArtifactDiffResult(
      { status: 0, stdout: diffFor("src/app.js", ['console.log("trace")']) },
      [],
    ),
    {
      findings: [
        {
          file: "src/app.js",
          line: 1,
          ruleId: "javascript.console-log",
          label: "console.log call",
        },
      ],
      inspected: true,
      outcome: "success",
    },
  );
});

test("debug configuration is opt-in and explicit exemptions replace defaults", () => {
  assert.deepEqual(resolveDebugArtifactConfig({}), {
    scanDebugArtifacts: false,
    debugArtifactExempt: DEFAULT_DEBUG_ARTIFACT_EXEMPT,
  });
  assert.deepEqual(
    resolveDebugArtifactConfig({
      scanDebugArtifacts: true,
      generatedPaths: ["generated-api/**"],
    }),
    {
      scanDebugArtifacts: true,
      debugArtifactExempt: [
        "docs/**",
        "**/fixtures/**",
        "**/__fixtures__/**",
        "**/__snapshots__/**",
        "**/*.snap",
        "generated-api/**",
      ],
    },
  );
  assert.deepEqual(
    resolveDebugArtifactConfig({
      scanDebugArtifacts: true,
      debugArtifactExempt: ["src/devtools/**"],
      generatedPaths: ["generated-api/**"],
    }),
    {
      scanDebugArtifacts: true,
      debugArtifactExempt: ["src/devtools/**"],
    },
  );
});

test("aggregate issue helpers expose stable identifiers and bounded details", () => {
  const findings = Array.from({ length: 7 }, (_, index) => ({
    file: `src/file-${index}.js`,
    line: index + 1,
    ruleId: "javascript.console-log",
    label: "console.log call",
  }));

  assert.equal(debugArtifactsIssue([]), null);
  const issue = debugArtifactsIssue(findings);
  assert.equal(issue.id, DEBUG_ARTIFACT_FINDING_ID);
  assert.equal(issue.type, DEBUG_ARTIFACT_CHECK_ID);
  assert.equal(issue.message, "7 temporary debug artifacts staged");
  assert.equal(issue.detail.length, 7);
  assert.equal(issue.detail.at(-2), "(+2 more)");
  assert.match(issue.detail.at(-1), /path exemption/);
  assert.equal(debugArtifactFindingLines(findings, 7).length, 7);
  assert.equal(
    debugArtifactsIssue(findings.slice(0, 1)).message,
    "1 temporary debug artifact staged",
  );

  const malformed = debugArtifactScanUnavailableIssue("malformed");
  assert.equal(malformed.id, DEBUG_ARTIFACT_UNAVAILABLE_ID);
  assert.match(malformed.detail, /malformed staged patch/);
  assert.match(
    debugArtifactScanUnavailableIssue("nonzero").detail,
    /could not inspect/,
  );
});

test("curated rules have unique stable ids, labels, rationales, and regexes", () => {
  assert.equal(DEBUG_ARTIFACT_PATTERNS.length, 7);
  assert.equal(
    new Set(DEBUG_ARTIFACT_PATTERNS.map((pattern) => pattern.id)).size,
    DEBUG_ARTIFACT_PATTERNS.length,
  );
  for (const pattern of DEBUG_ARTIFACT_PATTERNS) {
    assert.match(pattern.id, /^[a-z]+[a-z.-]+$/);
    assert.equal(typeof pattern.label, "string");
    assert.equal(typeof pattern.rationale, "string");
    assert.ok(pattern.regex instanceof RegExp);
  }
});
