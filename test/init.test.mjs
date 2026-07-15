// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compactTerminalBoxText,
  countTerminalBoxes,
} from "./helpers/output.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readFile,
  repoRoot,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runInit(tempDir, args = [], options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "init.mjs"), ...args],
    tempDir,
    options,
  );
}

function writePackage(tempDir, pkg) {
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
}

function readPackage(tempDir) {
  return JSON.parse(readFile(tempDir, "package.json"));
}

function hooksPath(tempDir) {
  return run(
    "git",
    ["config", "--get", "core.hooksPath"],
    tempDir,
  ).stdout.trim();
}

function gitHook(tempDir, name) {
  return path.join(tempDir, ".git", "hooks", name);
}

function assertHookClaimsWithheld(output) {
  assert.match(output, /Commitment Issues needs hook wiring/);
  assert.match(output, /Pre-commit and pre-push checks are not active yet/);
  assert.doesNotMatch(output, /Commitment Issues is set up/);
  assert.doesNotMatch(output, /Your next commit runs advisory checks/);
  assert.doesNotMatch(output, /Your next push runs advisory tests/);
}

test("init wires up hooks, scripts, and config; is idempotent", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Start from a bare package.json so init has work to do.
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    private: true,
    type: "module",
  });

  const first = runInit(tempDir);
  assert.equal(first.status, 0);

  const firstOutput = `${first.stdout}${first.stderr}`;
  assert.match(firstOutput, /Added:/);
  assert.match(firstOutput, /- script prepare/);
  assert.match(firstOutput, /- script commit:fix/);
  assert.doesNotMatch(firstOutput, /Added: script prepare, script commit:fix/);

  const pkg = readPackage(tempDir);
  assert.equal(pkg.scripts["commit:fix"], "commitment-issues commit-fix");
  assert.equal(pkg.scripts["fix:staged"], "commitment-issues fix-staged");
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
  assert.equal(pkg.scripts.prepare, "commitment-issues doctor --quiet");
  // No hook-runner config is written: staged fixes run through the bin.
  assert.equal("lint-staged" in pkg, false);
  assert.equal(pkg.precommitChecks.advisePushTests, true);

  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    /commitment-issues precommit/,
  );
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    /commitment-issues prepush "\$@"/,
  );
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
  // Native wiring: hooks live in .git/hooks with no core.hooksPath set.
  assert.equal(hooksPath(tempDir), "");
  assert.match(readFile(tempDir, ".gitignore"), /\.prettiercache/);

  // Re-running changes nothing.
  const second = runInit(tempDir);
  assert.equal(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /Already configured/);
});

test("init rejects unknown options before changing project or hook state", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
  });
  const packageBefore = readFile(tempDir, "package.json");
  const gitignoreBefore = readFile(tempDir, ".gitignore");

  const result = runInit(tempDir, ["--dry-rn"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unknown init option: --dry-rn/);
  assert.match(output, /No files or hooks were changed/);
  assert.equal(readFile(tempDir, "package.json"), packageBefore);
  assert.equal(readFile(tempDir, ".gitignore"), gitignoreBefore);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("init refuses unwritable project files before installing hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
  });
  const packagePath = path.join(tempDir, "package.json");
  const packageBefore = readFile(tempDir, "package.json");
  fs.chmodSync(packagePath, 0o444);
  t.after(() => {
    if (fs.existsSync(packagePath)) fs.chmodSync(packagePath, 0o644);
  });

  try {
    fs.accessSync(packagePath, fs.constants.W_OK);
    t.skip("this platform does not enforce the read-only mode bit");
    return;
  } catch {
    // Expected on platforms with POSIX-style write permissions.
  }

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Could not update package\.json/);
  assert.match(output, /No files or hooks were changed/);
  assert.equal(readFile(tempDir, "package.json"), packageBefore);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("init repairs a partially installed setup on rerun", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  assert.equal(runInit(tempDir).status, 0);
  fs.rmSync(gitHook(tempDir, "pre-push"));

  const repaired = runInit(tempDir);
  const output = `${repaired.stdout}${repaired.stderr}`;

  assert.equal(repaired.status, 0);
  assert.match(output, /Added:/);
  assert.match(output, /\.git\/hooks\/pre-push/);
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    /commitment-issues prepush "\$@"/,
  );
});

test("init wires commit-msg only for an explicit commitMessage opt-in", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    precommitChecks: {
      commitMessage: { enabled: true, blockOnFailure: false },
    },
  });

  const preview = runInit(tempDir, ["--dry-run"]);
  assert.equal(preview.status, 0);
  assert.match(
    `${preview.stdout}${preview.stderr}`,
    /\.git\/hooks\/commit-msg/,
  );
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /advisory project commitlint feedback/);
  assert.match(
    fs.readFileSync(gitHook(tempDir, "commit-msg"), "utf8"),
    /commitment-issues commit-msg "\$1"/,
  );
  if (process.platform !== "win32") {
    assert.ok(fs.statSync(gitHook(tempDir, "commit-msg")).mode & 0o111);
  }
  assert.deepEqual(readPackage(tempDir).precommitChecks.commitMessage, {
    enabled: true,
    blockOnFailure: false,
  });
});

test("init preserves custom commit-msg hooks and requires safe forwarding", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    precommitChecks: { commitMessage: { enabled: true } },
  });
  writeFile(gitHook(tempDir, "commit-msg"), "echo custom message policy\n");
  fs.chmodSync(gitHook(tempDir, "commit-msg"), 0o755);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /Hook wiring needs your attention/);
  assert.match(output, /commit-msg: commitment-issues commit-msg "\$1"/);
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "commit-msg"), "utf8"),
    "echo custom message policy\n",
  );

  fs.writeFileSync(
    gitHook(tempDir, "commit-msg"),
    'echo custom\ncommitment-issues commit-msg "$1"\n',
  );
  fs.chmodSync(gitHook(tempDir, "commit-msg"), 0o755);
  const safe = runInit(tempDir);
  assert.equal(safe.status, 0);
  assert.match(`${safe.stdout}${safe.stderr}`, /Already configured/);
});

test("init diagnoses invalid nested commitMessage config without wiring it", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    precommitChecks: {
      commitMessage: { enable: true, blockOnFailure: "yes" },
    },
  });

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /Configuration needs attention/);
  assert.match(output, /commitMessage\.enable/);
  assert.match(output, /commitMessage\.blockOnFailure/);
  assert.equal(countTerminalBoxes(output), 1);
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
});

test("init upgrades a legacy 1.x (vendored) setup to the bin", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    scripts: {
      prepare: "husky",
      "commit:fix": "node scripts/commit-fix.mjs",
      "fix:staged": "node scripts/fix-staged.mjs",
      "test:precommit": "node scripts/precommit-unified.mjs",
      doctor: "node scripts/doctor.mjs",
    },
  });
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "node scripts/precommit-unified.mjs\n",
  );
  writeFile(
    path.join(tempDir, ".husky", "pre-push"),
    "node scripts/prepush.mjs\n",
  );

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const pkg = readPackage(tempDir);
  assert.equal(pkg.scripts.prepare, "commitment-issues doctor --quiet");
  assert.equal(pkg.scripts["commit:fix"], "commitment-issues commit-fix");
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
  assert.equal(pkg.precommitChecks.advisePushTests, true);

  // The vendored-era .husky hook files are ours — cleaned up, replaced by
  // native hooks.
  assert.match(`${result.stdout}${result.stderr}`, /removed legacy \.husky/);
  assert.equal(fs.existsSync(path.join(tempDir, ".husky")), false);
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-commit")));
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-push")));
});

test("init migrates a husky-era 2.x setup to native hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    scripts: { prepare: "commitment-issues doctor --quiet" },
  });
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);
  writeFile(path.join(tempDir, ".husky", "_", "h"), "# husky shim\n");
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );
  writeFile(
    path.join(tempDir, ".husky", "pre-push"),
    "commitment-issues prepush\n",
  );

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);

  assert.match(output, /retired husky-era core\.hooksPath/);
  assert.match(output, /removed legacy \.husky wiring/);
  assert.equal(hooksPath(tempDir), "");
  assert.equal(fs.existsSync(path.join(tempDir, ".husky")), false);
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    /commitment-issues precommit/,
  );
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    /commitment-issues prepush/,
  );
});

test("init keeps user-authored .husky hooks and warns they no longer run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);
  writeFile(path.join(tempDir, ".husky", "_", "h"), "# husky shim\n");
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );
  writeFile(
    path.join(tempDir, ".husky", "commit-msg"),
    "echo custom message check\n",
  );

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);

  // Our exact-match wiring is cleaned up; the user's hook is preserved and
  // reported as stranded.
  assert.equal(
    fs.existsSync(path.join(tempDir, ".husky", "pre-commit")),
    false,
  );
  assert.equal(
    readFile(tempDir, ".husky/commit-msg"),
    "echo custom message check\n",
  );
  assert.match(output, /Hook wiring needs your attention/);
  assert.match(output, /\.husky\/commit-msg/);
  assert.equal(countTerminalBoxes(output), 1);
});

test("init warns and keeps .husky when the hooksPath unset fails", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);
  writeFile(path.join(tempDir, ".husky", "_", "h"), "# husky shim\n");
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );

  // `git config --unset` fails, so git keeps running hooks from `.husky/_`.
  const env = fakeGitEnv(tempDir, "config --unset");
  const result = runInit(tempDir, [], { env });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);

  assert.match(output, /Hook wiring needs your attention/);
  assert.match(output, /core\.hooksPath is still set/);
  assertHookClaimsWithheld(output);
  // The wiring git still runs must not be deleted out from under it.
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "_")));
  assert.doesNotMatch(output, /removed legacy \.husky wiring/);
});

test("init preserves explicit push blocking config", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    precommitChecks: {
      blockPushOnTestFailure: true,
    },
  });

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const pkg = readPackage(tempDir);
  assert.equal(pkg.precommitChecks.blockPushOnTestFailure, true);
  assert.equal("advisePushTests" in pkg.precommitChecks, false);
});

test("init uses an existing standalone file as the configuration target", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  writeFile(
    path.join(tempDir, ".commitmentrc.json"),
    '{\n  "tone": "fun"\n}\n',
  );

  const preview = runInit(tempDir, ["--dry-run"]);
  assert.equal(preview.status, 0);
  assert.match(
    `${preview.stdout}${preview.stderr}`,
    /pre-push advisory config \(\.commitmentrc\.json\)/,
  );
  assert.deepEqual(JSON.parse(readFile(tempDir, ".commitmentrc.json")), {
    tone: "fun",
  });
  assert.equal("precommitChecks" in readPackage(tempDir), false);

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(readFile(tempDir, ".commitmentrc.json")), {
    tone: "fun",
    advisePushTests: true,
  });
  assert.equal("precommitChecks" in readPackage(tempDir), false);
});

test("init wires commit-msg from standalone config in dry-run and normal modes", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  writeFile(
    path.join(tempDir, ".commitmentrc.json"),
    `${JSON.stringify(
      {
        commitMessage: { enabled: true, blockOnFailure: true },
      },
      null,
      2,
    )}\n`,
  );

  const preview = runInit(tempDir, ["--dry-run"]);
  const previewOutput = `${preview.stdout}${preview.stderr}`;
  assert.equal(preview.status, 0);
  assert.match(previewOutput, /\.git\/hooks\/commit-msg/);
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
  assert.equal("precommitChecks" in readPackage(tempDir), false);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(
    output,
    /Commit messages must pass your project commitlint rules/,
  );
  assert.match(
    fs.readFileSync(gitHook(tempDir, "commit-msg"), "utf8"),
    /commitment-issues commit-msg "\$1"/,
  );
  assert.deepEqual(JSON.parse(readFile(tempDir, ".commitmentrc.json")), {
    commitMessage: { enabled: true, blockOnFailure: true },
    advisePushTests: true,
  });
  assert.equal("precommitChecks" in readPackage(tempDir), false);

  const repeated = runInit(tempDir);
  assert.equal(repeated.status, 0);
  assert.match(`${repeated.stdout}${repeated.stderr}`, /Already configured/);
});

test("standalone commitMessage values override package hook wiring", (t) => {
  const disabledDir = createTempRepo();
  const invalidDir = createTempRepo();
  t.after(() => cleanupTempRepo(disabledDir));
  t.after(() => cleanupTempRepo(invalidDir));

  for (const tempDir of [disabledDir, invalidDir]) {
    writePackage(tempDir, {
      name: "x",
      version: "1.0.0",
      precommitChecks: {
        tone: "standard",
        commitMessage: { enabled: true, blockOnFailure: true },
      },
    });
  }

  writeFile(
    path.join(disabledDir, ".commitmentrc.json"),
    '{\n  "commitMessage": { "enabled": false }\n}\n',
  );
  const disabled = runInit(disabledDir);
  assert.equal(disabled.status, 0);
  assert.equal(fs.existsSync(gitHook(disabledDir, "commit-msg")), false);
  assert.doesNotMatch(
    `${disabled.stdout}${disabled.stderr}`,
    /project commitlint/,
  );

  writeFile(
    path.join(invalidDir, ".commitmentrc.json"),
    '{\n  "advisePushTests": "yes",\n  "commitMessage": { "enabled": "yes" }\n}\n',
  );
  const invalid = runInit(invalidDir);
  const invalidOutput = `${invalid.stdout}${invalid.stderr}`;
  const compactInvalidOutput = compactTerminalBoxText(invalidOutput);
  assert.equal(invalid.status, 0);
  assert.equal(fs.existsSync(gitHook(invalidDir, "commit-msg")), false);
  assert.match(compactInvalidOutput, /advisePushTests must be a boolean/);
  assert.match(
    compactInvalidOutput,
    /commitMessage\.enabled must be a\s*boolean/,
  );
  assert.match(compactInvalidOutput, /\.commitmentrc\.json/);
  assert.deepEqual(JSON.parse(readFile(invalidDir, ".commitmentrc.json")), {
    advisePushTests: "yes",
    commitMessage: { enabled: "yes" },
  });
});

test("init respects an effective package blocking mode with a standalone file", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    precommitChecks: { blockPushOnTestFailure: true },
  });
  writeFile(path.join(tempDir, ".commitmentrc.json"), "{}\n");

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(readFile(tempDir, ".commitmentrc.json")), {});
  assert.deepEqual(readPackage(tempDir).precommitChecks, {
    blockPushOnTestFailure: true,
  });
});

test("init rejects malformed standalone config before writing anything", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0" });
  writeFile(path.join(tempDir, ".commitmentrc.json"), "{ invalid\n");
  const beforePackage = readFile(tempDir, "package.json");
  const beforeGitignore = readFile(tempDir, ".gitignore");

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Invalid \.commitmentrc\.json/);
  assert.match(output, /contains invalid JSON/);
  assert.match(output, /No files were changed/);
  assert.equal(readFile(tempDir, "package.json"), beforePackage);
  assert.equal(readFile(tempDir, ".gitignore"), beforeGitignore);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("init preserves an unrelated prepare and appends repair", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    scripts: {
      prepare: "node ./scripts/build-assets.mjs",
    },
  });

  const preview = runInit(tempDir, ["--dry-run"]);
  assert.equal(preview.status, 0);
  assert.match(`${preview.stdout}${preview.stderr}`, /- script prepare repair/);
  assert.equal(
    readPackage(tempDir).scripts.prepare,
    "node ./scripts/build-assets.mjs",
  );

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);

  const pkg = readPackage(tempDir);
  assert.equal(
    pkg.scripts.prepare,
    "node ./scripts/build-assets.mjs && commitment-issues doctor --quiet",
  );
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
  assert.match(output, /- script prepare repair/);

  const second = runInit(tempDir);
  assert.equal(second.status, 0);
  assert.match(`${second.stdout}${second.stderr}`, /Already configured/);
});

test("init preserves postprepare while composing repair into prepare", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    scripts: {
      prepare: "node ./scripts/build-assets.mjs",
      postprepare: "node ./scripts/announce-build.mjs",
    },
  });

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  const pkg = readPackage(tempDir);
  assert.equal(
    pkg.scripts.prepare,
    "node ./scripts/build-assets.mjs && commitment-issues doctor --quiet",
  );
  assert.equal(pkg.scripts.postprepare, "node ./scripts/announce-build.mjs");
  assert.match(output, /- script prepare repair/);
});

test("init leaves an existing lint-staged config exactly as the user wrote it", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A user may keep running lint-staged themselves; init neither adopts nor
  // edits their config.
  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    type: "module",
    "lint-staged": {
      "*.md": ["prettier --check"],
    },
  });

  const result = runInit(tempDir);
  assert.equal(result.status, 0);

  const pkg = readPackage(tempDir);
  assert.deepEqual(pkg["lint-staged"], { "*.md": ["prettier --check"] });
  assert.equal(pkg.scripts["fix:staged"], "commitment-issues fix-staged");
});

test("init leaves customized hooks untouched", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  fs.mkdirSync(path.join(tempDir, ".git", "hooks"), { recursive: true });
  fs.writeFileSync(gitHook(tempDir, "pre-commit"), "echo custom commit\n");
  fs.writeFileSync(gitHook(tempDir, "pre-push"), "echo custom push\n");
  fs.chmodSync(gitHook(tempDir, "pre-commit"), 0o755);
  fs.chmodSync(gitHook(tempDir, "pre-push"), 0o755);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  // Existing hook bodies are the user's — never clobbered.
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    "echo custom commit\n",
  );
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    "echo custom push\n",
  );
  assertHookClaimsWithheld(output);
  assert.match(output, /Existing git hooks were left unchanged/);
  assert.match(output, /pre-commit: commitment-issues precommit/);
  assert.match(output, /pre-push: commitment-issues prepush/);
  assert.equal(countTerminalBoxes(output), 1);
});

test("init accepts customized hooks that invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  fs.mkdirSync(path.join(tempDir, ".git", "hooks"), { recursive: true });
  const preCommit =
    "#!/bin/sh\necho custom commit\ncommitment-issues precommit\n";
  const prePush = "#!/bin/sh\necho custom push\ncommitment-issues prepush\n";
  fs.writeFileSync(gitHook(tempDir, "pre-commit"), preCommit);
  fs.writeFileSync(gitHook(tempDir, "pre-push"), prePush);
  fs.chmodSync(gitHook(tempDir, "pre-commit"), 0o755);
  fs.chmodSync(gitHook(tempDir, "pre-push"), 0o755);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Commitment Issues is set up/);
  assert.match(output, /Your next commit runs advisory checks/);
  assert.match(output, /Your next push runs advisory tests/);
  assert.doesNotMatch(output, /Hook wiring needs your attention/);
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    preCommit,
  );
  assert.equal(fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"), prePush);
});

test("init distinguishes configured package settings from inactive hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const first = runInit(tempDir);
  assert.equal(first.status, 0);
  fs.writeFileSync(gitHook(tempDir, "pre-push"), "#!/bin/sh\necho custom\n");
  fs.chmodSync(gitHook(tempDir, "pre-push"), 0o755);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(
    output,
    /Package settings are configured; hook wiring still needs attention/,
  );
  assertHookClaimsWithheld(output);
});

test("init refreshes the exact path-fallback generated pre-push hook", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  runInit(tempDir);
  const hookPath = gitHook(tempDir, "pre-push");
  const current = fs.readFileSync(hookPath, "utf8");
  fs.writeFileSync(
    hookPath,
    `#!/bin/sh
# Installed by commitment-issues. Recreate anytime with: commitment-issues doctor
if [ "$COMMITMENT_ISSUES" = "0" ] || [ "$HUSKY" = "0" ]; then
  exit 0
fi
export PATH="node_modules/.bin:$PATH"
if ! command -v commitment-issues >/dev/null 2>&1; then
  echo "commitment-issues: command not found; skipping pre-push checks." >&2
  exit 0
fi
commitment-issues prepush
`,
  );

  const result = runInit(tempDir);

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /updated \.git\/hooks\/pre-push/,
  );
  assert.equal(fs.readFileSync(hookPath, "utf8"), current);
});

test("init warns about a foreign core.hooksPath and leaves it alone", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  fs.mkdirSync(path.join(tempDir, "githooks"), { recursive: true });
  run("git", ["config", "core.hooksPath", "githooks"], tempDir);

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);

  assert.match(output, /Hook wiring needs your attention/);
  assert.match(output, /core\.hooksPath is set to githooks/);
  assertHookClaimsWithheld(output);
  assert.equal(countTerminalBoxes(output), 1);
  // The user's configuration is untouched and no shadowed hooks are written.
  assert.equal(hooksPath(tempDir), "githooks");
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
});

test("init withholds hook claims when core.hooksPath cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  const env = fakeGitEnv(tempDir, "config --get core.hooksPath", 128);
  const result = runInit(tempDir, [], { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /could not determine core\.hooksPath/i);
  assertHookClaimsWithheld(output);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("init reports an unresolved common hooks directory without crashing", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  const env = fakeGitEnv(tempDir, "rev-parse --git-common-dir", 128);
  const result = runInit(tempDir, [], { env });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /could not locate the git hooks directory/i);
  assertHookClaimsWithheld(output);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("init preserves an uninspectable hook path and reports manual repair", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  fs.mkdirSync(gitHook(tempDir, "pre-commit"), { recursive: true });

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /could not be inspected/i);
  assertHookClaimsWithheld(output);
  assert.equal(fs.statSync(gitHook(tempDir, "pre-commit")).isDirectory(), true);
});

test("init reports hook write failures without a raw exception", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });
  fs.rmSync(path.join(tempDir, ".git", "hooks"), {
    recursive: true,
    force: true,
  });
  fs.writeFileSync(path.join(tempDir, ".git", "hooks"), "not a directory\n");

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /hook files could not be written/i);
  assertHookClaimsWithheld(output);
  assert.doesNotMatch(output, /node:fs|EEXIST|ENOTDIR/);
});

test("init never claims local commit hooks are active in a bare repository", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-bare-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(run("git", ["init", "--bare"], dir).status, 0);
  writePackage(dir, { name: "x", version: "1.0.0", type: "module" });

  const result = run("node", [path.join(repoRoot, "scripts", "init.mjs")], dir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /bare git repository/i);
  assertHookClaimsWithheld(output);
  assert.equal(fs.existsSync(path.join(dir, "hooks", "pre-commit")), false);
  assert.equal(fs.existsSync(path.join(dir, "hooks", "pre-push")), false);
});

test("init warns when run outside a git repository", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-nongit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeFile(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "x", version: "1.0.0" }, null, 2)}\n`,
  );

  const result = run("node", [path.join(repoRoot, "scripts", "init.mjs")], dir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /not a git repository/);
  assertHookClaimsWithheld(output);
  // Scripts and config are still written so a later `git init` + doctor works.
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json")));
  assert.equal(pkg.scripts.doctor, "commitment-issues doctor");
});

test("init errors and exits when there is no package.json", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-nopkg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Run the real script (resolves its own lib/ imports) from a dir with no
  // package.json to hit the early "run this from your project root" guard.
  const result = run("node", [path.join(repoRoot, "scripts", "init.mjs")], dir);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /No package\.json found/);
});

test("init errors clearly when package.json is invalid JSON", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "package.json"), "{ invalid json\n");

  const result = runInit(tempDir);
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /Invalid package\.json/);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Fix package\.json so it contains valid JSON/,
  );
});

const invalidContainerShapes = [
  ["null", null],
  ["a string", "unexpected-string"],
  ["a number", 42],
  ["a boolean", true],
  ["an array", []],
];

for (const [description, value] of invalidContainerShapes) {
  test(`init rejects ${description} as the package.json root without writing`, (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    writePackage(tempDir, value);
    const before = readFile(tempDir, "package.json");
    const result = runInit(tempDir);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /Invalid package\.json structure/);
    assert.match(output, /root value/);
    assert.match(output, /No files were changed/);
    assert.doesNotMatch(output, /TypeError|\s+at .*init\.mjs/);
    assert.equal(readFile(tempDir, "package.json"), before);
  });
}

for (const property of ["scripts", "precommitChecks"]) {
  for (const [description, value] of invalidContainerShapes) {
    test(`init rejects ${description} as package.json ${property} without writing`, (t) => {
      const tempDir = createTempRepo();
      t.after(() => cleanupTempRepo(tempDir));

      writePackage(tempDir, {
        name: "x",
        version: "1.0.0",
        [property]: value,
      });
      const before = readFile(tempDir, "package.json");
      const result = runInit(tempDir);
      const output = `${result.stdout}${result.stderr}`;

      assert.equal(result.status, 1);
      assert.match(output, /Invalid package\.json structure/);
      assert.match(output, new RegExp(`property .*${property}`));
      assert.match(output, /No files were changed/);
      assert.doesNotMatch(output, /TypeError|\s+at .*init\.mjs/);
      assert.equal(readFile(tempDir, "package.json"), before);
    });
  }
}

test("init accepts empty scripts and precommitChecks objects", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    scripts: {},
    precommitChecks: {},
  });

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  const pkg = readPackage(tempDir);
  assert.equal(pkg.scripts.prepare, "commitment-issues doctor --quiet");
  assert.equal(pkg.precommitChecks.advisePushTests, true);
});

test("init rejects inert command mentions in executable custom hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, { name: "x", version: "1.0.0" });
  const bodies = {
    "pre-commit": "#!/bin/sh\n# commitment-issues precommit\n",
    "pre-push": "#!/bin/sh\nprintf '%s\\n' 'commitment-issues prepush'\n",
  };
  for (const [name, body] of Object.entries(bodies)) {
    fs.writeFileSync(gitHook(tempDir, name), body);
    fs.chmodSync(gitHook(tempDir, name), 0o755);
  }

  const result = runInit(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assertHookClaimsWithheld(output);
  assert.match(output, /pre-commit: commitment-issues precommit/);
  assert.match(output, /pre-push: commitment-issues prepush/);
  for (const [name, body] of Object.entries(bodies)) {
    assert.equal(fs.readFileSync(gitHook(tempDir, name), "utf8"), body);
  }
});

test(
  "init reports a non-executable custom hook without changing it",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    writePackage(tempDir, { name: "x", version: "1.0.0" });
    const body = "#!/bin/sh\ncommitment-issues precommit\n";
    fs.writeFileSync(gitHook(tempDir, "pre-commit"), body);
    fs.chmodSync(gitHook(tempDir, "pre-commit"), 0o644);

    const result = runInit(tempDir);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0);
    assertHookClaimsWithheld(output);
    assert.match(output, /not executable/);
    assert.match(output, /chmod \+x \.git\/hooks\/pre-commit/);
    assert.equal(fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"), body);
    assert.equal(fs.statSync(gitHook(tempDir, "pre-commit")).mode & 0o111, 0);
  },
);

test("init creates a .gitignore when none exists", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.rmSync(path.join(tempDir, ".gitignore"), { force: true });
  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.match(readFile(tempDir, ".gitignore"), /\.eslintcache/);
});

test("init appends caches to a .gitignore with no trailing newline", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, ".gitignore"), "dist");
  writePackage(tempDir, { name: "x", version: "1.0.0", type: "module" });

  const result = runInit(tempDir);
  assert.equal(result.status, 0);
  assert.match(readFile(tempDir, ".gitignore"), /dist\n\.eslintcache/);
});

test("init --dry-run previews changes without writing files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writePackage(tempDir, {
    name: "x",
    version: "1.0.0",
    private: true,
    type: "module",
  });

  const beforePackage = readPackage(tempDir);
  fs.rmSync(path.join(tempDir, ".gitignore"), { force: true });
  // A husky-era setup that a real run would migrate.
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);
  writeFile(path.join(tempDir, ".husky", "_", "h"), "# husky shim\n");
  writeFile(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );

  const result = runInit(tempDir, ["--dry-run"]);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /dry run preview/i);
  assert.match(output, /Would add:/);
  // The preview must cover everything a real run would change, including the
  // hook files, migration steps, and .gitignore defaults that are only
  // written outside dry-run.
  assert.match(output, /\.git\/hooks\/pre-commit/);
  assert.match(output, /\.git\/hooks\/pre-push/);
  assert.match(output, /retired husky-era core\.hooksPath/);
  assert.match(output, /removed legacy \.husky wiring/);
  assert.match(output, /\.gitignore defaults/);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(hooksPath(tempDir), ".husky/_");
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.equal(fs.existsSync(path.join(tempDir, ".gitignore")), false);
  assert.deepEqual(readPackage(tempDir), beforePackage);
});
