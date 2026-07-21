// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  classifyHook,
  effectiveHooksDir,
  gitWorkTreeState,
  gitHooksDir,
  hookBody,
  hookCommand,
  hookNamesForConfig,
  hooksPathConfig,
  hooksPathConfigState,
  isHuskyHooksPath,
  legacyHuskyDirectoryState,
  legacyHuskyWiringPaths,
  leftoverHuskyHooks,
  removeLegacyHuskyWiring,
  writeHook,
} from "../scripts/lib/hooks.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  run,
  writeCrossPlatformShim,
} from "./helpers/temp-repo.mjs";

for (const name of ["pre-commit", "pre-push"]) {
  const expectedCommand = hookCommand(name);

  test(`classifyHook recognizes active ${name} hook states`, (t) => {
    const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-classify-"));
    t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));
    const hookPath = path.join(hooksDir, name);

    assert.equal(classifyHook(hooksDir, name), "missing");

    writeHook(hooksDir, name);
    assert.equal(classifyHook(hooksDir, name), "wired");
    assert.equal(fs.readFileSync(hookPath, "utf8"), hookBody(name));

    for (const prefix of ["", "command ", "exec "]) {
      const body = `#!/bin/sh\n${prefix}${expectedCommand}\n`;
      fs.writeFileSync(hookPath, body);
      fs.chmodSync(hookPath, 0o755);
      assert.equal(classifyHook(hooksDir, name), "custom-with-command");
      assert.equal(fs.readFileSync(hookPath, "utf8"), body);
    }

    const documentedBody = [
      "#!/bin/sh",
      "cat <<'DOC'",
      expectedCommand,
      "DOC",
      expectedCommand,
      "",
    ].join("\n");
    fs.writeFileSync(hookPath, documentedBody);
    fs.chmodSync(hookPath, 0o755);
    assert.equal(classifyHook(hooksDir, name), "custom-with-command");
    assert.equal(fs.readFileSync(hookPath, "utf8"), documentedBody);

    const malformedHeredoc = `#!/bin/sh\ncat << ;\n${expectedCommand}\n`;
    fs.writeFileSync(hookPath, malformedHeredoc);
    fs.chmodSync(hookPath, 0o755);
    assert.equal(classifyHook(hooksDir, name), "custom-with-command");
  });

  test(`classifyHook rejects inert ${name} command mentions`, (t) => {
    const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-classify-"));
    t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));
    const hookPath = path.join(hooksDir, name);
    const inertBodies = [
      `#!/bin/sh\n# ${expectedCommand}\n`,
      `#!/bin/sh\necho ${expectedCommand}\n`,
      `#!/bin/sh\nprintf '%s\\n' '${expectedCommand}'\n`,
      `#!/bin/sh\nexample="${expectedCommand}"\n`,
      `#!/bin/sh\n"${expectedCommand}"\n`,
      ["#!/bin/sh", "cat <<'DOC'", expectedCommand, "DOC", ""].join("\n"),
      ["#!/bin/sh", "example='", expectedCommand, "'", ""].join("\n"),
      ["#!/bin/sh", "echo \\", expectedCommand, ""].join("\n"),
      ["#!/bin/sh", "echo word#not-a-comment", ""].join("\n"),
      ["#!/bin/sh", "cat <<-DOC", `\t${expectedCommand}`, "\tDOC", ""].join(
        "\n",
      ),
      ["#!/bin/sh", "cat <<  DOC", expectedCommand, "DOC", ""].join("\n"),
      ["#!/bin/sh", 'cat <<"D\\OC"', expectedCommand, "DOC", ""].join("\n"),
      ["#!/bin/sh", "cat <<D\\OC", expectedCommand, "DOC", ""].join("\n"),
      ["#!/bin/sh", "cat <<DOC; echo ignored", expectedCommand, "DOC", ""].join(
        "\n",
      ),
    ];

    for (const body of inertBodies) {
      fs.writeFileSync(hookPath, body);
      fs.chmodSync(hookPath, 0o755);
      assert.equal(
        classifyHook(hooksDir, name),
        "custom-without-command",
        `expected inert hook body:\n${body}`,
      );
      assert.equal(fs.readFileSync(hookPath, "utf8"), body);
    }
  });

  test(
    `classifyHook rejects a non-executable ${name} hook on POSIX`,
    { skip: process.platform === "win32" },
    (t) => {
      const hooksDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "hooks-classify-"),
      );
      t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));
      const hookPath = path.join(hooksDir, name);
      const body = `#!/bin/sh\n${expectedCommand}\n`;

      fs.writeFileSync(hookPath, body, { mode: 0o644 });
      assert.equal(classifyHook(hooksDir, name), "non-executable");
      assert.equal(fs.readFileSync(hookPath, "utf8"), body);
      assert.equal(fs.statSync(hookPath).mode & 0o111, 0);
    },
  );
}
test("commit-msg wiring is opt-in and quotes Git's message-file argument", () => {
  assert.deepEqual(hookNamesForConfig({}), ["pre-commit", "pre-push"]);
  assert.deepEqual(hookNamesForConfig({ commitMessage: { enabled: false } }), [
    "pre-commit",
    "pre-push",
  ]);
  assert.deepEqual(hookNamesForConfig({ commitMessage: { enabled: true } }), [
    "pre-commit",
    "pre-push",
    "commit-msg",
  ]);
  assert.equal(hookCommand("commit-msg"), 'commitment-issues commit-msg "$1"');
  assert.match(hookBody("commit-msg"), /commitment-issues commit-msg "\$1"/);
});

test("generated hooks never fall back to a global commitment-issues binary", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  const hooksDir = path.join(tempDir, ".git", "hooks");
  writeHook(hooksDir, "pre-commit");
  fs.rmSync(path.join(tempDir, "node_modules"), {
    recursive: true,
    force: true,
  });

  const globalBin = path.join(tempDir, ".global-bin");
  fs.mkdirSync(globalBin);
  const marker = path.join(tempDir, "global-hook-ran");
  writeCrossPlatformShim(
    globalBin,
    "commitment-issues",
    'import fs from "node:fs"; fs.writeFileSync(process.env.GLOBAL_HOOK_MARKER, process.argv.slice(2).join(" "));\n',
  );

  fs.writeFileSync(path.join(tempDir, "change.txt"), "change\n");
  assert.equal(run("git", ["add", "change.txt"], tempDir).status, 0);
  const result = run(
    "git",
    ["commit", "-m", "test local hook boundary"],
    tempDir,
    {
      env: {
        ...process.env,
        PATH: `${globalBin}${path.delimiter}${process.env.PATH}`,
        GLOBAL_HOOK_MARKER: marker,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(marker), false);
  assert.match(result.stderr, /command not found; skipping pre-commit checks/);
});

test(
  "classifyHook treats symbolic-link hook paths as uninspectable",
  { skip: process.platform === "win32" },
  (t) => {
    const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-symlink-"));
    t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));
    const target = path.join(hooksDir, "outside-target");
    fs.writeFileSync(target, hookBody("pre-commit"));
    fs.chmodSync(target, 0o755);
    fs.symlinkSync(target, path.join(hooksDir, "pre-commit"));

    assert.equal(classifyHook(hooksDir, "pre-commit"), "uninspectable");
  },
);

test(
  "writeHook refuses a symbolic-link hooks directory",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-dir-symlink-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const target = path.join(root, "target");
    const linked = path.join(root, "linked");
    fs.mkdirSync(target);
    fs.symlinkSync(target, linked);

    assert.throws(() => writeHook(linked, "pre-commit"), /hooks path/i);
    assert.equal(fs.existsSync(path.join(target, "pre-commit")), false);
  },
);

test(
  "legacy Husky cleanup never follows a symbolic-link .husky directory",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-link-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, "repo");
    const outside = path.join(root, "outside");
    fs.mkdirSync(repo);
    fs.mkdirSync(path.join(outside, "_"), { recursive: true });
    fs.writeFileSync(path.join(outside, "_", "keep"), "outside\n");
    fs.writeFileSync(
      path.join(outside, "pre-commit"),
      "commitment-issues precommit\n",
    );
    fs.symlinkSync(outside, path.join(repo, ".husky"), "dir");

    assert.deepEqual(legacyHuskyWiringPaths(repo), []);
    assert.deepEqual(removeLegacyHuskyWiring(repo), []);
    assert.equal(
      fs.readFileSync(path.join(outside, "_", "keep"), "utf8"),
      "outside\n",
    );
    assert.equal(
      fs.readFileSync(path.join(outside, "pre-commit"), "utf8"),
      "commitment-issues precommit\n",
    );
  },
);

test(
  "legacy Husky cleanup rechecks the root before applying an inventory",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-race-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const husky = path.join(root, ".husky");
    const parked = path.join(root, "parked-husky");
    const outside = path.join(root, "outside");
    fs.mkdirSync(husky);
    fs.mkdirSync(outside);
    fs.writeFileSync(
      path.join(husky, "pre-commit"),
      "commitment-issues precommit\n",
    );
    fs.writeFileSync(
      path.join(outside, "pre-commit"),
      "commitment-issues precommit\n",
    );

    assert.deepEqual(legacyHuskyWiringPaths(root), [".husky/pre-commit"]);
    fs.renameSync(husky, parked);
    fs.symlinkSync(outside, husky, "dir");

    assert.deepEqual(removeLegacyHuskyWiring(root), []);
    assert.equal(
      fs.readFileSync(path.join(outside, "pre-commit"), "utf8"),
      "commitment-issues precommit\n",
    );
    assert.equal(
      fs.readFileSync(path.join(parked, "pre-commit"), "utf8"),
      "commitment-issues precommit\n",
    );
  },
);

test("legacy Husky inspection rejects a non-directory root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-file-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, ".husky"), "not a directory\n");

  assert.equal(legacyHuskyDirectoryState(root).status, "uninspectable");
  assert.deepEqual(legacyHuskyWiringPaths(root), []);
  assert.deepEqual(removeLegacyHuskyWiring(root), []);
});

test("legacy Husky cleanup removes only classified in-repository artifacts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-owned-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(path.join(husky, "_"), { recursive: true });
  fs.writeFileSync(path.join(husky, "_", "shim"), "generated\n");
  fs.writeFileSync(path.join(husky, ".gitignore"), "_\n");
  fs.writeFileSync(
    path.join(husky, "pre-commit"),
    "commitment-issues precommit\n",
  );

  assert.deepEqual(removeLegacyHuskyWiring(root), [
    ".husky/pre-commit",
    ".husky/_",
  ]);
  assert.equal(fs.existsSync(husky), false);
});

test("legacy Husky cleanup preserves non-file hook entries", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-hook-dir-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".husky", "pre-commit"), { recursive: true });
  fs.writeFileSync(path.join(root, ".husky", "_"), "not a directory\n");

  assert.deepEqual(legacyHuskyWiringPaths(root), []);
  assert.deepEqual(removeLegacyHuskyWiring(root), []);
  assert.equal(
    fs.statSync(path.join(root, ".husky", "pre-commit")).isDirectory(),
    true,
  );
  assert.equal(
    fs.readFileSync(path.join(root, ".husky", "_"), "utf8"),
    "not a directory\n",
  );
});

test("legacy Husky inspection treats a directory read failure as uninspectable", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-read-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  const originalReaddirSync = fs.readdirSync;
  t.mock.method(fs, "readdirSync", (filePath, ...args) => {
    if (filePath === husky) {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    }
    return originalReaddirSync(filePath, ...args);
  });

  assert.equal(legacyHuskyDirectoryState(root).status, "uninspectable");
});

test("legacy Husky inspection rejects a root replaced during its read", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-state-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  const originalLstatSync = fs.lstatSync;
  let calls = 0;
  t.mock.method(fs, "lstatSync", (filePath, ...args) => {
    const stats = originalLstatSync(filePath, ...args);
    if (filePath === husky && (calls += 1) === 2) {
      return { ...stats, isDirectory: () => false };
    }
    return stats;
  });

  assert.equal(legacyHuskyDirectoryState(root).status, "uninspectable");
});

test("legacy Husky inventory stops when the inspected root disappears", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-gone-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  const originalLstatSync = fs.lstatSync;
  let calls = 0;
  t.mock.method(fs, "lstatSync", (filePath, ...args) => {
    if (filePath === husky && (calls += 1) >= 3) {
      throw Object.assign(new Error("replaced"), { code: "ENOENT" });
    }
    return originalLstatSync(filePath, ...args);
  });

  assert.deepEqual(legacyHuskyWiringPaths(root), []);
});

test("legacy Husky inventory stops when the inspected root identity changes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  fs.writeFileSync(
    path.join(husky, "pre-commit"),
    "commitment-issues precommit\n",
  );
  const originalLstatSync = fs.lstatSync;
  let rootCalls = 0;
  t.mock.method(fs, "lstatSync", (filePath, ...args) => {
    const stats = originalLstatSync(filePath, ...args);
    if (filePath === husky && (rootCalls += 1) === 3) {
      return { ...stats, ino: stats.ino + 1n };
    }
    return stats;
  });

  assert.deepEqual(legacyHuskyWiringPaths(root), []);
});

test("legacy Husky hook ownership rejects a file replaced during inspection", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "legacy-husky-hook-race-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hookPath = path.join(root, ".husky", "pre-commit");
  fs.mkdirSync(path.dirname(hookPath));
  fs.writeFileSync(hookPath, "commitment-issues precommit\n");
  const originalLstatSync = fs.lstatSync;
  let hookCalls = 0;
  t.mock.method(fs, "lstatSync", (filePath, ...args) => {
    const stats = originalLstatSync(filePath, ...args);
    if (filePath === hookPath && (hookCalls += 1) === 2) {
      return { ...stats, ino: stats.ino + 1n };
    }
    return stats;
  });

  assert.deepEqual(legacyHuskyWiringPaths(root), []);
  assert.equal(
    fs.readFileSync(hookPath, "utf8"),
    "commitment-issues precommit\n",
  );
});

test("leftover Husky inspection absorbs a post-classification read failure", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-leftover-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  const originalReaddirSync = fs.readdirSync;
  let reads = 0;
  t.mock.method(fs, "readdirSync", (filePath, ...args) => {
    if (filePath === husky && (reads += 1) === 2) {
      throw Object.assign(new Error("replaced"), { code: "ENOENT" });
    }
    return originalReaddirSync(filePath, ...args);
  });

  assert.deepEqual(leftoverHuskyHooks(root), []);
});

test("legacy Husky cleanup preserves artifacts when removal fails", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-remove-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  const hookPath = path.join(husky, "pre-commit");
  const runtimePath = path.join(husky, "_");
  fs.mkdirSync(runtimePath, { recursive: true });
  fs.writeFileSync(hookPath, "commitment-issues precommit\n");
  const originalRmSync = fs.rmSync;
  t.mock.method(fs, "rmSync", (filePath, ...args) => {
    if (filePath === hookPath || filePath === runtimePath) {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    }
    return originalRmSync(filePath, ...args);
  });

  assert.deepEqual(removeLegacyHuskyWiring(root), []);
  assert.equal(fs.existsSync(hookPath), true);
  assert.equal(fs.existsSync(runtimePath), true);
});

test("legacy Husky cleanup stops when the final directory read fails", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-husky-final-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const husky = path.join(root, ".husky");
  fs.mkdirSync(husky);
  fs.writeFileSync(
    path.join(husky, "pre-commit"),
    "commitment-issues precommit\n",
  );
  const originalReaddirSync = fs.readdirSync;
  let reads = 0;
  t.mock.method(fs, "readdirSync", (filePath, ...args) => {
    if (filePath === husky && (reads += 1) === 2) {
      throw Object.assign(new Error("replaced"), { code: "ENOENT" });
    }
    return originalReaddirSync(filePath, ...args);
  });

  assert.deepEqual(removeLegacyHuskyWiring(root), [".husky/pre-commit"]);
  assert.equal(fs.existsSync(husky), true);
});

test("hook path probes handle unset, empty, and failed Git output", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-probes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(hooksPathConfig(dir), "");
  assert.equal(gitHooksDir(dir), null);

  const emptyConfig = fakeGitEnv(dir, "config --get core.hooksPath", 0, "");
  assert.equal(hooksPathConfig(dir, emptyConfig), "");

  const emptyCommonDir = fakeGitEnv(dir, "rev-parse --git-common-dir", 0, "");
  assert.equal(gitHooksDir(dir, emptyCommonDir), null);
});

test("hook path state distinguishes an unset value from a failed Git probe", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-path-state-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const unset = fakeGitEnv(dir, "config --get core.hooksPath", 1);
  assert.deepEqual(hooksPathConfigState(dir, unset), {
    value: "",
    error: null,
  });

  const configured = fakeGitEnv(
    dir,
    "config --get core.hooksPath",
    0,
    "custom hooks\n",
  );
  assert.deepEqual(hooksPathConfigState(dir, configured), {
    value: "custom hooks",
    error: null,
  });

  const failed = fakeGitEnv(dir, "config --get core.hooksPath", 128);
  assert.equal(hooksPathConfigState(dir, failed).value, "");
  assert.match(hooksPathConfigState(dir, failed).error, /core\.hooksPath/);
});

test("gitHooksDir resolves relative common directories against the requested cwd", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-common-dir-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const env = fakeGitEnv(dir, "rev-parse --git-common-dir", 0, ".git\n");
  assert.equal(gitHooksDir(dir, env), path.join(dir, ".git", "hooks"));
});

test("effectiveHooksDir resolves Git's configured hook path output", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-effective-dir-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const resolved = fakeGitEnv(
    dir,
    "rev-parse --git-path hooks",
    0,
    "../shared hooks\n",
  );
  assert.equal(
    effectiveHooksDir(dir, resolved),
    path.resolve(dir, "../shared hooks"),
  );

  const failed = fakeGitEnv(dir, "rev-parse --git-path hooks", 128);
  assert.equal(effectiveHooksDir(dir, failed), null);

  const empty = fakeGitEnv(dir, "rev-parse --git-path hooks", 0, "");
  assert.equal(effectiveHooksDir(dir, empty), null);
});

test("git work-tree state distinguishes normal, bare, and missing repositories", (t) => {
  const worktree = createTempRepo();
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "hook-bare-repo-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "hook-no-repo-"));
  t.after(() => cleanupTempRepo(worktree));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

  assert.equal(run("git", ["init", "--bare"], bare).status, 0);
  assert.deepEqual(gitWorkTreeState(worktree), {
    inside: true,
    bare: false,
  });
  assert.deepEqual(gitWorkTreeState(bare), { inside: false, bare: true });
  assert.deepEqual(gitWorkTreeState(outside), {
    inside: false,
    bare: false,
  });
});

test("classifyHook reports an uninspectable hook path without throwing", (t) => {
  const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-unreadable-"));
  t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(hooksDir, "pre-commit"));
  assert.equal(classifyHook(hooksDir, "pre-commit"), "uninspectable");
});

test("classifyHook absorbs a hook read failure", (t) => {
  const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-read-failure-"));
  t.after(() => fs.rmSync(hooksDir, { recursive: true, force: true }));

  const hookPath = path.join(hooksDir, "pre-commit");
  fs.writeFileSync(hookPath, "#!/bin/sh\n");
  const originalReadFileSync = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (filePath, ...args) => {
    if (filePath === hookPath) {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    }
    return originalReadFileSync(filePath, ...args);
  });

  assert.equal(classifyHook(hooksDir, "pre-commit"), "uninspectable");
});

test("Husky hooksPath recognition tolerates absent and normalized values", () => {
  assert.equal(isHuskyHooksPath(undefined), false);
  assert.equal(isHuskyHooksPath(null), false);
  assert.equal(isHuskyHooksPath(" .husky/_/ "), true);
  assert.equal(isHuskyHooksPath(".husky\\_\\\\"), true);
  assert.equal(isHuskyHooksPath(".husky////"), true);
  assert.equal(isHuskyHooksPath("custom/hooks"), false);
});

test("Husky hooksPath recognition rejects long separator runs promptly", () => {
  const adversarialValue = `.husky/${"/".repeat(40_000)}x`;
  const startedAt = performance.now();

  assert.equal(isHuskyHooksPath(adversarialValue), false);

  const elapsedMs = performance.now() - startedAt;
  assert.ok(
    elapsedMs < 500,
    `hooksPath normalization took ${elapsedMs.toFixed(1)} ms`,
  );
});

test("generated commit-msg hooks are executable and exact-match owned", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-msg-hook-"));
  try {
    writeHook(dir, "commit-msg");
    const hookPath = path.join(dir, "commit-msg");
    assert.equal(fs.readFileSync(hookPath, "utf8"), hookBody("commit-msg"));
    assert.equal(classifyHook(dir, "commit-msg"), "wired");
    if (process.platform !== "win32") {
      assert.ok(fs.statSync(hookPath).mode & 0o111);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("custom commit-msg hooks require the safely quoted invocation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "custom-commit-msg-"));
  try {
    const hookPath = path.join(dir, "commit-msg");
    fs.writeFileSync(hookPath, "commitment-issues commit-msg $1\n");
    fs.chmodSync(hookPath, 0o755);
    assert.equal(classifyHook(dir, "commit-msg"), "custom-without-command");

    fs.writeFileSync(
      hookPath,
      '# commitment-issues commit-msg "$1"\necho custom\n',
    );
    fs.chmodSync(hookPath, 0o755);
    assert.equal(classifyHook(dir, "commit-msg"), "custom-without-command");

    fs.writeFileSync(
      hookPath,
      'echo custom\ncommitment-issues commit-msg "$1"\n',
    );
    fs.chmodSync(hookPath, 0o755);
    assert.equal(classifyHook(dir, "commit-msg"), "custom-with-command");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
