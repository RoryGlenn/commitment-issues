// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Unit tests for the staged-secrets scanner. Every credential fixture is
// assembled at runtime (split/joined) so this file itself never contains a
// scannable secret — the repo's own pre-commit hook scans staged diffs.

import test from "node:test";
import assert from "node:assert/strict";
import {
  envFileFindings,
  filterExemptFindings,
  findingLines,
  isEnvFile,
  resolveSecretScanConfig,
  scanDiffForSecrets,
  secretsIssue,
  SECRET_PATTERNS,
} from "../scripts/lib/secret-scan.mjs";

// -- runtime-assembled fixtures (never store a joined secret in source) --

const AWS_KEY = ["AKIA", "ABCDEFGH", "IJKLMNOP"].join("");
const AWS_DOC_EXAMPLE = ["AKIA", "IOSFODNN7", "EXAMPLE"].join("");
const GITHUB_TOKEN = ["ghp_", "a1B2c3D4e5F6g7H8i9J0", "k1L2m3N4o5P6q7R8"].join(
  "",
);
const GITHUB_PAT = ["github_pat_", "22AABBCCDD", "eeffgghhiijjkk"].join("");
const SLACK_TOKEN = ["xoxb-", "1234567890", "-abcdefghij"].join("");
const NPM_TOKEN = ["npm_", "a".repeat(36)].join("");
const STRIPE_KEY = ["sk_live_", "a1B2c3D4e5F6g7H8i9J0k1L2"].join("");
const GOOGLE_KEY = ["AIza", "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6q"].join("");
const PRIVATE_KEY = ["-----BEGIN ", "RSA PRIVATE KEY-----"].join("");
const URL_CREDS = ["postgres://admin:", "hunter2secret", "@db.internal"].join(
  "",
);

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

test("scanDiffForSecrets catches each curated pattern on added lines", () => {
  const cases = [
    [`aws_key = "${AWS_KEY}"`, "AWS access key ID"],
    [PRIVATE_KEY, "private key"],
    [`token: ${GITHUB_TOKEN}`, "GitHub token"],
    [`pat = ${GITHUB_PAT}`, "GitHub token"],
    [`slack: ${SLACK_TOKEN}`, "Slack token"],
    [`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`, "npm token"],
    [`stripe = ${STRIPE_KEY}`, "Stripe live key"],
    [`maps = ${GOOGLE_KEY}`, "Google API key"],
    [`DATABASE_URL=${URL_CREDS}`, "URL with embedded credentials"],
  ];

  for (const [line, expectedLabel] of cases) {
    const findings = scanDiffForSecrets(diffFor("src/config.ts", [line], 12));
    assert.equal(findings.length, 1, `expected a finding for: ${line}`);
    assert.deepEqual(findings[0], {
      file: "src/config.ts",
      line: 12,
      label: expectedLabel,
    });
  }
});

test("scanDiffForSecrets scans added content beginning with two plus signs", () => {
  const findings = scanDiffForSecrets(
    diffFor("src/config.txt", [`++ token=${AWS_KEY}`], 7),
  );

  assert.deepEqual(findings, [
    { file: "src/config.txt", line: 7, label: "AWS access key ID" },
  ]);
});

test("scanDiffForSecrets ignores removed and context lines", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    ` context = "${AWS_KEY}"`,
    `-removed = "${AWS_KEY}"`,
    "+added = 'clean'",
    "",
  ].join("\n");

  assert.deepEqual(scanDiffForSecrets(diff), []);
});

test("scanDiffForSecrets reports accurate line numbers across hunks", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -10,0 +10,2 @@",
    "+const ok = 1;",
    `+const key = "${AWS_KEY}";`,
    "@@ -40,0 +42,1 @@",
    `+const slack = "${SLACK_TOKEN}";`,
    "",
  ].join("\n");

  const findings = scanDiffForSecrets(diff);
  assert.deepEqual(findings, [
    { file: "src/a.ts", line: 11, label: "AWS access key ID" },
    { file: "src/a.ts", line: 42, label: "Slack token" },
  ]);
});

test("scanDiffForSecrets skips known documentation examples", () => {
  const findings = scanDiffForSecrets(
    diffFor("docs/setup.md", [`example = ${AWS_DOC_EXAMPLE}`]),
  );
  assert.deepEqual(findings, []);
});

test("URL credential detection skips placeholder passwords", () => {
  const placeholders = [
    "postgres://user:${DB_PASS}@host/db",
    "postgres://user:$DB_PASS@host/db",
    "postgres://user:<password>@host/db",
    "postgres://user:%PASS%@host/db",
    "postgres://user:{{password}}@host/db",
    "postgres://user:password@host/db",
    "postgres://user:changeme@host/db",
    "postgres://user:xxx@host/db",
    "mysql://root:secret@localhost/app",
  ];
  for (const line of placeholders) {
    assert.deepEqual(
      scanDiffForSecrets(diffFor("config/db.ts", [line])),
      [],
      `should not flag placeholder: ${line}`,
    );
  }
});

test("scanDiffForSecrets never throws on malformed diff text", () => {
  assert.deepEqual(scanDiffForSecrets(""), []);
  assert.deepEqual(scanDiffForSecrets(undefined), []);
  assert.deepEqual(scanDiffForSecrets("+++ garbage\n+++ b/x\n+++"), []);
  assert.deepEqual(scanDiffForSecrets(`+${AWS_KEY}`), []);
});

test("isEnvFile matches real env files but not templates", () => {
  assert.equal(isEnvFile(".env"), true);
  assert.equal(isEnvFile(".env.local"), true);
  assert.equal(isEnvFile(".env.production"), true);
  assert.equal(isEnvFile("apps/api/.env"), true);
  assert.equal(isEnvFile(".env.example"), false);
  assert.equal(isEnvFile(".env.sample"), false);
  assert.equal(isEnvFile(".env.template"), false);
  assert.equal(isEnvFile("environment.ts"), false);
  assert.equal(isEnvFile("src/env.mjs"), false);
});

test("envFileFindings labels staged env files", () => {
  assert.deepEqual(envFileFindings([".env", "src/app.ts", ".env.example"]), [
    { file: ".env", label: ".env file" },
  ]);
});

test("filterExemptFindings honors secretExempt globs", () => {
  const findings = [
    { file: "test/fixtures/keys.txt", label: "AWS access key ID" },
    { file: "src/auth.ts", label: "AWS access key ID" },
  ];

  assert.deepEqual(filterExemptFindings(findings, ["test/fixtures/**"]), [
    { file: "src/auth.ts", label: "AWS access key ID" },
  ]);
  assert.deepEqual(filterExemptFindings(findings, []), findings);
  assert.deepEqual(filterExemptFindings(findings, undefined), findings);
});

test("findingLines renders file:line labels and caps the list", () => {
  const findings = [
    { file: ".env", label: ".env file" },
    { file: "src/auth.ts", line: 12, label: "AWS access key ID" },
  ];
  assert.deepEqual(findingLines(findings), [
    ".env (.env file)",
    "src/auth.ts:12 (AWS access key ID)",
  ]);

  const many = Array.from({ length: 7 }, (_, i) => ({
    file: `f${i}.ts`,
    line: 1,
    label: "GitHub token",
  }));
  const lines = findingLines(many);
  assert.equal(lines.length, 6);
  assert.equal(lines.at(-1), "(+2 more)");
});

test("secretsIssue builds the advisory issue with rotation guidance", () => {
  assert.equal(secretsIssue([]), null);

  const issue = secretsIssue([
    { file: ".env", label: ".env file" },
    { file: "src/auth.ts", line: 12, label: "AWS access key ID" },
  ]);
  assert.equal(issue.autoFixable, false);
  assert.equal(issue.message, "2 possible secrets staged");
  assert.match(issue.detail, /\.env \(\.env file\)/);
  assert.match(issue.detail, /src\/auth\.ts:12 \(AWS access key ID\)/);
  assert.match(issue.detail, /rotate anything already exposed/);

  assert.equal(
    secretsIssue([{ file: ".env", label: ".env file" }]).message,
    "1 possible secret staged",
  );
});

test("resolveSecretScanConfig applies defaults and explicit values", () => {
  assert.deepEqual(resolveSecretScanConfig({}), {
    scanSecrets: true,
    blockOnSecrets: false,
    secretExempt: [],
  });
  assert.deepEqual(
    resolveSecretScanConfig({
      scanSecrets: false,
      blockOnSecrets: true,
      secretExempt: ["test/fixtures/**"],
    }),
    {
      scanSecrets: false,
      blockOnSecrets: true,
      secretExempt: ["test/fixtures/**"],
    },
  );
});

test("every curated pattern has a label and a regex", () => {
  assert.ok(SECRET_PATTERNS.length >= 8);
  for (const pattern of SECRET_PATTERNS) {
    assert.equal(typeof pattern.label, "string");
    assert.ok(pattern.regex instanceof RegExp);
  }
});
