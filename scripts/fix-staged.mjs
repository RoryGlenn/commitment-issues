import { spawnSync } from "node:child_process";
import fs from "node:fs";
import boxen from "boxen";
import pc from "picocolors";

const isWindows = process.platform === "win32";

function printBox(message, color = (value) => value, options = {}) {
  console.log(
    boxen(color(message), {
      padding: 1,
      borderStyle: "round",
      margin: {
        top: 1,
        bottom: 1,
      },
      ...options,
    }),
  );
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: isWindows,
    ...options,
  });
}

function getIndexSnapshot(files) {
  if (files.length === 0) {
    return "";
  }

  const snapshotResult = run("git", ["ls-files", "--stage", "--", ...files]);

  if (snapshotResult.error || snapshotResult.status !== 0) {
    return null;
  }

  return snapshotResult.stdout.trimEnd();
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
  printBox(
    [
      pc.bold("Unable to inspect staged files."),
      "",
      pc.dim("Check that Git is available and the current directory is a repository."),
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );
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
  printBox(
    [
      pc.bold("Unable to inspect unstaged files."),
      "",
      pc.dim("Check that Git is available and the working tree can be inspected."),
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );
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
  printBox(
    [
      pc.bold("Cannot safely fix partially staged files."),
      "",
      pc.dim("Resolve staged vs unstaged changes first:"),
      "",
      `  ${shortFileList(partiallyStagedFiles)}`,
      "",
      pc.dim("Then run npm run fix:staged again."),
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );
  process.exit(1);
}

if (missingWorkingTreeFiles.length > 0) {
  printBox(
    [
      pc.bold("Cannot safely fix staged files missing from the working tree."),
      "",
      pc.dim("Restore or unstage these files first:"),
      "",
      `  ${shortFileList(missingWorkingTreeFiles)}`,
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );
  process.exit(1);
}

const indexSnapshotBefore = getIndexSnapshot(fixableFiles);

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

if (result.error) {
  printBox(
    [
      pc.bold("Unable to run staged fixes."),
      "",
      pc.dim("Check that lint-staged is installed and available."),
    ].join("\n"),
    pc.red,
    {
      title: "error",
      titleAlignment: "center",
    },
  );
  process.exit(1);
}

console.log("");

if ((result.status ?? 1) === 0) {
  const indexSnapshotAfter = getIndexSnapshot(fixableFiles);
  const indexChanged =
    indexSnapshotBefore !== null && indexSnapshotAfter !== null
      ? indexSnapshotBefore !== indexSnapshotAfter
      : null;

  const summaryTitle =
    indexChanged === true ? "Staged fixes applied." : "Staged files already clean.";
  const summaryDetail =
    indexChanged === true
      ? `Refreshed the index for ${fixableFiles.length} staged file${fixableFiles.length === 1 ? "" : "s"}.`
      : `Checked ${fixableFiles.length} staged file${fixableFiles.length === 1 ? "" : "s"}. No automatic changes were needed.`;

  printBox(
    [
      pc.bold(summaryTitle),
      "",
      pc.dim(summaryDetail),
      pc.dim(`Examples: ${shortFileList(fixableFiles)}`),
    ].join("\n"),
    pc.green,
    {
      title: "success",
      titleAlignment: "center",
    },
  );
  process.exit(0);
}

printBox(
  [
    pc.bold("Manual attention still needed."),
    "",
    pc.dim("Available fixes were applied and the index was refreshed."),
    pc.dim("Review the ESLint or Prettier output above, then commit again when ready."),
  ].join("\n"),
  pc.yellow,
  {
    title: "warning",
    titleAlignment: "center",
  },
);

process.exit(result.status ?? 1);