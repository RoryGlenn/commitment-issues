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

function runCommand(label, command, args) {
  console.log(pc.cyan(`Running ${label}...`));

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    printBox(
      [
        `${label} failed.`,
        "",
        "Push blocked.",
        "Fix the issue, commit the fix, then push again.",
      ].join("\n"),
      pc.red,
    );

    process.exit(result.status ?? 1);
  }

  console.log(pc.green(`${label} passed.`));
  console.log("");
}

printBox("Pre-push checks", pc.cyan);
runCommand("format check", "npm", ["run", "format:check"]);
runCommand("lint", "npm", ["run", "lint"]);
runCommand("tests", "npm", ["test"]);
runCommand("build", "npm", ["run", "build"]);
printBox("Pre-push checks passed. Push will continue.", pc.green);
process.exit(0);