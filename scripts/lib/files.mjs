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

/**
 * Find the matching test for a source file (sibling, adjacent __tests__/, or a
 * top-level test/ or tests/ dir).
 * @param {string} file - Repo-relative source path.
 * @returns {string|null} The test file path, or null if none exists.
 */
export function findTestFile(file) {
  const normalized = normalizeRepoPath(file);
  const dirname = path.posix.dirname(normalized);
  const basename = path.posix.basename(
    normalized,
    path.posix.extname(normalized),
  );

  const candidateDirs = [
    dirname,
    path.posix.join(dirname, "__tests__"),
    "test",
    "tests",
  ];

  for (const dir of candidateDirs) {
    for (const suffix of testSuffixes) {
      const candidate = path.posix.join(dir, `${basename}${suffix}`);
      if (fs.existsSync(candidate)) {
        // Normalize to POSIX separators so the returned path matches git's
        // forward-slash output (dedupes cleanly in collectTestsForFiles and
        // keeps the displayed test command consistent on Windows).
        return normalizeRepoPath(candidate);
      }
    }
  }

  return null;
}

/**
 * Given a set of changed files, returns the test files worth running for them:
 * the changed test files themselves, plus any matching test discovered for a
 * changed source file. Shared by the commit hook and the pre-push gate.
 * @param {string[]} files - Changed/staged repo-relative paths.
 * @returns {string[]} De-duplicated list of test files to run.
 */
export function collectTestsForFiles(files) {
  const tests = new Set();
  for (const file of files) {
    const normalized = normalizeRepoPath(file);
    if (isTestFile(normalized)) {
      tests.add(normalized);
    } else if (codeFilePattern.test(normalized)) {
      const match = findTestFile(normalized);
      if (match) {
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
