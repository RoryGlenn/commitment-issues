// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Pure helpers behind the staged-secrets guard. High-precision by design:
// only unambiguous credential shapes and .env files are flagged, and only on
// lines *added* by the staged diff, so pre-existing strings never fire. No
// I/O here — the entry script hands in the diff text and staged paths.

import { Buffer } from "node:buffer";
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
    // The regex requires a non-empty password capture, so this group is always
    // present when the callback runs.
    allow: (match, groups) => isPlaceholder(groups[0]),
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

const GIT_PATH_ESCAPES = {
  a: "\x07",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

// Git uses C-style quoting for pathnames containing control characters. The
// secret scanner reads patch headers rather than shell words, so decode only
// Git's documented escapes and reject malformed quoting instead of guessing.
function decodeGitPatchPath(value) {
  if (!value.startsWith('"')) {
    return value;
  }

  const bytes = [];
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      const codePoint = String.fromCodePoint(value.codePointAt(index));
      bytes.push(...Buffer.from(codePoint));
      index += codePoint.length - 1;
      continue;
    }

    const escaped = value[index + 1];
    if (Object.hasOwn(GIT_PATH_ESCAPES, escaped)) {
      bytes.push(...Buffer.from(GIT_PATH_ESCAPES[escaped]));
      index += 1;
      continue;
    }
    if (!/[0-7]/.test(escaped)) {
      return null;
    }

    let octal = escaped;
    while (octal.length < 3 && /[0-7]/.test(value[index + 1 + octal.length])) {
      octal += value[index + 1 + octal.length];
    }
    bytes.push(Number.parseInt(octal, 8));
    index += octal.length;
  }
  return Buffer.from(bytes).toString("utf8");
}

function parsePatchTarget(header) {
  let pathToken = header;
  if (header.startsWith('"')) {
    let closingQuote = -1;
    for (let index = 1; index < header.length; index += 1) {
      if (header[index] === "\\") {
        index += 1;
      } else if (header[index] === '"') {
        closingQuote = index;
        break;
      }
    }
    const suffix = closingQuote === -1 ? null : header.slice(closingQuote + 1);
    if (suffix === null || (suffix !== "" && !suffix.startsWith("\t"))) {
      return { valid: false, file: null };
    }
    pathToken = header.slice(0, closingQuote + 1);
  }

  const decoded = decodeGitPatchPath(pathToken);
  if (decoded === null) {
    return { valid: false, file: null };
  }
  if (decoded === "/dev/null") {
    return { valid: true, file: null };
  }
  const file = decoded.startsWith("b/") ? decoded.slice(2) : decoded;
  return { valid: file.length > 0, file: normalizeRepoPath(file) };
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
 * Inspect a `git diff --cached -U0` unified diff for added lines matching the
 * curated secret patterns. Structural validation lets blocking callers fail
 * closed when successful Git output is not actually a complete patch.
 * @param {string} diffText - Unified diff output.
 * @returns {{findings: Array<{file: string, line: number, label: string}>, valid: boolean}} Findings and structural validity.
 */
export function inspectDiffForSecrets(diffText) {
  const findings = [];
  if (typeof diffText !== "string") {
    return { findings, valid: false };
  }
  if (diffText === "") {
    return { findings, valid: true };
  }

  let currentFile = null;
  let newLine = 0;
  let inHunk = false;
  let oldRemaining = 0;
  let newRemaining = 0;
  let sawDiff = false;
  let sawTarget = false;
  let valid = true;

  const finishHunk = () => {
    if (inHunk && (oldRemaining !== 0 || newRemaining !== 0)) {
      valid = false;
    }
    inHunk = false;
  };

  const lines = diffText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine.startsWith("diff --git ")) {
      finishHunk();
      sawDiff = true;
      currentFile = null;
      newLine = 0;
      sawTarget = false;
      continue;
    }
    const hunk = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      finishHunk();
      if (!sawDiff || !sawTarget) {
        valid = false;
      }
      oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLine = Number(hunk[3]);
      newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      inHunk = true;
      continue;
    }
    if (!inHunk && rawLine.startsWith("+++ ")) {
      const target = parsePatchTarget(rawLine.slice(4));
      valid &&= target.valid && sawDiff;
      currentFile = target.file;
      sawTarget = target.valid;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (oldRemaining === 0 && newRemaining === 0) {
      if (rawLine !== "" && rawLine !== "\\ No newline at end of file") {
        valid = false;
      }
      continue;
    }
    if (rawLine.startsWith("+")) {
      if (newRemaining === 0 || currentFile === null) {
        valid = false;
      } else {
        const label = matchSecret(rawLine.slice(1));
        if (label) {
          findings.push({ file: currentFile, line: newLine, label });
        }
      }
      newLine += 1;
      newRemaining -= 1;
      if (newRemaining < 0) {
        valid = false;
      }
      continue;
    }
    if (rawLine.startsWith("-")) {
      oldRemaining -= 1;
      if (oldRemaining < 0) {
        valid = false;
      }
      continue;
    }
    if (rawLine.startsWith(" ")) {
      oldRemaining -= 1;
      newRemaining -= 1;
      newLine += 1;
      if (oldRemaining < 0 || newRemaining < 0) {
        valid = false;
      }
      continue;
    }
    if (rawLine !== "\\ No newline at end of file") {
      valid = false;
    }
  }
  finishHunk();

  return { findings, valid: valid && sawDiff };
}

/**
 * Normalize process and parser failures into a non-sensitive scan outcome.
 * @param {{error?: Error|null, status?: number|null, stdout?: string}} result - Captured Git result.
 * @returns {{findings: Array<{file: string, line: number, label: string}>, inspected: boolean, outcome: "success"|"spawn-error"|"nonzero"|"malformed"}}
 */
export function inspectSecretDiffResult(result) {
  if (result?.error) {
    return { findings: [], inspected: false, outcome: "spawn-error" };
  }
  if (result?.status !== 0) {
    return { findings: [], inspected: false, outcome: "nonzero" };
  }
  const inspection = inspectDiffForSecrets(result.stdout);
  if (!inspection.valid) {
    return { findings: [], inspected: false, outcome: "malformed" };
  }
  return {
    findings: inspection.findings,
    inspected: true,
    outcome: "success",
  };
}

/**
 * Backward-compatible findings-only facade for callers that do not enforce a
 * policy on malformed input. Removed and context lines never fire.
 * @param {string} diffText - Unified diff output.
 * @returns {Array<{file: string, line: number, label: string}>} Findings.
 */
export function scanDiffForSecrets(diffText) {
  return inspectDiffForSecrets(diffText).findings;
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
    ],
  };
}
