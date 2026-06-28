import { spawnSync } from "node:child_process";
import fs from "node:fs";

const isWindows = process.platform === "win32";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: isWindows,
    ...options,
  });
}

function shortFileList(files, max = 3) {
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

const stagedResult = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMRT",
]);

if (stagedResult.error || stagedResult.status !== 0) {
  console.error("Unable to inspect staged files.");
  process.exit(1);
}

const stagedFiles = stagedResult.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const stagedJsFiles = stagedFiles.filter((file) => /\.(js|jsx|mjs)$/.test(file));
const stagedFormatFiles = stagedFiles.filter((file) =>
  /\.(js|jsx|mjs|json|css|scss|md|html|yml|yaml)$/.test(file),
);
const fixableFiles = Array.from(new Set([...stagedJsFiles, ...stagedFormatFiles]));

if (fixableFiles.length === 0) {
  console.log("No staged ESLint or Prettier targets to fix.");
  process.exit(0);
}

const unstagedResult = run("git", ["diff", "--name-only"]);

if (unstagedResult.error || unstagedResult.status !== 0) {
  console.error("Unable to inspect unstaged files.");
  process.exit(1);
}

const unstagedFiles = new Set(
  unstagedResult.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean),
);

const partiallyStagedFiles = fixableFiles.filter((file) => unstagedFiles.has(file));
const missingWorkingTreeFiles = fixableFiles.filter((file) => !fs.existsSync(file));

if (partiallyStagedFiles.length > 0) {
  console.error("Cannot safely fix partially staged files.");
  console.error(`Resolve staged vs unstaged changes first: ${shortFileList(partiallyStagedFiles)}`);
  process.exit(1);
}

if (missingWorkingTreeFiles.length > 0) {
  console.error("Cannot safely fix staged files missing from the working tree.");
  console.error(`Restore or unstage these files first: ${shortFileList(missingWorkingTreeFiles)}`);
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "lint-staged",
    "--continue-on-error",
    "--no-revert",
    "--quiet",
  ],
  {
    stdio: "inherit",
    shell: isWindows,
  },
);

process.exit(result.error ? 1 : (result.status ?? 1));