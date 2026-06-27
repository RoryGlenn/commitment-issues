// scripts/check-format.mjs
import { spawnSync } from "node:child_process";

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
  console.log("");
  console.log("Formatting suggestions found.");
  console.log("");
  console.log("Run this command to fix formatting:");
  console.log("");
  console.log("  npm run format");
  console.log("");

  process.exit(result.status ?? 1);
}

process.exit(0);
