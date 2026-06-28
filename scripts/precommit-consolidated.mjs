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

let hasError = false;
let errorMessage = "";

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
    hasError = true;
    errorMessage = pc.dim(
      "Unable to run staged test file checks. Check that scripts/check-tests.mjs exists and Node is available.",
    );
  }
}

const result = spawnSync("npx", ["lint-staged", "--quiet"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log("");

// Build consolidated message
let messageLines = [];
let color = pc.green;
let title = "success";

if (hasError) {
  color = pc.red;
  title = "error";
  messageLines = [pc.bold("Unable to run checks"), "", errorMessage];
} else if (result.status !== 0) {
  color = pc.yellow;
  title = "warning";
  messageLines = [
    pc.bold("Pre-commit suggestions found"),
    "",
    pc.dim("Commit will continue. Run the commands below when ready:"),
    "",
    pc.bold("  npm run lint:fix"),
    pc.bold("  npm run format"),
  ];
} else {
  color = pc.green;
  title = "success";
  messageLines = [
    pc.bold("All checks passed"),
    "",
    pc.dim("No pre-commit suggestions found"),
  ];
}

printBox(messageLines.join("\n"), color, {
  title,
  titleAlignment: "center",
});

process.exit(result.status !== 0 ? 0 : 0);
