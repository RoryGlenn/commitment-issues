import { spawnSync } from "node:child_process";
import boxen from "boxen";
import pc from "picocolors";

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

printBox(pc.bold("Pre-commit suggestions"), pc.cyan, {
  title: "pre-commit",
  titleAlignment: "center",
});

const gitFiles = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"],
  {
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);

const stagedJsFiles = gitFiles.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter((file) => file && /\.(js|jsx|mjs)$/.test(file));

if (stagedJsFiles.length > 0) {
  const checkTests = spawnSync(
    "node",
    ["scripts/check-tests.mjs", ...stagedJsFiles],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (checkTests.error) {
    printBox(
      [
        pc.bold("Unable to run staged test file checks."),
        "",
        pc.dim(
          "Check that scripts/check-tests.mjs exists and Node is available.",
        ),
      ].join("\n"),
      pc.red,
      {
        title: "error",
        titleAlignment: "center",
      },
    );
  }
}

const result = spawnSync("npx", ["lint-staged", "--quiet"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log("");

if (result.status !== 0) {
  printBox(
    [
      pc.bold("Suggestions found."),
      "",
      pc.dim("Commit will continue. Run the commands below when ready:"),
      "",
      pc.bold("  npm run lint:fix"),
      pc.bold("  npm run format"),
    ].join("\n"),
    pc.yellow,
    {
      title: "warning",
      titleAlignment: "center",
    },
  );

  process.exit(0);
}

printBox(pc.green("No pre-commit suggestions found."), pc.green, {
  title: "success",
  titleAlignment: "center",
});
process.exit(0);
