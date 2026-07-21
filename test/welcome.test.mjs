// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hookBody } from "../scripts/lib/hooks.mjs";
import { withoutGitLocalEnvironment } from "../scripts/lib/process.mjs";
import {
  WELCOME_MARKER_DIRECTORY,
  WELCOME_MARKER_NAME,
  buildWelcomeMessage,
  inspectWelcomeMarker,
  showWelcomeOnFirstCommit,
  welcomeContentWidth,
  welcomeMarkerPath,
  writeWelcomeMarker,
} from "../scripts/lib/welcome.mjs";
import {
  compactTerminalBoxText,
  countTerminalBoxes,
  stripAnsi,
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

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

function runHook(tempDir, args = [], options = {}) {
  return run(
    "node",
    [path.join(repoRoot, "scripts", "precommit.mjs"), ...args],
    tempDir,
    options,
  );
}

function realWelcomeMarkerPath(tempDir) {
  const commonDir = run(
    "git",
    ["rev-parse", "--git-common-dir"],
    tempDir,
  ).stdout.trim();
  return path.join(
    path.resolve(tempDir, commonDir),
    WELCOME_MARKER_DIRECTORY,
    WELCOME_MARKER_NAME,
  );
}

test("welcome message includes the compact Commit Owl and detected doctor command", () => {
  const first = buildWelcomeMessage({
    doctorCommand: "pnpm run doctor",
    contentWidth: 24,
  });
  const text = stripAnsi(first.lines.join("\n"));

  assert.equal(first.severity, "info");
  assert.match(text, /,_/);
  assert.match(text, /\(O,O\) {2}<3/);
  assert.match(text, /\( {3}\)/);
  assert.match(text, /-"-"-/);
  assert.match(text, /Commitment Issues is active here\./);
  assert.match(text, /checks changes before each\s+commit/);
  assert.doesNotMatch(text, /uses its own product/);
  assert.match(text, /tell us if\s+any guidance feels confusing/);
  assert.match(text, /Verify or repair the hooks anytime: pnpm run doctor/);
  assert.doesNotMatch(text, /Check your setup anytime/);

  const wide = buildWelcomeMessage({ doctorCommand: "pnpm run doctor" });
  const wideLines = wide.lines.map((line) => stripAnsi(line));
  const wideFaceStart = wideLines[1].indexOf("(O,O)");
  const repairHint = wideLines.at(-1);
  assert.equal(
    wideFaceStart,
    Math.floor((repairHint.length - "(O,O)".length) / 2),
  );

  const owl = first.lines.slice(0, 4).map((line) => stripAnsi(line));
  const faceStart = owl[1].indexOf("(O,O)");
  assert.equal(owl[0].indexOf(",_,"), faceStart + 1);
  assert.equal(owl[2].indexOf("(   )"), faceStart);
  assert.equal(owl[3].indexOf('-"-"-'), faceStart);
  assert.equal(owl[1].indexOf("<3"), faceStart + 7);

  first.lines[0] = "changed by caller";
  assert.notEqual(
    stripAnsi(
      buildWelcomeMessage({ doctorCommand: "pnpm run doctor" }).lines[0],
    ),
    "changed by caller",
  );
});

test("welcome content width follows the terminal and stays compact", () => {
  assert.equal(welcomeContentWidth({}, {}), 51);
  assert.equal(welcomeContentWidth({ COLUMNS: "24" }, {}), 18);
  assert.equal(welcomeContentWidth({ COLUMNS: "80" }, {}), 51);
  assert.equal(welcomeContentWidth({ COLUMNS: "10" }, {}), 12);
  assert.equal(welcomeContentWidth({ COLUMNS: "80" }, { columns: 40 }), 34);
  assert.equal(welcomeContentWidth({ COLUMNS: "invalid" }, {}), 51);
  assert.equal(welcomeContentWidth({ COLUMNS: "-1" }, {}), 51);
});

test("welcome marker path resolves below Git's common directory", () => {
  const cwd = path.join(path.sep, "tmp", "linked-worktree");
  let invocation;
  const markerPath = welcomeMarkerPath(cwd, { TEST_ENV: "yes" }, (...args) => {
    invocation = args;
    return { error: null, status: 0, stdout: "../shared.git\n" };
  });

  assert.deepEqual(invocation, [
    "git",
    ["rev-parse", "--git-common-dir"],
    { cwd, env: { TEST_ENV: "yes" } },
  ]);
  assert.equal(
    markerPath,
    path.join(
      path.resolve(cwd, "../shared.git"),
      WELCOME_MARKER_DIRECTORY,
      WELCOME_MARKER_NAME,
    ),
  );

  assert.equal(
    welcomeMarkerPath(cwd, {}, () => ({
      error: new Error("missing git"),
      status: null,
    })),
    null,
  );
  assert.equal(
    welcomeMarkerPath(cwd, {}, () => ({
      error: null,
      status: 1,
      stdout: ".git\n",
    })),
    null,
  );
  assert.equal(
    welcomeMarkerPath(cwd, {}, () => ({
      error: null,
      status: 0,
      stdout: undefined,
    })),
    null,
  );
});

test("welcome marker inspection distinguishes absence from failures", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "welcome-marker-"));
  const markerPath = path.join(dir, "nested", WELCOME_MARKER_NAME);

  try {
    assert.equal(inspectWelcomeMarker(markerPath), "absent");
    assert.equal(writeWelcomeMarker(markerPath), true);
    assert.equal(inspectWelcomeMarker(markerPath), "present");
    assert.equal(fs.readFileSync(markerPath, "utf8"), "welcome-v1\n");
    assert.equal(writeWelcomeMarker(markerPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(
    inspectWelcomeMarker("ignored", {
      lstatSync() {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    }),
    "unavailable",
  );
  assert.equal(
    inspectWelcomeMarker("ignored", {
      lstatSync() {
        throw null;
      },
    }),
    "unavailable",
  );
});

test("welcome skips JSON and explicit opt-out before touching Git", () => {
  let gitCalls = 0;
  const gitRun = () => {
    gitCalls += 1;
    return { error: null, status: 0, stdout: ".git\n" };
  };

  assert.equal(showWelcomeOnFirstCommit({ jsonMode: true, gitRun }), false);
  assert.equal(
    showWelcomeOnFirstCommit({
      config: { showWelcomeOnFirstCommit: false },
      gitRun,
    }),
    false,
  );
  assert.equal(gitCalls, 0);
});

test("welcome marker and rendering failures always fail open", () => {
  let renders = 0;
  assert.equal(
    showWelcomeOnFirstCommit({
      gitRun: () => ({ error: null, status: 1, stdout: "" }),
      render: () => {
        renders += 1;
      },
    }),
    false,
  );
  assert.equal(renders, 0);

  const gitRun = () => ({ error: null, status: 0, stdout: ".git\n" });
  assert.equal(
    showWelcomeOnFirstCommit({
      cwd: path.join(path.sep, "tmp", "welcome-test"),
      gitRun,
      fileSystem: {
        lstatSync() {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        },
      },
      render: () => {
        renders += 1;
      },
    }),
    false,
  );
  assert.equal(renders, 0);

  assert.equal(
    showWelcomeOnFirstCommit({
      cwd: path.join(path.sep, "tmp", "welcome-test"),
      gitRun,
      fileSystem: { lstatSync() {} },
      render: () => {
        renders += 1;
      },
    }),
    false,
  );
  assert.equal(renders, 0);

  const absentFileSystem = {
    lstatSync() {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    mkdirSync() {},
    writeFileSync() {
      throw Object.assign(new Error("read only"), { code: "EACCES" });
    },
  };
  assert.equal(
    showWelcomeOnFirstCommit({
      cwd: path.join(path.sep, "tmp", "welcome-test"),
      gitRun,
      fileSystem: absentFileSystem,
      stream: { columns: 40 },
      render: () => {
        renders += 1;
      },
    }),
    true,
  );
  assert.equal(renders, 1);

  assert.equal(
    showWelcomeOnFirstCommit({
      cwd: path.join(path.sep, "tmp", "welcome-test"),
      gitRun,
      fileSystem: absentFileSystem,
      render: () => {
        throw new Error("output unavailable");
      },
    }),
    false,
  );
});

test("absent configuration shows the welcome once and creates the marker", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));

  const markerPath = realWelcomeMarkerPath(tempDir);
  const first = runHook(tempDir);
  const second = runHook(tempDir);
  const firstOutput = stripAnsi(combinedOutput(first));

  assert.equal(first.status, 0);
  assert.equal(countTerminalBoxes(firstOutput), 1);
  assert.match(firstOutput, /Commitment Issues is active here\./);
  assert.match(firstOutput, /\(O,O\) {2}<3/);
  assert.match(
    firstOutput,
    /Verify or repair the hooks anytime: (?:npm|pnpm|yarn|bun) run doctor/,
  );
  assert.equal(fs.existsSync(markerPath), true);
  assert.equal(second.status, 0);
  assert.equal(combinedOutput(second).trim(), "");
});

test("a first-run finding takes priority without creating a second box", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));
  setPrecommitConfig(
    tempDir,
    { hookOutput: "normal", protectedBranches: [] },
    { suppressWelcome: false },
  );

  const markerPath = realWelcomeMarkerPath(tempDir);
  writeFile(path.join(tempDir, "src", "messy.json"), '{"alpha":1}\n');
  assert.equal(run("git", ["add", "src/messy.json"], tempDir).status, 0);

  const finding = runHook(tempDir);
  const findingOutput = stripAnsi(combinedOutput(finding));

  assert.equal(finding.status, 0);
  assert.equal(countTerminalBoxes(findingOutput), 1);
  assert.match(findingOutput, /Pre-commit suggestions found/);
  assert.doesNotMatch(findingOutput, /Commitment Issues is active here/);
  assert.equal(fs.existsSync(markerPath), false);

  writeFile(path.join(tempDir, "src", "messy.json"), '{ "alpha": 1 }\n');
  assert.equal(run("git", ["add", "src/messy.json"], tempDir).status, 0);
  const clean = runHook(tempDir);
  const cleanOutput = stripAnsi(combinedOutput(clean));

  assert.equal(clean.status, 0);
  assert.equal(countTerminalBoxes(cleanOutput), 1);
  assert.match(cleanOutput, /Commitment Issues is active here/);
  assert.equal(fs.existsSync(markerPath), true);
});

test("explicit opt-out shows no welcome and creates no marker", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const result = runHook(tempDir);

  assert.equal(result.status, 0);
  assert.equal(combinedOutput(result).trim(), "");
  assert.equal(fs.existsSync(realWelcomeMarkerPath(tempDir)), false);
});

test("JSON mode neither displays nor consumes the welcome", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));

  const markerPath = realWelcomeMarkerPath(tempDir);
  const jsonResult = runHook(tempDir, ["--json"]);

  assert.equal(jsonResult.status, 0);
  assert.doesNotThrow(() => JSON.parse(jsonResult.stdout));
  assert.doesNotMatch(jsonResult.stdout, /Commitment Issues is active here/);
  assert.equal(fs.existsSync(markerPath), false);

  const humanResult = runHook(tempDir);
  assert.equal(humanResult.status, 0);
  assert.match(combinedOutput(humanResult), /Commitment Issues is active here/);
  assert.equal(fs.existsSync(markerPath), true);
});

test("Commit Owl welcome remains readable in a narrow terminal", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));
  const env = { ...process.env, COLUMNS: "24", NO_COLOR: "1" };
  delete env.FORCE_COLOR;

  const result = runHook(tempDir, [], { env });
  const output = stripAnsi(combinedOutput(result)).trim();
  const compact = compactTerminalBoxText(output).replace(/\s/g, "");

  assert.equal(result.status, 0);
  assert.equal(countTerminalBoxes(output), 1);
  assert.ok(output.split(/\r?\n/).every((line) => line.length <= 24));
  for (const expected of [
    ",_,",
    "(O,O)<3",
    '-"-"-',
    "CommitmentIssuesisactivehere.",
    "Verifyorrepairthehooksanytime:",
    "rundoctor",
  ]) {
    assert.ok(compact.includes(expected.replace(/\s/g, "")), expected);
  }
});

test("linked worktrees share the once-per-clone welcome marker", (t) => {
  const primary = createTempRepo({ suppressWelcome: false });
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), "welcome-worktree-"));
  fs.rmSync(linked, { recursive: true, force: true });
  t.after(() => {
    run("git", ["worktree", "remove", "--force", linked], primary);
    fs.rmSync(linked, { recursive: true, force: true });
    cleanupTempRepo(primary);
  });

  const addResult = run(
    "git",
    ["worktree", "add", "--detach", linked, "HEAD"],
    primary,
  );
  assert.equal(addResult.status, 0, addResult.stderr);

  const fromLinked = runHook(linked);
  const fromPrimary = runHook(primary);

  assert.equal(fromLinked.status, 0);
  assert.match(combinedOutput(fromLinked), /Commitment Issues is active here/);
  assert.equal(fs.existsSync(realWelcomeMarkerPath(primary)), true);
  assert.equal(fromPrimary.status, 0);
  assert.equal(combinedOutput(fromPrimary).trim(), "");
});

test("a failed common-directory probe never blocks normal checks", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));

  const result = runHook(tempDir, [], {
    env: fakeGitEnv(tempDir, "rev-parse --git-common-dir"),
  });

  assert.equal(result.status, 0);
  assert.doesNotMatch(
    combinedOutput(result),
    /Commitment Issues is active here/,
  );
  assert.equal(fs.existsSync(realWelcomeMarkerPath(tempDir)), false);
});

test("Git bypass and hook skip variables do not consume the welcome", (t) => {
  const tempDir = createTempRepo({ suppressWelcome: false });
  t.after(() => cleanupTempRepo(tempDir));
  const markerPath = realWelcomeMarkerPath(tempDir);
  const hookPath = path.join(
    path.dirname(path.dirname(markerPath)),
    "hooks",
    "pre-commit",
  );
  writeFile(hookPath, hookBody("pre-commit"));
  fs.chmodSync(hookPath, 0o755);

  const normalHookEnvironment = withoutGitLocalEnvironment(process.env);
  delete normalHookEnvironment.HUSKY;
  delete normalHookEnvironment.COMMITMENT_ISSUES;

  const commit = (label, { args = [], env = normalHookEnvironment } = {}) => {
    writeFile(path.join(tempDir, "welcome-bypass.txt"), `${label}\n`);
    assert.equal(run("git", ["add", "welcome-bypass.txt"], tempDir).status, 0);
    return spawnSync("git", ["commit", ...args, "-m", label], {
      cwd: tempDir,
      encoding: "utf8",
      env: withoutGitLocalEnvironment(env),
    });
  };

  const noVerify = commit("no verify", { args: ["--no-verify"] });
  assert.equal(noVerify.status, 0, combinedOutput(noVerify));
  assert.equal(fs.existsSync(markerPath), false);

  const commitmentIssuesSkip = commit("skip modern variable", {
    env: { ...normalHookEnvironment, COMMITMENT_ISSUES: "0" },
  });
  assert.equal(
    commitmentIssuesSkip.status,
    0,
    combinedOutput(commitmentIssuesSkip),
  );
  assert.equal(fs.existsSync(markerPath), false);

  const huskySkip = commit("skip legacy variable", {
    env: { ...normalHookEnvironment, HUSKY: "0" },
  });
  assert.equal(huskySkip.status, 0, combinedOutput(huskySkip));
  assert.equal(fs.existsSync(markerPath), false);

  const normal = commit("normal hook");
  assert.equal(normal.status, 0, combinedOutput(normal));
  assert.match(combinedOutput(normal), /Commitment Issues is active here/);
  assert.equal(fs.existsSync(markerPath), true);
});
