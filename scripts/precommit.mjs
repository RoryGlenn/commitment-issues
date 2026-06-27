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
