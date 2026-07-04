#!/usr/bin/env node
import fs from "node:fs";
import pc from "picocolors";
import { errorBox, successBox } from "./lib/ui.mjs";
import { run } from "./lib/process.mjs";
import { BIN, HOOK_BODIES } from "./lib/hooks.mjs";

// One-command setup for a consuming repo: wires up the Husky hooks, npm scripts,
// lint-staged config, and gitignored caches without clobbering existing values.
// Everything runs through the installed `commitment-issues` bin, so nothing is
// vendored. Safe to re-run.

if (!fs.existsSync("package.json")) {
  errorBox([
    pc.bold("No package.json found."),
    "",
    pc.dim("Run this from your project root."),
  ]);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
} catch {
  errorBox([
    pc.bold("Invalid package.json."),
    "",
    pc.dim("Fix package.json so it contains valid JSON, then run init again."),
  ]);
  process.exit(1);
}
const created = [];

pkg.scripts = pkg.scripts || {};

// `prepare` runs on every install and is our automatic self-heal entry point:
// `doctor --quiet` re-establishes the hook wiring (and sets up husky the first
// time). Upgrade older values from previous setups to it.
const desiredPrepare = `${BIN} doctor --quiet`;
const legacyPrepare = [
  "husky",
  "husky || true",
  "node scripts/doctor.mjs --quiet",
];
if (
  (!pkg.scripts.prepare || legacyPrepare.includes(pkg.scripts.prepare)) &&
  pkg.scripts.prepare !== desiredPrepare
) {
  pkg.scripts.prepare = desiredPrepare;
  created.push("script prepare");
}

const scripts = {
  "commit:fix": `${BIN} commit-fix`,
  "fix:staged": `${BIN} fix-staged`,
  "test:precommit": `${BIN} precommit`,
  doctor: `${BIN} doctor`,
};
// Legacy 1.x values that pointed at vendored scripts; upgrade them to the bin.
const legacyScripts = {
  "commit:fix": "node scripts/commit-fix.mjs",
  "fix:staged": "node scripts/fix-staged.mjs",
  "test:precommit": "node scripts/precommit-unified.mjs",
  doctor: "node scripts/doctor.mjs",
};
for (const [name, value] of Object.entries(scripts)) {
  const current = pkg.scripts[name];
  if ((!current || current === legacyScripts[name]) && current !== value) {
    pkg.scripts[name] = value;
    created.push(`script ${name}`);
  }
}

const jsGlob = "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
if (!pkg["lint-staged"]) {
  pkg["lint-staged"] = {
    [jsGlob]: [`${BIN} fix-staged-js`],
    "*.{json,css,scss,md,html,yml,yaml}": ["prettier --write --ignore-unknown"],
  };
  created.push("lint-staged config");
} else if (
  Array.isArray(pkg["lint-staged"][jsGlob]) &&
  pkg["lint-staged"][jsGlob].length === 1 &&
  pkg["lint-staged"][jsGlob][0] === "node scripts/fix-staged-js.mjs"
) {
  // Upgrade the legacy vendored task to the bin.
  pkg["lint-staged"][jsGlob] = [`${BIN} fix-staged-js`];
  created.push("lint-staged task");
}

if (!pkg.precommitChecks) {
  pkg.precommitChecks = {};
  created.push("precommitChecks config");
}

if (
  !("advisePushTests" in pkg.precommitChecks) &&
  !("blockPushOnTestFailure" in pkg.precommitChecks)
) {
  pkg.precommitChecks.advisePushTests = true;
  created.push("pre-push advisory config");
}

fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

// Activate Husky (sets git hooksPath) — ignore failure so init still finishes.
run("npx", ["husky"]);

fs.mkdirSync(".husky", { recursive: true });
// Legacy 1.x hook bodies that ran vendored scripts; upgrade them to the bin.
const legacyHookBodies = {
  ".husky/pre-commit": "node scripts/precommit-unified.mjs\n",
  ".husky/pre-push": "node scripts/prepush.mjs\n",
};
for (const [hookPath, body] of Object.entries(HOOK_BODIES)) {
  const current = fs.existsSync(hookPath)
    ? fs.readFileSync(hookPath, "utf8")
    : null;
  if (
    (current === null || current === legacyHookBodies[hookPath]) &&
    current !== body
  ) {
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
  pc.dim("Your next commit runs advisory checks."),
  pc.dim("Your next push runs advisory tests when matching tests exist."),
]);
