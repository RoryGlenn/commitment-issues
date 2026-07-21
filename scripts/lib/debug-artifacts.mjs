// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Pure helpers for the opt-in staged debug-artifact advisory. Rules are
// deliberately line-anchored and language-scoped: a missed unusual form is
// preferable to training contributors to ignore noisy hook output.

import path from "node:path";
import { DEFAULT_GENERATED_GLOBS } from "./commit-guards.mjs";
import { globToRegExp, normalizeRepoPath } from "./files.mjs";
import { inspectAddedLines, inspectStagedDiffResult } from "./secret-scan.mjs";

export const DEBUG_ARTIFACT_CHECK_ID = "debug-artifacts";
export const DEBUG_ARTIFACT_FINDING_ID = "debug-artifacts.detected";
export const DEBUG_ARTIFACT_UNAVAILABLE_ID = "debug-artifacts.unavailable";

const DEFAULT_DEBUG_ARTIFACT_SOURCE_EXEMPT = [
  "docs/**",
  "**/fixtures/**",
  "**/__fixtures__/**",
  "**/__snapshots__/**",
  "**/*.snap",
];

export const DEFAULT_DEBUG_ARTIFACT_EXEMPT = [
  ...DEFAULT_DEBUG_ARTIFACT_SOURCE_EXEMPT,
  ...DEFAULT_GENERATED_GLOBS,
];

const LANGUAGE_EXTENSIONS = {
  javascript: new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
  ]),
  python: new Set([".py", ".pyw"]),
  ruby: new Set([".rb", ".rake"]),
};

/**
 * Curated, stable rules for common temporary debug statements. Every regular
 * expression matches one complete physical line. Same-line strings, prose,
 * and comment-prefixed statements do not match; a code-looking line inside a
 * multiline string or block comment can match because a zero-context patch
 * does not expose enough lexical state to classify it soundly.
 */
export const DEBUG_ARTIFACT_PATTERNS = [
  {
    id: "javascript.console-log",
    label: "console.log call",
    language: "javascript",
    regex: /^\s*console\.log\s*\(.*\)\s*;?\s*(?:\/\/.*)?$/,
    rationale:
      "A stand-alone console.log call is commonly temporary instrumentation.",
  },
  {
    id: "javascript.debugger",
    label: "debugger statement",
    language: "javascript",
    regex: /^\s*debugger\s*;?\s*(?:\/\/.*)?$/,
    rationale: "A stand-alone debugger statement pauses an attached runtime.",
  },
  {
    id: "python.print",
    label: "Python print call",
    language: "python",
    regex: /^\s*print\s*\(.*\)\s*(?:#.*)?$/,
    rationale: "A stand-alone Python print call is a common temporary trace.",
  },
  {
    id: "python.pdb-set-trace",
    label: "pdb.set_trace call",
    language: "python",
    regex: /^\s*pdb\.set_trace\s*\(\s*\)\s*(?:#.*)?$/,
    rationale: "pdb.set_trace deliberately interrupts normal execution.",
  },
  {
    id: "ruby.binding-pry",
    label: "binding.pry call",
    language: "ruby",
    regex: /^\s*binding\.pry\s*(?:#.*)?$/,
    rationale: "binding.pry deliberately interrupts normal execution.",
  },
  {
    id: "comment.todo-remove",
    label: "TODO remove marker",
    language: "source",
    regex: /^\s*(?:\/\/|#|\/\*+|\*+)\s*TODO(?:\([^)]*\))?:?\s+remove\b.*$/i,
    rationale:
      "A comment explicitly saying TODO remove declares temporary code.",
  },
  {
    id: "comment.fixme-temporary",
    label: "FIXME temporary marker",
    language: "source",
    regex: /^\s*(?:\/\/|#|\/\*+|\*+)\s*FIXME(?:\([^)]*\))?:?\s+temporary\b.*$/i,
    rationale:
      "A comment explicitly saying FIXME temporary declares temporary code.",
  },
];

function fileLanguage(file) {
  const base = path.posix.basename(file);
  if (base === "Rakefile") {
    return "ruby";
  }
  const extension = path.posix.extname(file).toLowerCase();
  for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (extensions.has(extension)) {
      return language;
    }
  }
  return null;
}

function patternApplies(pattern, language) {
  return (
    language !== null &&
    (pattern.language === "source" || pattern.language === language)
  );
}

/**
 * Resolve the opt-in scan and its path exemptions. Without an explicit debug
 * list, documentation/fixture defaults compose with the effective generated
 * paths. An explicit debug list replaces all defaults.
 * @param {object} config - Sanitized precommitChecks config.
 * @returns {{scanDebugArtifacts: boolean, debugArtifactExempt: string[]}}
 */
export function resolveDebugArtifactConfig(config = {}) {
  const generatedPaths = Array.isArray(config.generatedPaths)
    ? config.generatedPaths
    : DEFAULT_GENERATED_GLOBS;
  return {
    scanDebugArtifacts: config.scanDebugArtifacts === true,
    debugArtifactExempt: Array.isArray(config.debugArtifactExempt)
      ? config.debugArtifactExempt
      : [...DEFAULT_DEBUG_ARTIFACT_SOURCE_EXEMPT, ...generatedPaths],
  };
}

function collectDebugArtifactFindings(addedLines, exemptGlobs, normalizePaths) {
  const exemptions = exemptGlobs.map(globToRegExp);
  const findings = [];
  for (const addedLine of addedLines) {
    const file = normalizePaths
      ? normalizeRepoPath(addedLine.file)
      : addedLine.file;
    if (exemptions.some((matcher) => matcher.test(file))) {
      continue;
    }
    const language = fileLanguage(file);
    const pattern = DEBUG_ARTIFACT_PATTERNS.find(
      (candidate) =>
        patternApplies(candidate, language) &&
        candidate.regex.test(addedLine.content),
    );
    if (pattern) {
      findings.push({
        file,
        line: addedLine.line,
        ruleId: pattern.id,
        label: pattern.label,
      });
    }
  }
  return findings;
}

/**
 * Match validated added lines while honoring normalized path exemptions.
 * @param {Array<{file: string, line: number, content: string}>} addedLines - Parsed additions.
 * @param {string[]} exemptGlobs - Exact configured/default exemption policy.
 * @returns {Array<{file: string, line: number, ruleId: string, label: string}>}
 */
export function debugArtifactFindingsForAddedLines(
  addedLines,
  exemptGlobs = DEFAULT_DEBUG_ARTIFACT_EXEMPT,
) {
  return collectDebugArtifactFindings(addedLines, exemptGlobs, true);
}

/**
 * Match added lines whose paths have already been decoded from Git. Unlike
 * Windows-style caller input, a backslash in one of these paths is a legal
 * literal filename byte and must not be rewritten as a separator.
 * @param {Array<{file: string, line: number, content: string}>} addedLines - Parsed Git additions.
 * @param {string[]} exemptGlobs - Exact configured/default exemption policy.
 * @returns {Array<{file: string, line: number, ruleId: string, label: string}>}
 */
export function debugArtifactFindingsForGitAddedLines(
  addedLines,
  exemptGlobs = DEFAULT_DEBUG_ARTIFACT_EXEMPT,
) {
  return collectDebugArtifactFindings(addedLines, exemptGlobs, false);
}

/**
 * Inspect a unified staged patch with the shared structural/path parser.
 * @param {string} diffText - `git diff --cached -U0` output.
 * @param {string[]} [exemptGlobs] - Effective path exemptions.
 * @returns {{findings: Array<object>, valid: boolean}}
 */
export function inspectDiffForDebugArtifacts(
  diffText,
  exemptGlobs = DEFAULT_DEBUG_ARTIFACT_EXEMPT,
) {
  const inspection = inspectAddedLines(diffText);
  return {
    findings: debugArtifactFindingsForGitAddedLines(
      inspection.addedLines,
      exemptGlobs,
    ),
    valid: inspection.valid,
  };
}

/**
 * Normalize Git/process failures for standalone callers of the debug scan.
 * @param {object} result - Captured staged-diff process result.
 * @param {string[]} [exemptGlobs] - Effective path exemptions.
 * @returns {{findings: Array<object>, inspected: boolean, outcome: string}}
 */
export function inspectDebugArtifactDiffResult(
  result,
  exemptGlobs = DEFAULT_DEBUG_ARTIFACT_EXEMPT,
) {
  const inspection = inspectStagedDiffResult(result);
  return {
    findings: debugArtifactFindingsForGitAddedLines(
      inspection.addedLines,
      exemptGlobs,
    ),
    inspected: inspection.inspected,
    outcome: inspection.outcome,
  };
}

/**
 * Compact detail lines for the consolidated human finding.
 * @param {Array<{file: string, line: number, label: string}>} findings - Debug findings.
 * @param {number} [max=5] - Maximum expanded locations.
 * @returns {string[]}
 */
export function debugArtifactFindingLines(findings, max = 5) {
  const lines = findings
    .slice(0, max)
    .map((finding) => `${finding.file}:${finding.line} (${finding.label})`);
  if (findings.length > max) {
    lines.push(`(+${findings.length - max} more)`);
  }
  return lines;
}

/**
 * One aggregate advisory issue for every detected artifact.
 * @param {Array<object>} findings - Non-exempt findings.
 * @returns {object|null}
 */
export function debugArtifactsIssue(findings) {
  if (findings.length === 0) {
    return null;
  }
  return {
    id: DEBUG_ARTIFACT_FINDING_ID,
    autoFixable: false,
    type: DEBUG_ARTIFACT_CHECK_ID,
    message: `${findings.length} temporary debug artifact${findings.length === 1 ? "" : "s"} staged`,
    detail: [
      ...debugArtifactFindingLines(findings),
      "Remove temporary instrumentation or add an intentional path exemption.",
    ],
  };
}

/**
 * Advisory issue for an enabled scan whose staged patch was unavailable.
 * @param {string} outcome - Shared staged-diff outcome.
 * @returns {object}
 */
export function debugArtifactScanUnavailableIssue(outcome) {
  return {
    id: DEBUG_ARTIFACT_UNAVAILABLE_ID,
    autoFixable: false,
    type: DEBUG_ARTIFACT_CHECK_ID,
    message: "Debug artifact scan unavailable",
    detail:
      outcome === "malformed"
        ? "Git returned a malformed staged patch; temporary debug artifacts could not be checked."
        : "Git could not inspect the staged diff; temporary debug artifacts could not be checked.",
  };
}
