import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const files = process.argv.slice(2).filter(Boolean);

if (files.length === 0) {
  process.exit(0);
}

let hasRemainingIssues = false;

const eslintResult = spawnSync(
  "npx",
  ["eslint", "--cache", "--cache-strategy", "content", "--fix", "--", ...files],
  {
    stdio: "inherit",
    shell: isWindows,
  },
);

if (eslintResult.error || (eslintResult.status || 0) !== 0) {
  hasRemainingIssues = true;
}

const prettierResult = spawnSync(
  "npx",
  ["prettier", "--write", "--ignore-unknown", "--", ...files],
  {
    stdio: "inherit",
    shell: isWindows,
  },
);

if (prettierResult.error || (prettierResult.status || 0) !== 0) {
  hasRemainingIssues = true;
}

if (hasRemainingIssues) {
  process.exit(1);
}

process.exit(0);
