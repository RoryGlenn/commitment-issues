import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import { run, runTool, TOOL_TIMEOUT_MS } from "./lib/process.mjs";
import {
  codeFilePattern,
  formatFilePattern,
  shortFileList,
} from "./lib/files.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const GIT_PATH_ARGS = ["-c", "core.quotePath=false"];

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

// Fail closed: if Git cannot answer, the commit cannot be proven unpushed, and
// amending pushed history is the one thing this command must never do.
if (remoteContainsResult.error || remoteContainsResult.status !== 0) {
  errorBox([
    pc.bold("Unable to verify the latest commit is unpushed."),
    "",
    pc.dim("Amending rewrites history, so nothing was changed. Check that"),
    pc.dim("Git can list remote branches (git branch -r) and try again."),
  ]);
  process.exit(1);
}

const headIsPushed = remoteContainsResult.stdout.trim().length > 0;

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

const stagedDirtyResult = run("git", [
  ...GIT_PATH_ARGS,
  "diff",
  "--cached",
  "--name-only",
]);
const unstagedDirtyResult = run("git", [
  ...GIT_PATH_ARGS,
  "diff",
  "--name-only",
]);

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
  ...GIT_PATH_ARGS,
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
  const jsFixResult = run(
    process.execPath,
    [path.join(scriptDir, "fix-staged-js.mjs"), ...committedJsFiles],
    {
      stdio: "inherit",
      timeout: TOOL_TIMEOUT_MS,
    },
  );

  if (jsFixResult.error || (jsFixResult.status || 0) !== 0) {
    hasRemainingIssues = true;
  }
}

if (formatOnlyFiles.length > 0) {
  const prettierResult = runTool(
    "prettier",
    [
      "--cache",
      "--cache-location",
      ".prettiercache",
      "--cache-strategy",
      "content",
      "--write",
      "--ignore-unknown",
      "--",
      ...formatOnlyFiles,
    ],
    {
      stdio: "inherit",
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
  ...GIT_PATH_ARGS,
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

// The staged fixes differ from the latest commit, but if they merely reverted
// that commit's only changes, the index now matches the parent tree — amending
// would create an empty commit, which git refuses. Detect that and guide the
// user to drop the now-redundant commit instead of failing confusingly.
const parentRef = run("git", ["rev-parse", "--verify", "--quiet", "HEAD^"]);
if (!parentRef.error && parentRef.status === 0) {
  const diffVsParent = run("git", [
    ...GIT_PATH_ARGS,
    "diff",
    "--cached",
    "--quiet",
    "HEAD^",
  ]);
  if (!diffVsParent.error && diffVsParent.status === 0) {
    warningBox([
      pc.bold("Nothing to amend — the fixes emptied the latest commit."),
      "",
      pc.dim("The automatic fixes reverted the only changes in the latest"),
      pc.dim("commit, so amending it would create an empty commit."),
      "",
      pc.dim("Drop the now-redundant commit with:  git reset --soft HEAD^"),
    ]);
    process.exit(0);
  }
}

const amendResult = run(
  "git",
  // Skip the pre-commit hook: commit:fix already lint/format-checked these
  // files, so re-running the advisory hook here would only print a duplicate box.
  ["commit", "--amend", "--no-edit", "--no-verify"],
  {
    stdio: "inherit",
    timeout: TOOL_TIMEOUT_MS,
  },
);

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
