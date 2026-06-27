// scripts/check-format.mjs
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

const files = process.argv.slice(2);

if (files.length === 0) {
  process.exit(0);
}

const result = spawnSync("npx", ["prettier", "--check", ...files], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

const stdout = result.stdout
  .split("\n")
  .filter((line) => !line.includes("Run Prettier with --write to fix."))
  .join("\n")
  .trim();

const stderr = result.stderr
  .split("\n")
  .filter((line) => !line.includes("Run Prettier with --write to fix."))
  .join("\n")
  .trim();

if (stdout) {
  console.log(stdout);
}

if (stderr) {
  console.error(stderr);
}

if (result.status !== 0) {
  printBox(
    [
      pc.bold("Formatting suggestions found."),
      "",
      pc.dim("Run this command to fix formatting:"),
      "",
      pc.bold("  npm run format"),
    ].join("\n"),
    pc.yellow,
    {
      title: "prettier",
      titleAlignment: "center",
    },
  );

  process.exit(result.status ?? 1);
}

printBox(pc.green("Formatting is clean."), pc.green, {
  title: "prettier",
  titleAlignment: "center",
});
process.exit(0);
