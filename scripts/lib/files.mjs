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

export function isTestFile(file) {
  return testSuffixes.some((suffix) => file.endsWith(suffix));
}

export function isInTestDir(file) {
  return /(^|\/)(test|tests|__tests__|__mocks__)\//.test(file);
}

export function isConfigFile(file) {
  const base = path.basename(file);
  return base.startsWith(".") || /\.config\.[^.]+$/.test(base);
}

function isStoryFile(file) {
  return storyFilePattern.test(path.basename(file));
}

function isGeneratedFile(file) {
  return (
    generatedDirPattern.test(file) ||
    generatedFilePattern.test(path.basename(file))
  );
}

// Convert a simple glob (supporting *, **, and ?) to an anchored RegExp.
export function globToRegExp(glob) {
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i += 2;
      if (glob[i] === "/") {
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
  return testExemptGlobs.some((pattern) => pattern.test(file));
}

// Staged code files we never expect to ship with a dedicated unit test.
export function isTestExemptFile(file) {
  return (
    isTestFile(file) ||
    isInTestDir(file) ||
    isConfigFile(file) ||
    declarationFilePattern.test(file) ||
    isStoryFile(file) ||
    isGeneratedFile(file) ||
    isUserExempt(file)
  );
}

export function findTestFile(file) {
  const dirname = path.dirname(file);
  const basename = path.basename(file, path.extname(file));

  const candidateDirs = [
    dirname,
    path.join(dirname, "__tests__"),
    "test",
    "tests",
  ];

  for (const dir of candidateDirs) {
    for (const suffix of testSuffixes) {
      const candidate = path.join(dir, `${basename}${suffix}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

// Given a set of changed files, returns the test files worth running for them:
// the staged/changed test files themselves, plus any matching test discovered
// for a changed source file. Shared by the commit hook (staged tests) and the
// pre-push gate (tests for pushed files).
export function collectTestsForFiles(files) {
  const tests = new Set();
  for (const file of files) {
    if (isTestFile(file)) {
      tests.add(file);
    } else if (codeFilePattern.test(file)) {
      const match = findTestFile(file);
      if (match) {
        tests.add(match);
      }
    }
  }
  return [...tests];
}

export function shortFileList(files, max = 3) {
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
