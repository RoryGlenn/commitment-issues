import fs from "node:fs";
import pc from "picocolors";
import { errorBox, infoBox, successBox, warningBox } from "./lib/ui.mjs";
import { run, runTool } from "./lib/process.mjs";
import {
  codeFilePattern,
  formatFilePattern,
  shortFileList,
} from "./lib/files.mjs";

function getIndexSnapshot(files) {
  // Defensive guard for a reusable helper: every caller passes the non-empty
  // fixable-file set, so the empty case is not reached in practice.
  /* node:coverage disable */
  if (files.length === 0) {
    return "";
  }
  /* node:coverage enable */

  const snapshotResult = run("git", ["ls-files", "--stage", "--", ...files]);

  if (snapshotResult.error || snapshotResult.status !== 0) {
    return null;
  }

  return snapshotResult.stdout.trimEnd();
}

const stagedResult = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMRT",
]);

if (stagedResult.error || stagedResult.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect staged files."),
    "",
    pc.dim(
      "Check that Git is available and the current directory is a repository.",
    ),
  ]);
  process.exit(1);
}

const stagedFiles = stagedResult.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const stagedJsFiles = stagedFiles.filter((file) => codeFilePattern.test(file));
const stagedFormatFiles = stagedFiles.filter((file) =>
  formatFilePattern.test(file),
);
const fixableFiles = Array.from(
  new Set([...stagedJsFiles, ...stagedFormatFiles]),
);

if (fixableFiles.length === 0) {
  infoBox([
    pc.bold("No staged files to fix."),
    "",
    pc.dim(
      "Stage a JS, JSON, CSS, Markdown, HTML, or YAML file and run npm run fix:staged again.",
    ),
  ]);
  process.exit(0);
}

const unstagedResult = run("git", ["diff", "--name-only"]);

if (unstagedResult.error || unstagedResult.status !== 0) {
  errorBox([
    pc.bold("Unable to inspect unstaged files."),
    "",
    pc.dim(
      "Check that Git is available and the working tree can be inspected.",
    ),
  ]);
  process.exit(1);
}

const unstagedFiles = new Set(
  unstagedResult.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean),
);

const partiallyStagedFiles = fixableFiles.filter((file) =>
  unstagedFiles.has(file),
);
const missingWorkingTreeFiles = fixableFiles.filter(
  (file) => !fs.existsSync(file),
);

if (partiallyStagedFiles.length > 0) {
  errorBox([
    pc.bold("Cannot safely fix partially staged files."),
    "",
    pc.dim("Resolve staged vs unstaged changes first:"),
    "",
    `  ${shortFileList(partiallyStagedFiles)}`,
    "",
    pc.dim("Then run npm run fix:staged again."),
  ]);
  process.exit(1);
}

if (missingWorkingTreeFiles.length > 0) {
  errorBox([
    pc.bold("Cannot safely fix staged files missing from the working tree."),
    "",
    pc.dim("Restore or unstage these files first:"),
    "",
    `  ${shortFileList(missingWorkingTreeFiles)}`,
  ]);
  process.exit(1);
}

const indexSnapshotBefore = getIndexSnapshot(fixableFiles);

const result = runTool(
  "lint-staged",
  ["--continue-on-error", "--no-revert", "--quiet"],
  {
    stdio: "inherit",
  },
);

// Defensive: lint-staged runs through the resolved local Node binary, which
// always spawns, so a spawn-level error is not reachable in practice.
/* node:coverage disable */
if (result.error) {
  errorBox([
    pc.bold("Unable to run staged fixes."),
    "",
    pc.dim("Check that lint-staged is installed and available."),
  ]);
  process.exit(1);
}
/* node:coverage enable */

console.log("");

if ((result.status ?? 1) === 0) {
  const indexSnapshotAfter = getIndexSnapshot(fixableFiles);
  const indexChanged =
    indexSnapshotBefore !== null && indexSnapshotAfter !== null
      ? indexSnapshotBefore !== indexSnapshotAfter
      : null;

  const summaryTitle =
    indexChanged === true
      ? "Staged fixes applied."
      : "Staged files already clean.";
  const summaryDetail =
    indexChanged === true
      ? `Refreshed the index for ${fixableFiles.length} staged file${fixableFiles.length === 1 ? "" : "s"}.`
      : `Checked ${fixableFiles.length} staged file${fixableFiles.length === 1 ? "" : "s"}. No automatic changes were needed.`;

  successBox([
    pc.bold(summaryTitle),
    "",
    pc.dim(summaryDetail),
    pc.dim(`${shortFileList(fixableFiles)}`),
  ]);
  process.exit(0);
}

warningBox([
  pc.bold("Manual attention still needed."),
  "",
  pc.dim("Available fixes were applied and the index was refreshed."),
  pc.dim(
    "Review the ESLint or Prettier output above, then commit again when ready.",
  ),
]);

process.exit(result.status ?? 1);
