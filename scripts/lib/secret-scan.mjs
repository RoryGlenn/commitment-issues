// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Pure helpers behind the staged-secrets guard. High-precision by design:
// only unambiguous credential shapes and .env files are flagged, and only on
// lines *added* by the staged diff, so pre-existing strings never fire. No
// I/O here — the entry script hands in the diff text and staged paths.

import path from "node:path";
import { globToRegExp, normalizeRepoPath } from "./files.mjs";

// Fixture-safe assembly: keep the private-key header split so this file (and
// the repo's own staged diff) never contains a scannable header itself.
const PRIVATE_KEY_HEADER = ["-----BEGIN ", "[A-Z ]*PRIVATE KEY( BLOCK)?-----"];

// Documentation examples that must never fire (AWS's canonical doc key).
const KNOWN_EXAMPLE_SECRETS = new Set(["AKIA" + "IOSFODNN7EXAMPLE"]);

// Template/placeholder shapes inside URL credentials (postgres://user:${PASS}@…).
const PLACEHOLDER_SYNTAX = /^(\$\{.*\}|\$[A-Z_]+|<[^>]*>|%[^%]*%|\{\{.*\}\})$/;
const PLACEHOLDER_WORDS =
  /^(pass(word)?|example|changeme|secret|placeholder|redacted|xxx+|\*+|\.{3})$/i;

function isPlaceholder(value) {
  return PLACEHOLDER_SYNTAX.test(value) || PLACEHOLDER_WORDS.test(value);
}

/**
 * Resolve the secret-scan config keys to effective values.
 * @param {object} config - Sanitized precommitChecks config.
 * @returns {{scanSecrets: boolean, blockOnSecrets: boolean, secretExempt: string[]}} Effective values.
 */
export function resolveSecretScanConfig(config = {}) {
  return {
    scanSecrets: config.scanSecrets !== false,
    blockOnSecrets: config.blockOnSecrets === true,
    secretExempt: Array.isArray(config.secretExempt) ? config.secretExempt : [],
  };
}

/**
 * The curated detection set. Each entry is a high-precision credential shape;
 * additions should prefer missed secrets over false alarms (advisory tools
 * die by alarm fatigue).
 */
export const SECRET_PATTERNS = [
  {
    label: "AWS access key ID",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    allow: (match) => KNOWN_EXAMPLE_SECRETS.has(match),
  },
  {
    label: "private key",
    regex: new RegExp(PRIVATE_KEY_HEADER.join("")),
  },
  {
    label: "GitHub token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  {
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    label: "npm token",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/,
  },
  {
    label: "Stripe live key",
    regex: /\b[sr]k_live_[A-Za-z0-9]{24,}\b/,
  },
  {
    label: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    label: "URL with embedded credentials",
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:([^/\s:@]+)@/i,
    allow: (match, groups) => isPlaceholder(groups[0] ?? ""),
  },
];

function matchSecret(line) {
  for (const pattern of SECRET_PATTERNS) {
    const match = line.match(pattern.regex);
    if (!match) {
      continue;
    }
    if (pattern.allow && pattern.allow(match[0], match.slice(1))) {
      continue;
    }
    return pattern.label;
  }
  return null;
}

/**
 * True for real dotenv files (.env, .env.local, …) but not the committed
 * template variants (.env.example / .env.sample / .env.template).
 * @param {string} file - Repo-relative path.
 * @returns {boolean} Whether the file is a likely real env file.
 */
export function isEnvFile(file) {
  const base = path.posix.basename(normalizeRepoPath(file));
  if (base === ".env") {
    return true;
  }
  if (!base.startsWith(".env.")) {
    return false;
  }
  return !/\.(example|sample|template)$/.test(base);
}

/**
 * Scan a `git diff --cached -U0` unified diff for added lines matching the
 * curated secret patterns. Removed and context lines never fire, so deleting
 * a secret is not punished.
 * @param {string} diffText - Unified diff output.
 * @returns {Array<{file: string, line: number, label: string}>} Findings.
 */
export function scanDiffForSecrets(diffText) {
  const findings = [];
  let currentFile = null;
  let newLine = 0;

  for (const rawLine of (diffText || "").split("\n")) {
    if (rawLine.startsWith("+++ ")) {
      const target = rawLine.slice(4).trim();
      currentFile = target.startsWith("b/")
        ? normalizeRepoPath(target.slice(2))
        : target === "/dev/null"
          ? null
          : normalizeRepoPath(target);
      continue;
    }
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (rawLine.startsWith("+")) {
      if (currentFile !== null) {
        const label = matchSecret(rawLine.slice(1));
        if (label) {
          findings.push({ file: currentFile, line: newLine, label });
        }
      }
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith(" ")) {
      newLine += 1;
    }
  }

  return findings;
}

/**
 * Path-based findings for staged dotenv files.
 * @param {string[]} stagedFiles - All staged repo-relative paths.
 * @returns {Array<{file: string, label: string}>} One finding per env file.
 */
export function envFileFindings(stagedFiles) {
  return stagedFiles.filter(isEnvFile).map((file) => ({
    file: normalizeRepoPath(file),
    label: ".env file",
  }));
}

/**
 * Drop findings whose file matches a `secretExempt` glob (test fixtures etc.).
 * @param {Array<{file: string}>} findings - Combined findings.
 * @param {string[]} exemptGlobs - Globs from precommitChecks.secretExempt.
 * @returns {Array<{file: string}>} Non-exempt findings.
 */
export function filterExemptFindings(findings, exemptGlobs) {
  if (!Array.isArray(exemptGlobs) || exemptGlobs.length === 0) {
    return findings;
  }
  const matchers = exemptGlobs.map((glob) => globToRegExp(glob));
  return findings.filter(
    (finding) => !matchers.some((matcher) => matcher.test(finding.file)),
  );
}

/**
 * Render findings as detail lines: "file:12 (label)" or "file (label)".
 * @param {Array<{file: string, line?: number, label: string}>} findings - Findings.
 * @param {number} [max=5] - Cap before summarizing the rest.
 * @returns {string[]} Human-readable finding lines.
 */
export function findingLines(findings, max = 5) {
  const lines = findings
    .slice(0, max)
    .map((finding) =>
      finding.line
        ? `${finding.file}:${finding.line} (${finding.label})`
        : `${finding.file} (${finding.label})`,
    );
  if (findings.length > max) {
    lines.push(`(+${findings.length - max} more)`);
  }
  return lines;
}

/**
 * Advisory issue for the consolidated pre-commit box, or null.
 * @param {Array<{file: string, line?: number, label: string}>} findings - Non-exempt findings.
 * @returns {object|null} Issue for buildAdvisoryMessage.
 */
export function secretsIssue(findings) {
  if (findings.length === 0) {
    return null;
  }
  return {
    autoFixable: false,
    type: "secrets",
    message: `${findings.length} possible secret${findings.length === 1 ? "" : "s"} staged`,
    detail: [
      ...findingLines(findings),
      "Never commit real credentials — rotate anything already exposed.",
    ].join("\n"),
  };
}
