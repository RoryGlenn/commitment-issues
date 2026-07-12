// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { loadPrecommitConfig } from "./config.mjs";

export const codeExtensions = [
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
];
export const formatExtensions = [
  ...codeExtensions,
  "json",
  "css",
  "scss",
  "md",
  "html",
  "yml",
  "yaml",
];

export const codeFilePattern = new RegExp(`\\.(${codeExtensions.join("|")})$`);
export const formatFilePattern = new RegExp(
  `\\.(${formatExtensions.join("|")})$`,
);
export const declarationFilePattern = /\.d\.(ts|mts|cts)$/;
export const testSuffixes = codeExtensions.flatMap((ext) => [
  `.test.${ext}`,
  `.spec.${ext}`,
]);

const storyFilePattern = /\.stories\.[^.]+$/;
const generatedFilePattern = /\.generated\.[^.]+$/;
const generatedDirPattern = /(^|\/)(generated|__generated__)\//;

/**
 * Normalize repo-relative paths to Git-style POSIX separators.
 * @param {string} file - Repo-relative file path.
 * @returns {string} Normalized repo-relative path.
 */
export function normalizeRepoPath(file) {
  let normalized = file.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

/**
 * Parse a NUL-terminated list emitted by a Git `-z` pathname query.
 * Path bytes are preserved exactly; a non-empty unterminated or internally
 * empty record is malformed because Git never emits an empty pathname.
 *
 * @param {string} output - Raw NUL-delimited output from Git.
 * @returns {string[]|null} Exact paths, or null when output is malformed.
 */
export function parseNulPaths(output) {
  if (output === "") {
    return [];
  }
  if (typeof output !== "string" || !output.endsWith("\0")) {
    return null;
  }

  const paths = output.slice(0, -1).split("\0");
  return paths.some((file) => file.length === 0) ? null : paths;
}

/**
 * Parse NUL-delimited `git diff --name-status -z` output into paths that can
 * affect related-test discovery. Deletions remain present, and rename/copy
 * records retain both path fields exactly.
 *
 * @param {string} output - Raw name-status output from Git.
 * @returns {string[]|null} Paths, or null when the output is malformed.
 */
export function parseNameStatusPaths(output) {
  if (output !== "" && !output.endsWith("\0")) {
    return null;
  }
  const fields = output.split("\0");
  if (fields.at(-1) === "") {
    fields.pop();
  }

  const files = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const firstPath = fields[index++];
    if (
      !status ||
      !/^[ACDMRTUXB](?:\d+)?$/.test(status) ||
      firstPath === undefined ||
      firstPath.length === 0
    ) {
      return null;
    }

    const changeType = status[0];
    if (changeType === "R" || changeType === "C") {
      const secondPath = fields[index++];
      if (secondPath === undefined || secondPath.length === 0) {
        return null;
      }
      files.push(firstPath);
      files.push(secondPath);
    } else {
      files.push(firstPath);
    }
  }

  return files;
}

/**
 * Parse `git ls-files --stage -z` records without interpreting pathname
 * whitespace. The metadata header is separated from the path by Git's first
 * tab; any later tabs belong to the pathname.
 *
 * @param {string} output - Raw staged-index listing.
 * @returns {Array<{mode: string, object: string, stage: number, file: string}>|null}
 *   Parsed entries, or null for malformed output.
 */
export function parseLsFilesStage(output) {
  const records = parseNulPaths(output);
  if (records === null) {
    return null;
  }

  const entries = [];
  for (const record of records) {
    const separator = record.indexOf("\t");
    if (separator < 0) {
      return null;
    }
    const header = record.slice(0, separator);
    const file = record.slice(separator + 1);
    const match = header.match(/^([0-7]{6}) ([0-9a-f]+) ([0-3])$/i);
    if (!match || file.length === 0) {
      return null;
    }
    entries.push({
      mode: match[1],
      object: match[2],
      stage: Number(match[3]),
      file,
    });
  }
  return entries;
}

/**
 * @param {string} file - Repo-relative file path.
 * @returns {boolean} True when the path is inside (or is) a node_modules dir.
 */
export function isThirdPartyPath(file) {
  return /(^|\/)node_modules\//.test(`${normalizeRepoPath(file)}/`);
}

function repoBasename(file) {
  return path.posix.basename(normalizeRepoPath(file));
}

/**
 * @param {string} file - Repo-relative file path.
 * @returns {boolean} True for *.test.* / *.spec.* files.
 */
export function isTestFile(file) {
  const normalized = normalizeRepoPath(file);
  return testSuffixes.some((suffix) => normalized.endsWith(suffix));
}

/**
 * @param {string} file - Repo-relative file path.
 * @returns {boolean} True if the file lives under test/tests/__tests__/__mocks__.
 */
export function isInTestDir(file) {
  return /(^|\/)(test|tests|__tests__|__mocks__)\//.test(
    normalizeRepoPath(file),
  );
}

/**
 * @param {string} file - Repo-relative file path.
 * @returns {boolean} True for dotfiles or *.config.* configuration files.
 */
export function isConfigFile(file) {
  const base = repoBasename(file);
  return base.startsWith(".") || /\.config\.[^.]+$/.test(base);
}

function isStoryFile(file) {
  return storyFilePattern.test(repoBasename(file));
}

function isGeneratedFile(file) {
  const normalized = normalizeRepoPath(file);
  return (
    generatedDirPattern.test(normalized) ||
    generatedFilePattern.test(repoBasename(normalized))
  );
}

/**
 * Convert a simple glob (supporting *, **, and ?) to an anchored RegExp.
 * @param {string} glob - Glob pattern.
 * @returns {RegExp} Anchored matcher for repo-relative paths.
 */
export function globToRegExp(glob) {
  const normalizedGlob = normalizeRepoPath(glob);
  let pattern = "";
  let i = 0;
  while (i < normalizedGlob.length) {
    const char = normalizedGlob[i];
    if (char === "*" && normalizedGlob[i + 1] === "*") {
      i += 2;
      if (normalizedGlob[i] === "/") {
        pattern += "(?:.*/)?";
        i += 1;
      } else {
        pattern += ".*";
      }
    } else if (char === "*") {
      pattern += "[^/]*";
      i += 1;
    } else if (char === "?") {
      pattern += "[^/]";
      i += 1;
    } else if (/[.+^${}()|[\]\\]/.test(char)) {
      pattern += `\\${char}`;
      i += 1;
    } else {
      pattern += char;
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

function loadTestExemptGlobs() {
  const list = loadPrecommitConfig().testExempt;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((entry) => typeof entry === "string")
    .map((entry) => globToRegExp(entry));
}

const testExemptGlobs = loadTestExemptGlobs();

function isUserExempt(file) {
  const normalized = normalizeRepoPath(file);
  return testExemptGlobs.some((pattern) => pattern.test(normalized));
}

/**
 * Staged code files we never expect to ship with a dedicated unit test.
 * @param {string} file - Repo-relative file path.
 * @returns {boolean} True when the file is exempt from the missing-test check.
 */
export function isTestExemptFile(file) {
  const normalized = normalizeRepoPath(file);
  return (
    isTestFile(normalized) ||
    isInTestDir(normalized) ||
    isConfigFile(normalized) ||
    declarationFilePattern.test(normalized) ||
    isStoryFile(normalized) ||
    isGeneratedFile(normalized) ||
    isUserExempt(normalized)
  );
}

function packageRootFor(file) {
  let current = path.posix.dirname(file);
  while (current !== ".") {
    if (fs.existsSync(path.posix.join(current, "package.json"))) {
      return current;
    }
    const parent = path.posix.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  // A package.json can itself be deleted in the pushed change. Preserve its
  // workspace boundary from the root declaration so a deleted source does not
  // suddenly fall through to an unrelated root basename test.
  try {
    const rootPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const workspaceGlobs = Array.isArray(rootPackage.workspaces)
      ? rootPackage.workspaces
      : Array.isArray(rootPackage.workspaces?.packages)
        ? rootPackage.workspaces.packages
        : [];
    const matchers = workspaceGlobs
      .filter((glob) => typeof glob === "string")
      .map((glob) => globToRegExp(glob.replace(/\/$/, "")));
    current = path.posix.dirname(file);
    while (current !== ".") {
      if (matchers.some((matcher) => matcher.test(current))) {
        return current;
      }
      current = path.posix.dirname(current);
    }
  } catch {
    // A missing/malformed root package simply means no declared boundary.
  }

  return "";
}

function existingTests(candidateBases) {
  const matches = [];
  for (const candidateBase of candidateBases) {
    for (const suffix of testSuffixes) {
      const candidate = `${candidateBase}${suffix}`;
      if (fs.existsSync(candidate)) {
        matches.push(normalizeRepoPath(candidate));
      }
    }
  }
  return [...new Set(matches)];
}

/**
 * Find the most-specific matching test set for a source file.
 *
 * Candidate tiers are deterministic: colocated tests, package-relative mirror
 * paths, package-local source-root fallbacks, then the legacy root basename
 * fallback. Every existing candidate in the first non-empty tier is returned.
 * A nested package never falls through to a root basename, preventing another
 * workspace with the same source basename from stealing its test selection.
 *
 * @param {string} file - Repo-relative source path.
 * @returns {string[]} Matching test file paths.
 */
export function findTestFiles(file) {
  const normalized = normalizeRepoPath(file);
  const dirname = path.posix.dirname(normalized);
  const basename = path.posix.basename(
    normalized,
    path.posix.extname(normalized),
  );

  const colocated = existingTests([
    path.posix.join(dirname, basename),
    path.posix.join(dirname, "__tests__", basename),
  ]);
  if (colocated.length > 0) {
    return colocated;
  }

  const packageRoot = packageRootFor(normalized);
  const relative = path.posix.relative(packageRoot || ".", normalized);
  const relativeBase = relative.slice(0, -path.posix.extname(relative).length);
  const testRoots = ["test", "tests"].map((dir) =>
    packageRoot ? path.posix.join(packageRoot, dir) : dir,
  );

  const mirrored = existingTests(
    testRoots.map((dir) => path.posix.join(dir, relativeBase)),
  );
  if (mirrored.length > 0) {
    return mirrored;
  }

  const relativeParts = relativeBase.split("/");
  if (["src", "lib"].includes(relativeParts[0]) && relativeParts.length > 1) {
    const withoutSourceRoot = relativeParts.slice(1).join("/");
    const packageFallback = existingTests(
      testRoots.map((dir) => path.posix.join(dir, withoutSourceRoot)),
    );
    if (packageFallback.length > 0) {
      return packageFallback;
    }
  }

  // Backward compatibility for single-package repositories that historically
  // used test/<basename>. A nested package is intentionally not allowed to
  // escape its package boundary and claim this root-level fallback.
  return packageRoot === ""
    ? existingTests([
        path.posix.join("test", basename),
        path.posix.join("tests", basename),
      ])
    : [];
}

/**
 * Find the first deterministic test match for compatibility with callers that
 * only need to know whether a test exists.
 *
 * @param {string} file - Repo-relative source path.
 * @returns {string|null} First test file path, or null if none exists.
 */
export function findTestFile(file) {
  return findTestFiles(file)[0] ?? null;
}

/**
 * Given a set of changed files, returns the test files worth running for them:
 * the changed test files themselves, plus any matching test discovered for a
 * changed source file. Vendored node_modules paths are skipped — their tests
 * are never ours to run. Shared by the commit hook and the pre-push gate.
 * @param {string[]} files - Changed/staged repo-relative paths.
 * @returns {string[]} De-duplicated list of test files to run.
 */
export function collectTestsForFiles(files) {
  const tests = new Set();
  for (const file of files) {
    const normalized = normalizeRepoPath(file);
    if (isThirdPartyPath(normalized)) {
      continue;
    }
    if (isTestFile(normalized)) {
      tests.add(normalized);
    } else if (codeFilePattern.test(normalized)) {
      for (const match of findTestFiles(normalized)) {
        tests.add(match);
      }
    }
  }
  return [...tests];
}

/**
 * Render a compact "a, b, c (+N more)" list for boxed output.
 * @param {string[]} files - File paths.
 * @param {number} [max=5] - How many to show before summarizing the rest.
 * @returns {string} The compacted list.
 */
export function shortFileList(files, max = 5) {
  const shown = files.slice(0, max);
  if (shown.length === 0) {
    return "";
  }

  const extra = files.length - shown.length;
  if (extra > 0) {
    return `${shown.join(", ")} (+${extra} more)`;
  }

  return shown.join(", ");
}

/**
 * Remove an owned path while preserving a user-facing cleanup result. The
 * injectable remover keeps filesystem permission/race failures deterministic
 * in unit tests without weakening real cleanup behavior.
 * @param {string} filePath - Path to remove.
 * @param {string} [displayName] - Path label for user-facing output.
 * @param {(filePath: string) => void} [remove] - Removal implementation.
 * @returns {{removed: string[], manualCleanup: string[]}} Cleanup result.
 */
export function removeOwnedPath(
  filePath,
  displayName = filePath,
  remove = fs.rmSync,
) {
  try {
    remove(filePath);
    return { removed: [displayName], manualCleanup: [] };
  } catch {
    return {
      removed: [],
      manualCleanup: [`Could not remove ${displayName}.`],
    };
  }
}
