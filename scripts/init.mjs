#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import pc from "picocolors";
import { errorBox, infoBox, printBox, warningBox } from "./lib/ui.mjs";
import {
  BIN,
  classifyHook,
  gitWorkTreeState,
  gitHooksDir,
  hookInvocation,
  hookNamesForConfig,
  hooksPathConfigState,
  isHuskyHooksPath,
  legacyHuskyDirectoryState,
  leftoverHuskyHooks,
  legacyHuskyWiringPaths,
  removeLegacyHuskyWiring,
  writeHook,
} from "./lib/hooks.mjs";
import {
  precommitConfigWarningMessages,
  readStandalonePrecommitConfig,
  resolvePrecommitConfigSources,
  STANDALONE_CONFIG_FILE,
} from "./lib/config.mjs";
import { run } from "./lib/process.mjs";
import { logoLines } from "./lib/logo.mjs";
import { escapeTerminalText } from "./lib/terminal.mjs";

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
const unknownOption = args.find(
  (argument) => !["--dry-run", "-n"].includes(argument),
);
if (unknownOption) {
  errorBox([
    pc.bold(`Unknown init option: ${escapeTerminalText(unknownOption)}`),
    "",
    pc.dim("Supported options: --dry-run, -n."),
    pc.dim("No files or hooks were changed."),
  ]);
  process.exit(1);
}
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

function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectInvalidContainer(property) {
  const location = property ? `property \`${property}\`` : "root value";
  errorBox([
    pc.bold("Invalid package.json structure."),
    "",
    pc.dim(
      `The ${escapeTerminalText(location)} must be a non-null, non-array JSON object.`,
    ),
    pc.dim("Fix package.json, then run init again. No files were changed."),
  ]);
  process.exit(1);
}

// Validate every package container before mutating anything. JSON syntax alone
// is not enough: arrays, primitives, and null cannot safely hold the values
// init adds.
if (!isJsonObject(pkg)) {
  rejectInvalidContainer();
}
for (const property of ["scripts", "precommitChecks"]) {
  if (Object.hasOwn(pkg, property) && !isJsonObject(pkg[property])) {
    rejectInvalidContainer(property);
  }
}

// Explicit setup must not write around a malformed higher-precedence config.
// Hook-time readers only warn and fall back because commits/pushes are
// advisory boundaries; init can stop safely before it mutates anything.
const standalone = readStandalonePrecommitConfig();
if (standalone.error) {
  errorBox([
    pc.bold(`Invalid ${STANDALONE_CONFIG_FILE}.`),
    "",
    pc.dim(`The file ${escapeTerminalText(standalone.error)}.`),
    pc.dim("Fix or remove it, then run init again. No files were changed."),
  ]);
  process.exit(1);
}
const created = [];
const warnings = [];

pkg.scripts ??= {};

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

let standaloneChanged = false;
if (standalone.exists) {
  // Presence, not validity, decides whether init supplies a default. Keep an
  // explicitly configured invalid value intact so diagnostics can identify it
  // instead of silently rewriting the user's higher-precedence setting.
  const rawEffectiveConfig = {
    ...(pkg.precommitChecks ?? {}),
    ...standalone.config,
  };
  if (
    !("advisePushTests" in rawEffectiveConfig) &&
    !("blockPushOnTestFailure" in rawEffectiveConfig)
  ) {
    standalone.config.advisePushTests = true;
    standaloneChanged = true;
    created.push(`pre-push advisory config (${STANDALONE_CONFIG_FILE})`);
  }
} else {
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
}

const effectiveConfig = resolvePrecommitConfigSources(
  pkg.precommitChecks ?? {},
  standalone,
);
const hookNames = hookNamesForConfig(effectiveConfig);
const configWarnings = precommitConfigWarningMessages(effectiveConfig);

let gitignore;
try {
  gitignore = fs.existsSync(".gitignore")
    ? fs.readFileSync(".gitignore", "utf8")
    : "";
} catch {
  errorBox([
    pc.bold("Could not inspect .gitignore."),
    "",
    pc.dim("Make .gitignore a readable file, then run init again."),
    pc.dim("No files or hooks were changed."),
  ]);
  process.exit(1);
}
const gitignoreLines = gitignore.split("\n").map((line) => line.trim());
const ignores = [".eslintcache", ".prettiercache", "node_modules/"].filter(
  (entry) =>
    !gitignoreLines.includes(entry) &&
    !(entry === "node_modules/" && gitignoreLines.includes("node_modules")),
);

const projectFilesToWrite = [
  "package.json",
  ...(standaloneChanged ? [STANDALONE_CONFIG_FILE] : []),
  ...(ignores.length > 0 ? [".gitignore"] : []),
];
if (!dryRun) {
  for (const filePath of projectFilesToWrite) {
    try {
      if (fs.existsSync(filePath)) {
        fs.accessSync(filePath, fs.constants.W_OK);
      } else {
        fs.accessSync(".", fs.constants.W_OK);
      }
    } catch {
      errorBox([
        pc.bold(`Could not update ${escapeTerminalText(filePath)}.`),
        "",
        pc.dim("Make the project file writable, then run init again."),
        pc.dim("No files or hooks were changed."),
      ]);
      process.exit(1);
    }
  }
}

if (!dryRun) {
  try {
    fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
    if (standaloneChanged) {
      fs.writeFileSync(
        STANDALONE_CONFIG_FILE,
        `${JSON.stringify(standalone.config, null, 2)}\n`,
      );
    }
    if (ignores.length > 0) {
      fs.writeFileSync(
        ".gitignore",
        `${gitignore}${gitignore.endsWith("\n") || gitignore === "" ? "" : "\n"}${ignores.join("\n")}\n`,
      );
    }
    /* node:coverage ignore next 15 */
  } catch {
    // Permission failures are exercised by the access preflight above. This
    // fallback is reserved for nondeterministic post-preflight failures such as
    // disk exhaustion or a concurrent permission change.
    errorBox([
      pc.bold("Could not update the project files."),
      "",
      pc.dim("A filesystem write failed before hook installation began."),
      pc.dim("Fix the project-file permissions, then rerun init to repair"),
      pc.dim("any partial project-file changes."),
    ]);
    process.exit(1);
  }
}

// --- Hook wiring (native .git/hooks) ---

const gitState = gitWorkTreeState();
const isGitRepo = gitState.inside;
const hooksPathState = isGitRepo
  ? hooksPathConfigState()
  : { value: "", error: null };
const configuredHooksPath = hooksPathState.value;
const hooksPathInspectionFailed = hooksPathState.error !== null;
const huskyEraHooksPath = isHuskyHooksPath(configuredHooksPath);
const foreignHooksPath = configuredHooksPath && !huskyEraHooksPath;
let hooksActive = false;

// Pre-3.0 setups pointed core.hooksPath at husky's shim dir; while that is
// set, git ignores `.git/hooks` entirely. Unset it (it is our own wiring, not
// the user's) so the native hooks below actually run.
let hooksPathRetired = !hooksPathInspectionFailed && !huskyEraHooksPath;
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
    "Add these commands to the matching hooks in that directory:",
    ...hookNames.map((name) => `  ${name}: ${hookInvocation(name)}`),
    "Or unset it: git config --unset core.hooksPath",
  );
}

if (hooksPathInspectionFailed) {
  warnings.push(
    "Git could not determine core.hooksPath, so no hooks were written.",
    "Fix the Git configuration error, then run:",
    `  ${BIN} doctor`,
  );
}

if (!isGitRepo) {
  if (gitState.bare) {
    warnings.push(
      "This is a bare Git repository, so local commit and push hooks were not installed.",
      `Run \`${BIN} init\` from a non-bare working tree instead.`,
    );
  } else {
    warnings.push(
      "This directory is not a git repository, so no hooks were installed.",
      `Run \`git init\`, then \`${BIN} doctor\` to wire up the hooks.`,
    );
  }
}

if (isGitRepo && !foreignHooksPath && !hooksPathInspectionFailed) {
  const hooksDir = gitHooksDir();
  const unwiredHooks = [];
  const nonExecutableHooks = [];
  const uninspectableHooks = [];
  const failedHooks = [];

  if (!hooksDir) {
    warnings.push(
      "Git could not locate the git hooks directory, so no hooks were written.",
      `Fix the Git repository error, then run \`${BIN} doctor\`.`,
    );
  } else {
    for (const name of hookNames) {
      const status = classifyHook(hooksDir, name);
      // Create missing hooks and refresh exact older generated bodies. A hook
      // the user wrote is left exactly as-is. A custom hook that invokes
      // commitment-issues is healthy, while one that does not is reported
      // below with the exact command the user needs to add.
      if (status === "missing" || status === "stale-wired") {
        let written = true;
        if (!dryRun) {
          try {
            writeHook(hooksDir, name);
          } catch {
            written = false;
            failedHooks.push(name);
          }
        }
        if (written) {
          created.push(
            status === "stale-wired"
              ? `updated .git/hooks/${name}`
              : `.git/hooks/${name}`,
          );
        }
      } else if (status === "custom-without-command") {
        unwiredHooks.push(name);
      } else if (status === "non-executable") {
        nonExecutableHooks.push(name);
      } else if (status === "uninspectable") {
        uninspectableHooks.push(name);
      }
    }
  }

  if (unwiredHooks.length > 0) {
    warnings.push(
      "Existing git hooks were left unchanged but do not run commitment-issues.",
      "Add each command without removing your existing hook logic:",
      ...unwiredHooks.map(
        (name) => `  .git/hooks/${name}: ${hookInvocation(name)}`,
      ),
    );
  }

  if (nonExecutableHooks.length > 0) {
    warnings.push(
      "Existing git hooks were left unchanged but are not executable.",
      "Make each hook executable so Git can run it:",
      ...nonExecutableHooks.map((name) => `  chmod +x .git/hooks/${name}`),
    );
  }

  if (uninspectableHooks.length > 0) {
    warnings.push(
      "Existing git hooks could not be inspected and were left unchanged.",
      "Replace each path with a readable hook file, then run doctor:",
      ...uninspectableHooks.map((name) => `  .git/hooks/${name}`),
    );
  }

  if (failedHooks.length > 0) {
    warnings.push(
      "Some git hook files could not be written.",
      "Check permissions on the hooks directory, then run doctor:",
      ...failedHooks.map((name) => `  .git/hooks/${name}`),
    );
  }

  // Missing hooks are written above (or would be written by a dry run), and
  // wired/custom-with-command hooks are already active. Native hooks remain
  // inactive when a custom hook omits the command, lacks an executable bit on
  // POSIX, or a husky hooksPath could not be retired and shadows .git/hooks.
  hooksActive =
    hooksDir !== null &&
    hooksPathRetired &&
    unwiredHooks.length === 0 &&
    nonExecutableHooks.length === 0 &&
    uninspectableHooks.length === 0 &&
    failedHooks.length === 0;

  // Clean up the husky-era artifacts this tool generated (exact-match hook
  // files and husky's runtime dir). User-authored `.husky` hooks are never
  // deleted — they are reported below so the logic can be moved. Skipped
  // while core.hooksPath still points into `.husky` (failed unset above):
  // deleting the files git currently runs would kill working hooks.
  if (hooksDir && hooksPathRetired) {
    const legacyHuskyState = legacyHuskyDirectoryState();
    if (legacyHuskyState.status === "uninspectable") {
      warnings.push(
        "The legacy .husky path could not be safely inspected and was left unchanged.",
        "If it is a symbolic link or another non-directory path, review it manually.",
      );
    } else {
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
}

if (ignores.length > 0) {
  created.push(".gitignore defaults");
}

const setupSummary =
  created.length > 0
    ? [
        pc.dim(dryRun ? "Would add:" : "Added:"),
        ...created.map((item) => pc.dim(`- ${escapeTerminalText(item)}`)),
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
        ...(effectiveConfig.commitMessage?.enabled === true
          ? [
              pc.dim(
                effectiveConfig.commitMessage.blockOnFailure === true
                  ? "Commit messages must pass your project commitlint rules."
                  : "Commit messages receive advisory project commitlint feedback.",
              ),
            ]
          : []),
        pc.dim("Your next push runs advisory tests when matching tests exist."),
      ]
    : [
        pc.dim(
          effectiveConfig.commitMessage?.enabled === true
            ? "The configured Git checks are not all active yet."
            : "Pre-commit and pre-push checks are not active yet.",
        ),
        pc.dim("Complete the hook wiring steps below."),
      ];

const warningSections = [
  ...(warnings.length > 0
    ? [
        "",
        pc.bold("Hook wiring needs your attention."),
        "",
        ...warnings.map((line) => pc.dim(escapeTerminalText(line))),
      ]
    : []),
  ...(configWarnings.length > 0
    ? [
        "",
        pc.bold("Configuration needs attention."),
        "",
        ...configWarnings.map((message) =>
          pc.dim(`• ${escapeTerminalText(message)}`),
        ),
      ]
    : []),
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
  ...warningSections,
];

if (warningSections.length > 0) {
  warningBox(body);
} else if (dryRun) {
  infoBox(body);
} else {
  printBox(body, undefined, { borderColor: "green" });
}
