import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import { isWindows, run, TOOL_TIMEOUT_MS } from "./lib/process.mjs";
import {
  codeFilePattern,
  formatFilePattern,
  shortFileList,
} from "./lib/files.mjs";

const headResult = run("git", ["rev-parse", "--verify", "HEAD"]);

if (headResult.error || headResult.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect the latest commit."),
    "",
    pc.dim(
      "Check that Git is available and the current directory has at least one commit.",
    ),
  ]);
  process.exit(1);
}

const remoteContainsResult = run("git", ["branch", "-r", "--contains", "HEAD"]);
const headIsPushed =
  !remoteContainsResult.error &&
  remoteContainsResult.status === 0 &&
  remoteContainsResult.stdout.trim().length > 0;

if (headIsPushed) {
  errorBox([
    pc.bold("The latest commit has already been pushed."),
    "",
    pc.dim(
      "Amending it would rewrite published history. Make a new commit with fixes instead.",
    ),
  ]);
  process.exit(1);
}

const stagedDirtyResult = run("git", ["diff", "--cached", "--name-only"]);
const unstagedDirtyResult = run("git", ["diff", "--name-only"]);

if (
  stagedDirtyResult.error ||
  stagedDirtyResult.status !== 0 ||
  unstagedDirtyResult.error ||
  unstagedDirtyResult.status !== 0
) {
  errorBox([
    pc.bold("Unable to inspect the current working tree."),
    "",
    pc.dim(
      "Check that Git is available and the working tree can be inspected.",
    ),
  ]);
  process.exit(1);
}

const dirtyTrackedFiles = Array.from(
  new Set(
    `${stagedDirtyResult.stdout}\n${unstagedDirtyResult.stdout}`
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean),
  ),
);

if (dirtyTrackedFiles.length > 0) {
  errorBox([
    pc.bold("Cannot safely amend the latest commit."),
    "",
    pc.dim("Commit, stash, or discard tracked changes first:"),
    "",
    `  ${shortFileList(dirtyTrackedFiles)}`,
  ]);
  process.exit(1);
}

const committedFilesResult = run("git", [
  "diff-tree",
  "--root",
  "--no-commit-id",
  "--name-only",
  "-r",
  "--diff-filter=ACMRT",
  "HEAD",
]);

if (committedFilesResult.error || committedFilesResult.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect files from the latest commit."),
    "",
    pc.dim("Check that the latest commit can be read from Git history."),
  ]);
  process.exit(1);
}

const committedFiles = committedFilesResult.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const committedJsFiles = committedFiles.filter((file) =>
  codeFilePattern.test(file),
);
const committedFormatFiles = committedFiles.filter((file) =>
  formatFilePattern.test(file),
);
const formatOnlyFiles = committedFormatFiles.filter(
  (file) => !codeFilePattern.test(file),
);
const fixableFiles = Array.from(
  new Set([...committedJsFiles, ...committedFormatFiles]),
);

if (fixableFiles.length === 0) {
  infoBox([
    pc.bold("No fixable files in the latest commit."),
    "",
    pc.dim("The latest commit does not contain staged-fixer targets."),
  ]);
  process.exit(0);
}

let hasRemainingIssues = false;

if (committedJsFiles.length > 0) {
  const jsFixResult = spawnSync(
    "node",
    ["scripts/fix-staged-js.mjs", ...committedJsFiles],
    {
      stdio: "inherit",
      shell: isWindows,
      timeout: TOOL_TIMEOUT_MS,
    },
  );

  if (jsFixResult.error || (jsFixResult.status || 0) !== 0) {
    hasRemainingIssues = true;
  }
}

if (formatOnlyFiles.length > 0) {
  const prettierResult = spawnSync(
    "npx",
    ["prettier", "--write", "--ignore-unknown", "--", ...formatOnlyFiles],
    {
      stdio: "inherit",
      shell: isWindows,
      timeout: TOOL_TIMEOUT_MS,
    },
  );

  if (prettierResult.error || (prettierResult.status || 0) !== 0) {
    hasRemainingIssues = true;
  }
}

const addResult = run("git", ["add", "--", ...fixableFiles]);

if (addResult.error || addResult.status !== 0) {
  errorBox([
    pc.bold("Available fixes ran, but files could not be staged."),
    "",
    pc.dim("Stage the changes manually and amend the latest commit."),
  ]);
  process.exit(1);
}

const stagedFixResult = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--",
  ...fixableFiles,
]);

if (stagedFixResult.error || stagedFixResult.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect staged fixes for the latest commit."),
    "",
    pc.dim("Check the Git index and try again."),
  ]);
  process.exit(1);
}

const changedFiles = stagedFixResult.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

console.log("");

if (changedFiles.length === 0) {
  if (hasRemainingIssues) {
    warningBox([
      pc.bold("Manual attention still needed."),
      "",
      pc.dim("No automatic changes were added to the latest commit."),
      pc.dim(
        "Review the ESLint or Prettier output above and amend manually after fixing.",
      ),
    ]);
    process.exit(1);
  }

  successBox([
    pc.bold("Latest commit already clean."),
    "",
    pc.dim(
      `Checked ${fixableFiles.length} file${fixableFiles.length === 1 ? "" : "s"} from the latest commit.`,
    ),
    pc.dim(shortFileList(fixableFiles)),
  ]);
  process.exit(0);
}

const amendResult = spawnSync("git", ["commit", "--amend", "--no-edit"], {
  stdio: "inherit",
  shell: isWindows,
  timeout: TOOL_TIMEOUT_MS,
});

if (amendResult.error || (amendResult.status || 0) !== 0) {
  errorBox([
    pc.bold(
      "Automatic fixes were staged, but the latest commit could not be amended.",
    ),
    "",
    pc.dim(
      "Run git commit --amend --no-edit manually after reviewing the staged changes.",
    ),
  ]);
  process.exit(1);
}

console.log("");

if (hasRemainingIssues) {
  warningBox([
    pc.bold("Latest commit amended with available fixes."),
    "",
    pc.dim("Some issues still need manual attention."),
    pc.dim(`Updated files: ${shortFileList(changedFiles)}`),
  ]);
  process.exit(1);
}

successBox([
  pc.bold("Latest commit amended with automatic fixes."),
  "",
  pc.dim(
    `Updated ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} from the latest commit.`,
  ),
  pc.dim(shortFileList(changedFiles)),
]);

process.exit(0);
