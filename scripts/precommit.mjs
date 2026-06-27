import { spawnSync } from "node:child_process";
import boxen from "boxen";
import pc from "picocolors";

function printBox(message, color = (value) => value) {
  console.log(
    boxen(color(message), {
      padding: 1,
      borderStyle: "single",
      margin: {
        top: 1,
        bottom: 1,
      },
    }),
  );
}

printBox("Pre-commit suggestions", pc.cyan);

const result = spawnSync("npx", ["lint-staged", "--quiet"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log("");

if (result.status !== 0) {
  printBox(
    [
      "Suggestions found.",
      "",
      "Commit will continue anyway.",
      "Run npm run format or npm run lint:fix when ready.",
    ].join("\n"),
    pc.yellow,
  );

  process.exit(0);
}

printBox("No pre-commit suggestions found.", pc.green);
process.exit(0);