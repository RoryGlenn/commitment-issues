// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  readFile,
  run,
  setPrecommitConfig,
  writeCrossPlatformShim,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runCommitMsg(tempDir, args = [], options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "commit-msg.mjs"), ...args],
    tempDir,
    options,
  );
}

function localBinDir(tempDir) {
  const nodeModules = path.join(tempDir, "node_modules");
  if (fs.lstatSync(nodeModules).isSymbolicLink()) {
    fs.unlinkSync(nodeModules);
  }
  const binDir = path.join(nodeModules, ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  return binDir;
}

function installFakeCommitlint(tempDir, { withCli = false } = {}) {
  const binDir = localBinDir(tempDir);
  writeCrossPlatformShim(
    binDir,
    "commitlint",
    `import fs from "node:fs";
const args = process.argv.slice(2);
if (process.env.FAKE_COMMITLINT_LOG) {
  fs.appendFileSync(process.env.FAKE_COMMITLINT_LOG, JSON.stringify(args) + "\\n");
}
const delay = Number(process.env.FAKE_COMMITLINT_DELAY_MS || "0");
if (delay > 0) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}
const status = Number(process.env.FAKE_COMMITLINT_STATUS || "0");
if (process.env.FAKE_COMMITLINT_OUTPUT) {
  process.stderr.write(process.env.FAKE_COMMITLINT_OUTPUT + "\\n");
}
process.exit(status);
`,
  );

  if (withCli) {
    const cliPath = path.join(tempDir, "scripts", "cli.mjs");
    writeCrossPlatformShim(
      binDir,
      "commitment-issues",
      `import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, [${JSON.stringify(cliPath)}, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status == null ? 1 : result.status);
`,
    );
  }
  return binDir;
}

function messageFile(tempDir, name = "COMMIT EDIT;message [猫].txt") {
  const file = path.join(tempDir, "message files", name);
  writeFile(file, "bad: message\n");
  return file;
}

test("commit-msg is silent and does not require a file when disabled", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runCommitMsg(tempDir);
  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`, "");
});

test("advisory commitlint forwards a literal absolute message path", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const file = messageFile(tempDir);
  const log = path.join(tempDir, "commitlint-args.log");
  const result = runCommitMsg(tempDir, [file], {
    env: {
      ...process.env,
      FAKE_COMMITLINT_LOG: log,
      FAKE_COMMITLINT_STATUS: "1",
      FAKE_COMMITLINT_OUTPUT: "type must be one of feat, fix [type-enum]",
    },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Commit message needs attention/);
  assert.match(output, /Commit will continue/);
  assert.match(output, /type must be one of feat, fix/);
  assert.deepEqual(JSON.parse(readFile(tempDir, "commitlint-args.log")), [
    "--color=false",
    "--strict",
    "--edit",
    path.resolve(file),
  ]);
});

test("blocking commitlint rejects the same reported problem", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, {
    commitMessage: { enabled: true, blockOnFailure: true },
  });

  const result = runCommitMsg(tempDir, [messageFile(tempDir)], {
    env: {
      ...process.env,
      FAKE_COMMITLINT_STATUS: "1",
      FAKE_COMMITLINT_OUTPUT: "subject may not be empty [subject-empty]",
    },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Commit blocked/);
  assert.match(output, /git commit --no-verify/);
});

test("a successful project-local commitlint run stays silent", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const result = runCommitMsg(tempDir, [messageFile(tempDir)], {
    env: { ...process.env, FAKE_COMMITLINT_STATUS: "0" },
  });
  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`, "");
});

test("commit-msg applies the configured fun tone", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, {
    tone: "fun",
    commitMessage: { enabled: true },
  });

  const result = runCommitMsg(tempDir, [messageFile(tempDir)], {
    env: {
      ...process.env,
      FAKE_COMMITLINT_STATUS: "1",
      FAKE_COMMITLINT_OUTPUT: "type-enum needs attention",
    },
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /Commit message sent mixed signals/);
  assert.match(output, /relationship note/);
});

test("missing project-local commitlint never falls back to npx", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const advisory = runCommitMsg(tempDir, [messageFile(tempDir)]);
  const advisoryOutput = `${advisory.stdout}${advisory.stderr}`;
  assert.equal(advisory.status, 0);
  assert.match(advisoryOutput, /project-local commitlint CLI is not installed/);
  assert.match(advisoryOutput, /No npx, network, or global-tool fallback/);
  assert.match(advisoryOutput, /npm install -D @commitlint\/cli/);

  setPrecommitConfig(tempDir, {
    commitMessage: { enabled: true, blockOnFailure: true },
  });
  const blocking = runCommitMsg(tempDir, [
    messageFile(tempDir, "blocking.txt"),
  ]);
  assert.equal(blocking.status, 1);
  assert.match(`${blocking.stdout}${blocking.stderr}`, /Commit blocked/);
});

test("missing consumer commitlint config is distinct from lint findings", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });
  const env = {
    ...process.env,
    FAKE_COMMITLINT_STATUS: "9",
    FAKE_COMMITLINT_OUTPUT: "Please add rules to your commitlint.config.js",
  };

  const advisory = runCommitMsg(tempDir, [messageFile(tempDir)], { env });
  assert.equal(advisory.status, 0);
  assert.match(
    `${advisory.stdout}${advisory.stderr}`,
    /configuration not found/i,
  );
  assert.match(
    `${advisory.stdout}${advisory.stderr}`,
    /No built-in Conventional Commits rules were substituted/,
  );

  setPrecommitConfig(tempDir, {
    commitMessage: { enabled: true, blockOnFailure: true },
  });
  const blocking = runCommitMsg(tempDir, [messageFile(tempDir, "config.txt")], {
    env,
  });
  assert.equal(blocking.status, 1);
});

test("strict-mode empty-rules output keeps the missing-config diagnosis", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const result = runCommitMsg(tempDir, [messageFile(tempDir)], {
    env: {
      ...process.env,
      FAKE_COMMITLINT_STATUS: "3",
      FAKE_COMMITLINT_OUTPUT:
        "Please add rules to your commitlint.config.js [empty-rules]",
    },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Commitlint configuration not found/);
  assert.match(output, /No built-in Conventional Commits rules/);
  assert.doesNotMatch(output, /Commit message needs attention/);
});

test("commitlint uses the shared configurable timeout", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir);
  setPrecommitConfig(tempDir, {
    timeoutMs: 5,
    commitMessage: { enabled: true },
  });

  const result = runCommitMsg(tempDir, [messageFile(tempDir)], {
    env: { ...process.env, FAKE_COMMITLINT_DELAY_MS: "100" },
  });
  assert.equal(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Commitlint timed out/);
});

test("missing message-file arguments follow advisory and blocking modes", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, { commitMessage: { enabled: true } });

  const advisory = runCommitMsg(tempDir);
  assert.equal(advisory.status, 0);
  assert.match(
    `${advisory.stdout}${advisory.stderr}`,
    /No message file was provided/,
  );

  setPrecommitConfig(tempDir, {
    commitMessage: { enabled: true, blockOnFailure: true },
  });
  const blocking = runCommitMsg(tempDir, ["missing message file.txt"]);
  assert.equal(blocking.status, 1);
  assert.match(`${blocking.stdout}${blocking.stderr}`, /Could not open/);
});

test("nested config diagnostics run even when a typo leaves the check disabled", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(tempDir, {
    commitMessage: { enable: true, blockOnFailure: "yes" },
  });

  const result = runCommitMsg(tempDir);
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0);
  assert.match(output, /commitMessage\.enable/);
  assert.match(output, /commitMessage\.blockOnFailure must be a boolean/);
});

test("generated commit-msg hook blocks normally and --no-verify bypasses it", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));
  installFakeCommitlint(tempDir, { withCli: true });
  setPrecommitConfig(tempDir, {
    requireTests: false,
    protectedBranches: [],
    commitMessage: { enabled: true, blockOnFailure: true },
  });

  const init = run("node", ["scripts/init.mjs"], tempDir);
  assert.equal(init.status, 0);
  const hookPath = path.join(tempDir, ".git", "hooks", "commit-msg");
  assert.match(fs.readFileSync(hookPath, "utf8"), /commit-msg "\$1"/);
  if (process.platform !== "win32") {
    assert.ok(fs.statSync(hookPath).mode & 0o111);
  }

  writeFile(path.join(tempDir, "bypass.txt"), "content\n");
  run("git", ["add", "bypass.txt"], tempDir);
  const log = path.join(tempDir, "hook-commitlint.log");
  const env = {
    ...process.env,
    FAKE_COMMITLINT_LOG: log,
    FAKE_COMMITLINT_STATUS: "1",
    FAKE_COMMITLINT_OUTPUT: "invalid commit message",
  };

  const blocked = run("git", ["commit", "-m", "bad message"], tempDir, { env });
  assert.equal(blocked.status, 1);
  assert.match(`${blocked.stdout}${blocked.stderr}`, /Commit blocked/);
  assert.equal(
    readFile(tempDir, "hook-commitlint.log").trim().split("\n").length,
    1,
  );

  const bypassed = run(
    "git",
    ["commit", "--no-verify", "-m", "bad bypassed message"],
    tempDir,
    { env },
  );
  assert.equal(bypassed.status, 0);
  assert.equal(
    readFile(tempDir, "hook-commitlint.log").trim().split("\n").length,
    1,
  );
});
