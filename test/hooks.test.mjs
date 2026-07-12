// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  writeHook,
} from "../scripts/lib/hooks.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  run,
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
  assert.equal(isHuskyHooksPath("custom/hooks"), false);
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
