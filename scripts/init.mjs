#!/usr/bin/env node
import fs from "node:fs";
import pc from "picocolors";
import { errorBox, successBox } from "./lib/ui.mjs";
import { run } from "./lib/process.mjs";

// One-command setup for a consuming repo: wires up the Husky hooks, npm scripts,
// lint-staged config, and gitignored caches without clobbering existing values.
// Safe to re-run.

if (!fs.existsSync("package.json")) {
  errorBox([
    pc.bold("No package.json found."),
    "",
    pc.dim(
      "Run this from your project root after copying the scripts/ folder.",
    ),
  ]);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const created = [];

pkg.scripts = pkg.scripts || {};
const scripts = {
  prepare: "husky",
  "commit:fix": "node scripts/commit-fix.mjs",
  "fix:staged": "node scripts/fix-staged.mjs",
  "test:precommit": "node scripts/precommit-unified.mjs",
};
for (const [name, value] of Object.entries(scripts)) {
  if (!pkg.scripts[name]) {
    pkg.scripts[name] = value;
    created.push(`script ${name}`);
  }
}

if (!pkg["lint-staged"]) {
  pkg["lint-staged"] = {
    "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["node scripts/fix-staged-js.mjs"],
    "*.{json,css,scss,md,html,yml,yaml}": ["prettier --write --ignore-unknown"],
  };
  created.push("lint-staged config");
}

if (!pkg.precommitChecks) {
  pkg.precommitChecks = {};
  created.push("precommitChecks config");
}

fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

// Activate Husky (sets git hooksPath) — ignore failure so init still finishes.
run("npx", ["husky"]);

fs.mkdirSync(".husky", { recursive: true });
const hooks = {
  ".husky/pre-commit": "node scripts/precommit-unified.mjs\n",
  ".husky/pre-push": "node scripts/prepush.mjs\n",
};
for (const [hookPath, body] of Object.entries(hooks)) {
  if (!fs.existsSync(hookPath)) {
    fs.writeFileSync(hookPath, body);
    fs.chmodSync(hookPath, 0o755);
    created.push(hookPath);
  }
}

const gitignore = fs.existsSync(".gitignore")
  ? fs.readFileSync(".gitignore", "utf8")
  : "";
const ignores = [".eslintcache", ".prettiercache"].filter(
  (entry) => !gitignore.split("\n").some((line) => line.trim() === entry),
);
if (ignores.length > 0) {
  fs.writeFileSync(
    ".gitignore",
    `${gitignore}${gitignore.endsWith("\n") || gitignore === "" ? "" : "\n"}${ignores.join("\n")}\n`,
  );
  created.push(".gitignore caches");
}

successBox([
  pc.bold("Commitment Issues is set up."),
  "",
  created.length > 0
    ? pc.dim(`Added: ${created.join(", ")}.`)
    : pc.dim("Already configured — nothing to change."),
  "",
  pc.dim("Your next commit runs the advisory checks."),
]);
