#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import pc from "picocolors";
import { errorBox, infoBox, printBox, warningBox } from "./lib/ui.mjs";
import {
  BIN,
  HOOK_NAMES,
  classifyHook,
  gitHooksDir,
  hookCommand,
  hooksPathConfig,
  isHuskyHooksPath,
  leftoverHuskyHooks,
  legacyHuskyWiringPaths,
  removeLegacyHuskyWiring,
  writeHook,
} from "./lib/hooks.mjs";
import { run } from "./lib/process.mjs";
import { logoLines } from "./lib/logo.mjs";

// One-command setup for a consuming repo: wires up the git hooks, npm scripts,
// and gitignored caches without clobbering existing values. Hooks are plain
// `.git/hooks` files running the installed `commitment-issues` bin — no hook
// manager, nothing vendored. Also migrates husky-era wiring from pre-3.0
// setups. Safe to re-run.

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
const warnings = [];

pkg.scripts = pkg.scripts || {};

// `doctor --quiet` re-establishes hook wiring after every fresh clone or
// reinstall. Compose it after a project-owned `prepare` command because Yarn
// Classic does not run `postprepare`. The exact suffix is idempotent and can be
// removed safely by uninstall without disturbing the project command.
const desiredRepair = `${BIN} doctor --quiet`;
const repairSuffix = ` && ${desiredRepair}`;
const legacyPrepare = [
  "husky",
  "husky || true",
  "husky install",
  "node scripts/doctor.mjs --quiet",
];
if (legacyPrepare.includes(pkg.scripts.prepare)) {
  pkg.scripts.prepare = desiredRepair;
  created.push("script prepare");
} else if (pkg.scripts.prepare !== desiredRepair) {
  if (!pkg.scripts.prepare) {
    pkg.scripts.prepare = desiredRepair;
    created.push("script prepare");
  } else if (!pkg.scripts.prepare.endsWith(repairSuffix)) {
    pkg.scripts.prepare += repairSuffix;
    created.push("script prepare repair");
  }
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

// --- Hook wiring (native .git/hooks) ---

const insideRepo = run("git", ["rev-parse", "--is-inside-work-tree"]);
const isGitRepo = !insideRepo.error && insideRepo.status === 0;

const configuredHooksPath = isGitRepo ? hooksPathConfig() : "";
const huskyEraHooksPath = isHuskyHooksPath(configuredHooksPath);
const foreignHooksPath = configuredHooksPath && !huskyEraHooksPath;
let hooksActive = false;

// Pre-3.0 setups pointed core.hooksPath at husky's shim dir; while that is
// set, git ignores `.git/hooks` entirely. Unset it (it is our own wiring, not
// the user's) so the native hooks below actually run.
let hooksPathRetired = !huskyEraHooksPath;
if (huskyEraHooksPath) {
  if (!dryRun) {
    const unset = run("git", ["config", "--unset", "core.hooksPath"]);
    if (!unset.error && (unset.status || 0) === 0) {
      hooksPathRetired = true;
      created.push("retired husky-era core.hooksPath");
    } else {
      // Without the unset, git keeps ignoring .git/hooks — say so instead of
      // printing a success box over dead hooks.
      warnings.push(
        `core.hooksPath is still set to ${configuredHooksPath}, so the hooks`,
        "written to .git/hooks will not run. Unset it manually:",
        "  git config --unset core.hooksPath",
      );
    }
  } else {
    hooksPathRetired = true;
    created.push("retired husky-era core.hooksPath");
  }
}

// A foreign core.hooksPath belongs to another hook manager or the user's own
// setup — never unset it or write hooks it would shadow. Explain instead.
if (foreignHooksPath) {
  warnings.push(
    `core.hooksPath is set to ${configuredHooksPath}, so git ignores .git/hooks.`,
    `Add \`${hookCommand("pre-commit")}\` and \`${hookCommand("pre-push")}\` to the`,
    "hooks in that directory, or unset it: git config --unset core.hooksPath",
  );
}

if (!isGitRepo) {
  warnings.push(
    "This directory is not a git repository, so no hooks were installed.",
    `Run \`git init\`, then \`${BIN} doctor\` to wire up the hooks.`,
  );
}

if (isGitRepo && !foreignHooksPath) {
  const hooksDir = gitHooksDir();
  const unwiredHooks = [];
  for (const name of HOOK_NAMES) {
    const status = classifyHook(hooksDir, name);
    // Only ever create; a hook the user wrote is left exactly as-is. A custom
    // hook that invokes commitment-issues is healthy, while one that does not
    // is reported below with the exact command the user needs to add.
    if (status === "missing") {
      if (!dryRun) {
        writeHook(hooksDir, name);
      }
      created.push(`.git/hooks/${name}`);
    } else if (status === "custom-without-command") {
      unwiredHooks.push(name);
    }
  }

  if (unwiredHooks.length > 0) {
    warnings.push(
      "Existing git hooks were left unchanged but do not run commitment-issues.",
      "Add each command without removing your existing hook logic:",
      ...unwiredHooks.map(
        (name) => `  .git/hooks/${name}: ${hookCommand(name)}`,
      ),
    );
  }

  // Missing hooks are written above (or would be written by a dry run), and
  // wired/custom-with-command hooks are already active. Native hooks remain
  // inactive when a custom hook omits the command or a husky hooksPath could
  // not be retired and still shadows .git/hooks.
  hooksActive = hooksPathRetired && unwiredHooks.length === 0;

  // Clean up the husky-era artifacts this tool generated (exact-match hook
  // files and husky's runtime dir). User-authored `.husky` hooks are never
  // deleted — they are reported below so the logic can be moved. Skipped
  // while core.hooksPath still points into `.husky` (failed unset above):
  // deleting the files git currently runs would kill working hooks.
  if (hooksPathRetired) {
    const legacyWiring = dryRun
      ? legacyHuskyWiringPaths()
      : removeLegacyHuskyWiring();
    if (legacyWiring.length > 0) {
      created.push("removed legacy .husky wiring");
    }

    const stranded = leftoverHuskyHooks();
    if (stranded.length > 0) {
      warnings.push(
        `Leftover .husky hooks no longer run: ${stranded.join(", ")}.`,
        "Move the logic into .git/hooks, or delete the files.",
      );
    }
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
    : [
        pc.dim(
          hooksActive
            ? "Already configured — nothing to change."
            : "Package settings are configured; hook wiring still needs attention.",
        ),
      ];

const footer = dryRun
  ? [
      pc.dim("No files were written."),
      pc.dim("Run again without --dry-run to apply these changes."),
    ]
  : hooksActive
    ? [
        pc.dim("Your next commit runs advisory checks."),
        pc.dim("Your next push runs advisory tests when matching tests exist."),
      ]
    : [
        pc.dim("Pre-commit and pre-push checks are not active yet."),
        pc.dim("Complete the hook wiring steps below."),
      ];

const body = [
  ...logoLines(),
  "",
  pc.bold(
    dryRun
      ? "Commitment Issues dry run preview."
      : hooksActive
        ? "Commitment Issues is set up."
        : "Commitment Issues needs hook wiring.",
  ),
  "",
  ...setupSummary,
  "",
  ...footer,
].join("\n");

if (dryRun) {
  infoBox(body.split("\n"));
} else if (!hooksActive) {
  infoBox(body.split("\n"));
} else {
  printBox(body, (value) => value, { borderColor: "green" });
}

if (warnings.length > 0) {
  warningBox([
    pc.bold("Hook wiring needs your attention."),
    "",
    ...warnings.map((line) => pc.dim(line)),
  ]);
}
