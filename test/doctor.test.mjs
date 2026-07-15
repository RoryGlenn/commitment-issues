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
  repoRoot,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runDoctor(tempDir, args = [], options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "doctor.mjs"), ...args],
    tempDir,
    options,
  );
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

test("doctor rejects unknown options before repairing hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runDoctor(tempDir, ["--quite"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Unknown doctor option: --quite/);
  assert.match(output, /No hooks were changed/);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

// Simulate the wiring a pre-3.0 (husky-era) setup leaves behind: hooksPath
// pointing at husky's shim dir plus our generated `.husky` hook files. With
// `live: true` a husky package stub is installed (the "user deliberately
// keeps husky" case); the default simulates the v3 upgrade path, where husky
// is already pruned from node_modules and the wiring is a dead end.
function wireHuskyEra(tempDir, { live = false } = {}) {
  run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);
  fs.mkdirSync(path.join(tempDir, ".husky", "_"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, ".husky", "_", "h"), "# husky shim\n");
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "commitment-issues precommit\n",
  );
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-push"),
    "commitment-issues prepush\n",
  );
  fs.chmodSync(path.join(tempDir, ".husky", "pre-commit"), 0o755);
  fs.chmodSync(path.join(tempDir, ".husky", "pre-push"), 0o755);
  if (live) {
    // Swap the node_modules symlink (which points at the real repo, where
    // husky is no longer installed) for a real dir: a husky stub plus
    // symlinks for the peer tools so the missing-tools advisory stays quiet.
    fs.unlinkSync(path.join(tempDir, "node_modules"));
    fs.mkdirSync(path.join(tempDir, "node_modules", "husky"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "husky", "package.json"),
      '{"name":"husky","version":"9.0.0"}\n',
    );
    for (const tool of ["eslint", "prettier"]) {
      fs.symlinkSync(
        path.join(repoRoot, "node_modules", tool),
        path.join(tempDir, "node_modules", tool),
      );
    }
  }
}

test("doctor wires up native hooks in a fresh repo", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.equal(hooksPath(tempDir), "");
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    /commitment-issues precommit/,
  );
  assert.match(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    /commitment-issues prepush/,
  );
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
});

test("doctor wires and fresh-clone repairs opt-in commit-msg hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const first = runDoctor(tempDir);
  const firstOutput = `${first.stdout}${first.stderr}`;
  assert.equal(first.status, 0);
  assert.match(firstOutput, /Commit-message linting is not ready/);
  assert.match(firstOutput, /project-local commitlint CLI is not installed/);
  assert.match(
    fs.readFileSync(gitHook(tempDir, "commit-msg"), "utf8"),
    /commitment-issues commit-msg "\$1"/,
  );

  fs.rmSync(gitHook(tempDir, "commit-msg"));
  const repaired = runDoctor(tempDir, ["--quiet"]);
  const repairedOutput = `${repaired.stdout}${repaired.stderr}`;
  assert.equal(repaired.status, 0);
  assert.match(repairedOutput, /repaired git hooks/);
  assert.match(repairedOutput, /commit-msg/);
  assert.match(repairedOutput, /project-local commitlint is missing/);
  assert.ok(fs.existsSync(gitHook(tempDir, "commit-msg")));
});

test("doctor preserves custom commit-msg hooks and requires safe forwarding", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });
  runDoctor(tempDir);
  writeFile(gitHook(tempDir, "commit-msg"), "echo custom message hook\n");

  const unwired = runDoctor(tempDir);
  const unwiredOutput = `${unwired.stdout}${unwired.stderr}`;
  assert.equal(unwired.status, 1);
  assert.match(unwiredOutput, /commit-msg/);
  assert.match(unwiredOutput, /commitment-issues commit-msg "\$1"/);
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "commit-msg"), "utf8"),
    "echo custom message hook\n",
  );

  fs.writeFileSync(
    gitHook(tempDir, "commit-msg"),
    'echo custom\ncommitment-issues commit-msg "$1"\n',
  );
  const safe = runDoctor(tempDir);
  assert.equal(safe.status, 0);
  assert.match(`${safe.stdout}${safe.stderr}`, /Git hooks are healthy/);
});

test("doctor diagnoses invalid commitMessage config without requiring a hook", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, {
    commitMessage: { enable: true, enabled: "yes" },
  });

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /Configuration needs attention/);
  assert.match(output, /commitMessage\.enable/);
  assert.match(output, /commitMessage\.enabled must be a boolean/);
  assert.equal(fs.existsSync(gitHook(tempDir, "commit-msg")), false);
});

test("doctor reports healthy once everything is wired", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // first run repairs
  const result = runDoctor(tempDir); // second run: nothing to fix
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
});

test("doctor recreates a missing hook file", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring + hook files
  fs.rmSync(gitHook(tempDir, "pre-push"), { force: true });

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-push")));
});

test("doctor refreshes the exact path-fallback generated pre-push hook", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  const hookPath = gitHook(tempDir, "pre-push");
  const current = fs.readFileSync(hookPath, "utf8");
  const stale = `#!/bin/sh
# Installed by commitment-issues. Recreate anytime with: commitment-issues doctor
if [ "$COMMITMENT_ISSUES" = "0" ] || [ "$HUSKY" = "0" ]; then
  exit 0
fi
export PATH="node_modules/.bin:$PATH"
if ! command -v commitment-issues >/dev/null 2>&1; then
  echo "commitment-issues: command not found; skipping pre-push checks." >&2
  exit 0
fi
commitment-issues prepush "$@"
`;
  fs.writeFileSync(hookPath, stale);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.match(output, /outdated generated hook file\(s\): pre-push/);
  assert.equal(fs.readFileSync(hookPath, "utf8"), current);
});

test("doctor preserves a customized pre-push hook without forwarded args", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  const hookPath = gitHook(tempDir, "pre-push");
  const custom = "#!/bin/sh\necho custom\ncommitment-issues prepush\n";
  fs.writeFileSync(hookPath, custom);

  const result = runDoctor(tempDir);

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(hookPath, "utf8"), custom);
});

test("doctor respects live husky-era wiring and only nudges", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir, { live: true }); // husky still installed and wired

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  // The user may be keeping husky deliberately; a working setup is healthy.
  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
  assert.match(output, /husky-era wiring/);
  assert.match(output, /commitment-issues init/);
  assert.equal(hooksPath(tempDir), ".husky/_");
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
});

test("doctor reports live husky-era hooks that never invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir, { live: true });
  fs.writeFileSync(
    path.join(tempDir, ".husky", "pre-commit"),
    "echo my own hook\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /core\.hooksPath points somewhere else/);
  assert.match(output, /\.husky\/pre-commit/);
  assert.match(output, /commitment-issues init/);
  // Never rewired or deleted behind the user's back.
  assert.equal(hooksPath(tempDir), ".husky/_");
});

test("doctor migrates dead husky-era wiring to native hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // The v3 upgrade path: hooksPath still points at husky's shim dir, but the
  // husky package is gone, so nothing maintains that wiring anymore.
  wireHuskyEra(tempDir);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Repaired the git hook wiring/);
  assert.match(output, /husky-era core\.hooksPath/);
  assert.equal(hooksPath(tempDir), "");
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-commit")));
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-push")));
  // Doctor migrates wiring but never deletes files; our exact-match legacy
  // hooks are not the user's work, so they are not reported either.
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "pre-commit")));
  assert.doesNotMatch(output, /Leftover \.husky hooks/);
});

test("doctor warns about user-authored .husky hooks that no longer run", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir);
  fs.writeFileSync(
    path.join(tempDir, ".husky", "commit-msg"),
    "echo custom message check\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Leftover \.husky hooks no longer run/);
  assert.match(output, /\.husky\/commit-msg/);
  assert.equal(countTerminalBoxes(output), 1);
  // Advisory only: the user's file is never deleted.
  assert.ok(fs.existsSync(path.join(tempDir, ".husky", "commit-msg")));
});

test("doctor --quiet warns in one line about stranded .husky hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // healthy native wiring
  fs.mkdirSync(path.join(tempDir, ".husky"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, ".husky", "commit-msg"),
    "echo custom message check\n",
  );

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /\.husky\/commit-msg no longer run/);
});

test("doctor accepts a custom hook that still invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring + exact hook bodies
  // A user adds their own line but keeps our subcommand — still healthy.
  fs.writeFileSync(
    gitHook(tempDir, "pre-commit"),
    "echo running my own lint step\ncommitment-issues precommit\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
});

test("doctor rejects inert command mentions without changing custom hooks", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish executable hook files
  const bodies = {
    "pre-commit": "#!/bin/sh\necho 'commitment-issues precommit'\n",
    "pre-push": '#!/bin/sh\nexample="commitment-issues prepush"\n',
  };
  for (const [name, body] of Object.entries(bodies)) {
    fs.writeFileSync(gitHook(tempDir, name), body);
  }

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  for (const [name, body] of Object.entries(bodies)) {
    assert.equal(fs.readFileSync(gitHook(tempDir, name), "utf8"), body);
  }
});

test(
  "doctor reports a non-executable custom hook without changing it",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    runDoctor(tempDir);
    const hookPath = gitHook(tempDir, "pre-commit");
    const body = "#!/bin/sh\ncommitment-issues precommit\n";
    fs.writeFileSync(hookPath, body);
    fs.chmodSync(hookPath, 0o644);

    const result = runDoctor(tempDir);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /not executable/);
    assert.match(output, /Run: chmod \+x '\.git\/hooks\/pre-commit'/);
    assert.match(output, /\.git\/hooks\/pre-commit/);
    assert.equal(fs.readFileSync(hookPath, "utf8"), body);
    assert.equal(fs.statSync(hookPath).mode & 0o111, 0);
  },
);

test(
  "doctor shell-quotes a non-executable foreign hook path",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    const configuredHooksPath = "-hooks with spaces;$(touch injected)'quoted";
    const hookPath = path.join(tempDir, configuredHooksPath, "pre-commit");
    const hookBody = "#!/bin/sh\ncommitment-issues precommit\n";
    writeFile(hookPath, hookBody);
    fs.chmodSync(hookPath, 0o644);
    run("git", ["config", "core.hooksPath", configuredHooksPath], tempDir);

    const result = runDoctor(tempDir);
    const output = `${result.stdout}${result.stderr}`;
    const quotedPath = `'./-hooks with spaces;$(touch injected)'"'"'quoted/pre-commit'`;
    const fixCommand = `chmod +x ${quotedPath}`;

    assert.equal(result.status, 1);
    assert.ok(output.includes(fixCommand));
    assert.equal(fs.readFileSync(hookPath, "utf8"), hookBody);
    assert.equal(fs.statSync(hookPath).mode & 0o111, 0);
    assert.equal(fs.existsSync(path.join(tempDir, "injected")), false);

    const fixed = run("sh", ["-c", fixCommand], tempDir);
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.notEqual(fs.statSync(hookPath).mode & 0o111, 0);
    assert.equal(fs.existsSync(path.join(tempDir, "injected")), false);
  },
);

test("doctor reports a pre-commit hook that never invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(gitHook(tempDir, "pre-commit"), "echo my own hook\n");

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  assert.match(output, /\.git\/hooks\/pre-commit/);
  // The user's own hook body must never be overwritten.
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    "echo my own hook\n",
  );
});

test("doctor reports a pre-push hook that never invokes commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(gitHook(tempDir, "pre-push"), "echo my own hook\n");

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  assert.match(output, /\.git\/hooks\/pre-push/);
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-push"), "utf8"),
    "echo my own hook\n",
  );
});

test("doctor --quiet warns but exits 0 when a hook does not invoke commitment-issues", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  fs.writeFileSync(gitHook(tempDir, "pre-commit"), "echo my own hook\n");

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  // Never break an install, but do not silently claim health either.
  assert.equal(result.status, 0);
  assert.match(output, /do not invoke commitment-issues/);
  assert.equal(
    fs.readFileSync(gitHook(tempDir, "pre-commit"), "utf8"),
    "echo my own hook\n",
  );
});

test("doctor --quiet stays silent when the wiring is healthy", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring
  const result = runDoctor(tempDir, ["--quiet"]);

  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.trim(), "");
});

test("doctor warns about malformed standalone config without blocking repair", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.writeFileSync(
    path.join(tempDir, ".commitmentrc.json"),
    "{ invalid json\n",
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Configuration needs attention/);
  assert.match(output, /\.commitmentrc\.json/);
  assert.match(output, /contains invalid JSON/);
  assert.match(output, /Repaired the git hook wiring/);
  assert.equal(countTerminalBoxes(output), 1);
  assert.equal(
    fs.readFileSync(path.join(tempDir, ".commitmentrc.json"), "utf8"),
    "{ invalid json\n",
  );
});

test("doctor --quiet reports malformed standalone config in one line", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir);
  fs.writeFileSync(path.join(tempDir, ".commitmentrc.json"), "[]\n");

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`.trim();

  assert.equal(result.status, 0);
  assert.match(output, /\.commitmentrc\.json/);
  assert.match(output, /must contain a JSON object/);
  assert.equal(output.split(/\r?\n/).length, 1);
});

test("doctor treats a wired foreign core.hooksPath as healthy", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // The user manages their own hooks dir but invokes us from it.
  fs.mkdirSync(path.join(tempDir, "githooks"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "githooks", "pre-commit"),
    "commitment-issues precommit\n",
  );
  fs.writeFileSync(
    path.join(tempDir, "githooks", "pre-push"),
    "commitment-issues prepush\n",
  );
  fs.chmodSync(path.join(tempDir, "githooks", "pre-commit"), 0o755);
  fs.chmodSync(path.join(tempDir, "githooks", "pre-push"), 0o755);
  run("git", ["config", "core.hooksPath", "githooks"], tempDir);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
  assert.match(output, /githooks/);
  // The user's configuration is never rewired.
  assert.equal(hooksPath(tempDir), "githooks");
});

test("doctor resolves a tilde-based core.hooksPath through Git", (t) => {
  const tempDir = createTempRepo();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-home-"));
  t.after(() => cleanupTempRepo(tempDir));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));

  const hooksDir = path.join(homeDir, "shared hooks");
  for (const [name, command] of [
    ["pre-commit", "commitment-issues precommit"],
    ["pre-push", "commitment-issues prepush"],
  ]) {
    writeFile(path.join(hooksDir, name), `#!/bin/sh\n${command}\n`);
    fs.chmodSync(path.join(hooksDir, name), 0o755);
  }
  run("git", ["config", "core.hooksPath", "~/shared hooks"], tempDir);

  const result = runDoctor(tempDir, [], {
    env: { ...process.env, HOME: homeDir },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
  assert.match(output, /~\/shared hooks/);
});

test("doctor reports an unwired foreign core.hooksPath without touching it", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.mkdirSync(path.join(tempDir, "githooks"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "githooks", "pre-commit"),
    "echo my own hook\n",
  );
  fs.chmodSync(path.join(tempDir, "githooks", "pre-commit"), 0o755);
  run("git", ["config", "core.hooksPath", "githooks"], tempDir);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /core\.hooksPath points somewhere else/);
  assert.match(output, /commitment-issues precommit/);
  assert.equal(hooksPath(tempDir), "githooks");
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
});

test("doctor --quiet warns but exits 0 for an unwired foreign core.hooksPath", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.mkdirSync(path.join(tempDir, "githooks"), { recursive: true });
  run("git", ["config", "core.hooksPath", "githooks"], tempDir);

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /core\.hooksPath is set to githooks/);
  assert.equal(hooksPath(tempDir), "githooks");
});

test("doctor reports an uninspectable hook in a foreign core.hooksPath", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const customDir = path.join(tempDir, "custom-hooks");
  fs.mkdirSync(path.join(customDir, "pre-commit"), { recursive: true });
  assert.equal(
    run("git", ["config", "core.hooksPath", "custom-hooks"], tempDir).status,
    0,
  );

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /pre-commit.*could not be inspected/i);
  assert.equal(
    fs.statSync(path.join(customDir, "pre-commit")).isDirectory(),
    true,
  );
});

// Detach the node_modules symlink (createTempRepo points it at the real repo's,
// where every peer tool resolves) and leave an empty directory in its place, so
// the required tools no longer resolve. Wiring is already on disk from the first
// run, so the next run stays healthy and performs no repair.
function hideNodeModules(tempDir) {
  fs.unlinkSync(path.join(tempDir, "node_modules"));
  fs.mkdirSync(path.join(tempDir, "node_modules"));
}

test("doctor warns (interactive) when required tools are not installed", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring while the tools resolve
  hideNodeModules(tempDir);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  // Advisory: missing tools never fail an otherwise-healthy repo.
  assert.equal(result.status, 0);
  assert.match(output, /Git hooks are healthy/);
  assert.match(output, /Some required tools are not installed/);
  for (const tool of ["eslint", "prettier"]) {
    assert.match(output, new RegExp(tool));
  }
  assert.match(output, /npm install -D/);
  assert.equal(countTerminalBoxes(output), 1);
});

test("doctor --quiet warns about missing tools in one line but exits 0", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  runDoctor(tempDir); // establish healthy wiring first
  hideNodeModules(tempDir);

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /missing required tool\(s\)/);
  assert.match(output, /eslint/);
  assert.match(output, /npm install -D/);
});

test("doctor --quiet repairs and reports in one line", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runDoctor(tempDir, ["--quiet"]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /repaired git hooks/);
  assert.ok(fs.existsSync(gitHook(tempDir, "pre-commit")));
});

test("doctor --quiet never breaks an install outside a git repo", (t) => {
  // Simulates `prepare` running during `npm install` in CI/Docker with no .git.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-nongit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}\n');

  const result = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs"), "--quiet"],
    dir,
  );

  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.trim(), "");
});

test("doctor treats a bare repository as unsupported local-hook wiring", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-bare-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(run("git", ["init", "--bare"], dir).status, 0);
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}\n');

  const interactive = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs")],
    dir,
  );
  const quiet = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs"), "--quiet"],
    dir,
  );

  assert.equal(interactive.status, 1);
  assert.match(
    `${interactive.stdout}${interactive.stderr}`,
    /bare git repository/i,
  );
  assert.equal(quiet.status, 0);
  assert.equal(`${quiet.stdout}${quiet.stderr}`.trim(), "");
  assert.equal(fs.existsSync(path.join(dir, "hooks", "pre-commit")), false);
});

test("doctor fails safely when core.hooksPath cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const env = fakeGitEnv(tempDir, "config --get core.hooksPath", 128);
  const interactive = runDoctor(tempDir, [], { env });
  const quiet = runDoctor(tempDir, ["--quiet"], { env });

  assert.equal(interactive.status, 1);
  assert.match(
    `${interactive.stdout}${interactive.stderr}`,
    /Could not determine core\.hooksPath/,
  );
  assert.equal(quiet.status, 0);
  assert.match(`${quiet.stdout}${quiet.stderr}`, /could not wire up git hooks/);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-commit")), false);
  assert.equal(fs.existsSync(gitHook(tempDir, "pre-push")), false);
});

test("doctor fails safely when the configured hooks directory cannot be resolved", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  assert.equal(
    run("git", ["config", "core.hooksPath", "custom-hooks"], tempDir).status,
    0,
  );
  const env = fakeGitEnv(tempDir, "rev-parse --git-path hooks", 128);
  const interactive = runDoctor(tempDir, [], { env });
  const quiet = runDoctor(tempDir, ["--quiet"], { env });

  assert.equal(interactive.status, 1);
  assert.match(
    `${interactive.stdout}${interactive.stderr}`,
    /Could not locate the configured git hooks directory/,
  );
  assert.equal(quiet.status, 0);
  assert.match(`${quiet.stdout}${quiet.stderr}`, /could not wire up git hooks/);
});

test("doctor reports an uninspectable hook instead of crashing", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  fs.mkdirSync(gitHook(tempDir, "pre-commit"), { recursive: true });
  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /could not be inspected/i);
  assert.equal(fs.statSync(gitHook(tempDir, "pre-commit")).isDirectory(), true);
});

test(
  "doctor never follows a dangling hook symlink during repair",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    t.after(() => cleanupTempRepo(tempDir));

    const outsideTarget = path.join(tempDir, "outside-hook-target");
    fs.symlinkSync(outsideTarget, gitHook(tempDir, "pre-commit"));

    const result = runDoctor(tempDir);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(output, /could not be inspected/i);
    assert.equal(fs.existsSync(outsideTarget), false);
    assert.equal(
      fs.lstatSync(gitHook(tempDir, "pre-commit")).isSymbolicLink(),
      true,
    );
  },
);

test(
  "doctor reports and preserves a symbolic-link .husky directory",
  { skip: process.platform === "win32" },
  (t) => {
    const tempDir = createTempRepo();
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "doctor-husky-link-"),
    );
    t.after(() => cleanupTempRepo(tempDir));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

    fs.mkdirSync(path.join(outside, "_"));
    fs.writeFileSync(path.join(outside, "_", "keep"), "outside\n");
    fs.writeFileSync(
      path.join(outside, "pre-commit"),
      "commitment-issues precommit\n",
    );
    fs.symlinkSync(outside, path.join(tempDir, ".husky"), "dir");
    run("git", ["config", "core.hooksPath", ".husky/_"], tempDir);

    const result = runDoctor(tempDir);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(output, /symbolic link|could not be safely inspected/i);
    assert.match(output, /left unchanged|manual/i);
    assert.equal(
      fs.readFileSync(path.join(outside, "_", "keep"), "utf8"),
      "outside\n",
    );
    assert.equal(
      fs.readFileSync(path.join(outside, "pre-commit"), "utf8"),
      "commitment-issues precommit\n",
    );

    const quiet = runDoctor(tempDir, ["--quiet"]);
    assert.equal(quiet.status, 0);
    assert.match(
      `${quiet.stdout}${quiet.stderr}`,
      /could not be safely inspected.*left unchanged/i,
    );
  },
);

test("doctor errors (interactive) when there is no package.json", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-nopkg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // No --quiet: the "not applicable" guard prints a box and exits 1.
  const result = run(
    "node",
    [path.join(repoRoot, "scripts", "doctor.mjs")],
    dir,
  );

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /No package\.json found/);
});

test("doctor reports failure when the husky-era hooksPath cannot be unset", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir);

  // `git config --unset core.hooksPath` fails; the migration cannot complete.
  const env = fakeGitEnv(tempDir, "config --unset");
  const result = runDoctor(tempDir, [], { env });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Could not repair the git hook wiring/,
  );
});

test("doctor --quiet warns but never fails when repair cannot complete", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir);

  const env = fakeGitEnv(tempDir, "config --unset");
  const result = runDoctor(tempDir, ["--quiet"], { env });

  assert.equal(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /could not wire up git hooks/,
  );
});

test("doctor reports when the wiring is still broken after repair", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  wireHuskyEra(tempDir);

  // `git config --unset` "succeeds" as a silent no-op, so hooksPath survives
  // and the post-repair verification still finds the wiring broken.
  const env = fakeGitEnv(tempDir, "config --unset", 0);
  const result = runDoctor(tempDir, [], { env });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /still looks broken after repair/,
  );
});

test("doctor reports failure when the hook files cannot be written", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A file squatting on .git/hooks makes the hooks dir uncreatable.
  fs.rmSync(path.join(tempDir, ".git", "hooks"), {
    recursive: true,
    force: true,
  });
  fs.writeFileSync(path.join(tempDir, ".git", "hooks"), "not a directory\n");

  const result = runDoctor(tempDir);

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Could not repair the git hook wiring/,
  );
});

test("doctor reports when Git cannot resolve the common hooks directory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runDoctor(tempDir, [], {
    env: fakeGitEnv(tempDir, "rev-parse --git-common-dir"),
  });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Could not locate the git hooks directory/,
  );
});

test("doctor reports successful repairs alongside an unwired custom hook", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(gitHook(tempDir, "pre-push"), "#!/bin/sh\necho custom push\n");
  fs.chmodSync(gitHook(tempDir, "pre-push"), 0o755);

  const result = runDoctor(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /does not invoke commitment-issues/);
  assert.match(output, /Also repaired: \.git\/hooks\/pre-commit/);
});

test("doctor displays absolute paths for hooks outside the project", (t) => {
  const tempDir = createTempRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "external-hooks-"));
  t.after(() => cleanupTempRepo(tempDir));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));

  writeFile(path.join(external, "pre-commit"), "#!/bin/sh\necho external\n");
  fs.chmodSync(path.join(external, "pre-commit"), 0o755);
  run("git", ["config", "core.hooksPath", external], tempDir);

  const result = runDoctor(tempDir);

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}${result.stderr}`,
    new RegExp(external.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("doctor displays shared worktree hooks outside the checkout", (t) => {
  const tempDir = createTempRepo();
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-worktree-"));
  fs.rmSync(worktree, { recursive: true, force: true });
  t.after(() => {
    run("git", ["worktree", "remove", "--force", worktree], tempDir);
    fs.rmSync(worktree, { recursive: true, force: true });
    cleanupTempRepo(tempDir);
  });

  const added = run(
    "git",
    ["worktree", "add", "--detach", worktree, "HEAD"],
    tempDir,
  );
  assert.equal(added.status, 0);

  const result = runDoctor(worktree);
  // Git and Node may spell the same Windows/macOS temp parent differently
  // (8.3 names or /private/var), but the owning repo basename is stable and
  // distinguishes the shared hooks directory from the linked worktree.
  const expectedHooks = `${path.basename(tempDir)}/.git/hooks`;

  assert.equal(result.status, 0);
  assert.match(
    compactTerminalBoxText(`${result.stdout}${result.stderr}`),
    new RegExp(expectedHooks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});
