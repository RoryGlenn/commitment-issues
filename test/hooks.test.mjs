// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyHook,
  hookBody,
  hookCommand,
  hookNamesForConfig,
  writeHook,
} from "../scripts/lib/hooks.mjs";

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
    ];

    for (const body of inertBodies) {
      fs.writeFileSync(hookPath, body);
      fs.chmodSync(hookPath, 0o755);
      assert.equal(classifyHook(hooksDir, name), "custom-without-command");
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
