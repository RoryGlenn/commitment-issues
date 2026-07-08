#!/usr/bin/env node
import fs from "node:fs";
import pc from "picocolors";
import { errorBox, infoBox, printBox } from "./lib/ui.mjs";
import { run } from "./lib/process.mjs";
import { BIN, HOOK_BODIES } from "./lib/hooks.mjs";
import { logoLines } from "./lib/logo.mjs";

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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-n");

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
const jsTask = [`${BIN} fix-staged-js`];
const lintStaged = pkg["lint-staged"];
// Only object-style lint-staged configs (glob → command map) are merged into.
// Array and function configs (the latter only exist in JS config files, not
// package.json) express custom behavior we must not second-guess, so preserve
// them untouched.
const isObjectConfig =
  lintStaged !== null &&
  typeof lintStaged === "object" &&
  !Array.isArray(lintStaged);
if (!lintStaged) {
  pkg["lint-staged"] = {
    [jsGlob]: jsTask,
    "*.{json,css,scss,md,html,yml,yaml}": ["prettier --write --ignore-unknown"],
  };
  created.push("lint-staged config");
} else if (isObjectConfig) {
  const currentJsTask = lintStaged[jsGlob];
  if (
    Array.isArray(currentJsTask) &&
    currentJsTask.length === 1 &&
    currentJsTask[0] === "node scripts/fix-staged-js.mjs"
  ) {
    // Upgrade the legacy vendored task to the bin.
    lintStaged[jsGlob] = jsTask;
    created.push("lint-staged task");
  } else if (currentJsTask === undefined) {
    // The user has an object config but no JS task, so `npm run fix:staged`
    // would never run our JS fixer. Add it alongside their existing globs
    // without touching anything else.
    lintStaged[jsGlob] = jsTask;
    created.push("lint-staged JS task");
  }
  // A custom JS task is left exactly as the user wrote it.
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

if (!dryRun) {
  fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

// Activate Husky (sets git hooksPath) — ignore failure so init still finishes.
if (!dryRun) {
  run("npx", ["husky"]);
}

// Legacy 1.x hook bodies that ran vendored scripts; upgrade them to the bin.
const legacyHookBodies = {
  ".husky/pre-commit": "node scripts/precommit-unified.mjs\n",
  ".husky/pre-push": "node scripts/prepush.mjs\n",
};
if (!dryRun) {
  fs.mkdirSync(".husky", { recursive: true });
}
for (const [hookPath, body] of Object.entries(HOOK_BODIES)) {
  const current = fs.existsSync(hookPath)
    ? fs.readFileSync(hookPath, "utf8")
    : null;
  if (
    (current === null || current === legacyHookBodies[hookPath]) &&
    current !== body
  ) {
    if (!dryRun) {
      fs.writeFileSync(hookPath, body);
      fs.chmodSync(hookPath, 0o755);
    }
    created.push(hookPath);
  }
}

const gitignore = fs.existsSync(".gitignore")
  ? fs.readFileSync(".gitignore", "utf8")
  : "";
const gitignoreLines = gitignore.split("\n").map((line) => line.trim());
const ignores = [".eslintcache", ".prettiercache", "node_modules/"].filter(
  (entry) =>
    !gitignoreLines.includes(entry) &&
    !(entry === "node_modules/" && gitignoreLines.includes("node_modules")),
);
if (ignores.length > 0) {
  if (!dryRun) {
    fs.writeFileSync(
      ".gitignore",
      `${gitignore}${gitignore.endsWith("\n") || gitignore === "" ? "" : "\n"}${ignores.join("\n")}\n`,
    );
  }
  created.push(".gitignore defaults");
}

const setupSummary =
  created.length > 0
    ? [
        pc.dim(dryRun ? "Would add:" : "Added:"),
        ...created.map((item) => pc.dim(`- ${item}`)),
      ]
    : [pc.dim("Already configured — nothing to change.")];

const footer = dryRun
  ? [
      pc.dim("No files were written."),
      pc.dim("Run again without --dry-run to apply these changes."),
    ]
  : [
      pc.dim("Your next commit runs advisory checks."),
      pc.dim("Your next push runs advisory tests when matching tests exist."),
    ];

const body = [
  ...logoLines(),
  "",
  pc.bold(
    dryRun
      ? "Commitment Issues dry run preview."
      : "Commitment Issues is set up.",
  ),
  "",
  ...setupSummary,
  "",
  ...footer,
].join("\n");

if (dryRun) {
  infoBox(body.split("\n"));
} else {
  printBox(body, (value) => value, { borderColor: "green" });
}
