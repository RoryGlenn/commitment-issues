// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Maintainer tool: renders representative message states LIVE in your terminal
// by driving the real entry scripts inside throwaway git repos. It complements
// the exhaustive static docs/message-states.md gallery (whose SVGs are
// hand-specified mockups). Not shipped (tools/ is outside the files allowlist).
//
//   node tools/show-message-states.mjs            # representative states
//   node tools/show-message-states.mjs secrets    # states matching "secrets"
//   node tools/show-message-states.mjs --list     # list state names
//
// Each scenario builds a fresh temp repo (test/helpers/temp-repo.mjs), sets
// up the exact staged/config situation, runs the real script, and streams
// its output. FORCE_COLOR keeps the boxes colored through the pipe; NO_COLOR
// is removed from child environments so Node does not warn about a conflict.

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import {
  addBareRemote,
  cleanupTempRepo,
  createTempRepo,
  run,
  setPrecommitConfig,
  writeFile,
} from "../test/helpers/temp-repo.mjs";

// Runtime-assembled fixture (never a joined credential in source).
const AWS_KEY = ["AKIA", "ABCDEFGH", "IJKLMNOP"].join("");

function script(tempDir, name, { input = "", env = {}, args = [] } = {}) {
  const childEnv = { ...process.env, ...env, FORCE_COLOR: "1" };
  delete childEnv.NO_COLOR;
  return run("node", [path.join(tempDir, "scripts", name), ...args], tempDir, {
    input,
    env: childEnv,
  });
}

function pushInput(tempDir, branch = "main") {
  const head = run("git", ["rev-parse", "HEAD"], tempDir).stdout.trim();
  return `refs/heads/${branch} ${head} refs/heads/${branch} ${"0".repeat(40)}\n`;
}

function commitAll(tempDir, message) {
  run("git", ["add", "-A"], tempDir);
  run("git", ["commit", "-m", message], tempDir);
}

const failingTest =
  'import test from "node:test";\n' +
  'import assert from "node:assert/strict";\n' +
  'test("widget", () => assert.equal(1, 2));\n';

const passingTest =
  'import test from "node:test";\n' +
  'import assert from "node:assert/strict";\n' +
  'import { widget } from "./widget.mjs";\n' +
  'test("widget", () => assert.equal(widget(), 1));\n';

// Every scenario gets a fresh temp repo and returns the completed run(s) to
// print. Keep each one minimal: just enough state to trigger the box.
const SCENARIOS = [
  {
    name: "precommit/all-passed",
    run(dir) {
      writeFile(path.join(dir, "src", "clean.json"), '{ "alpha": 1 }\n');
      run("git", ["add", "src/clean.json"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/prettier-fixable",
    run(dir) {
      writeFile(path.join(dir, "src", "messy.json"), '{"alpha":1}\n');
      run("git", ["add", "src/messy.json"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/manual-lint-issue",
    run(dir) {
      writeFile(path.join(dir, "src", "thing.mjs"), "const unused = 1;\n");
      writeFile(path.join(dir, "test", "thing.test.mjs"), "export {};\n");
      run("git", ["add", "src", "test"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/missing-tests",
    run(dir) {
      writeFile(path.join(dir, "src", "lonely.mjs"), "export const x = 1;\n");
      run("git", ["add", "src/lonely.mjs"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/failing-staged-tests",
    run(dir) {
      setPrecommitConfig(dir, { runStagedTests: true });
      writeFile(path.join(dir, "src", "widget.test.mjs"), failingTest);
      run("git", ["add", "src"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/no-staged-files",
    run(dir) {
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/deletion-only",
    run(dir) {
      writeFile(path.join(dir, "src", "doomed.md"), "# doomed\n");
      commitAll(dir, "add doomed");
      run("git", ["rm", "src/doomed.md"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/no-lintable-files",
    run(dir) {
      writeFile(path.join(dir, "notes.txt"), "plain text\n");
      run("git", ["add", "notes.txt"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/protected-branch-warn",
    run(dir) {
      setPrecommitConfig(dir, { protectedBranches: ["main", "master"] });
      run("git", ["branch", "-M", "main"], dir);
      writeFile(path.join(dir, "notes.txt"), "plain text\n");
      run("git", ["add", "notes.txt"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/protected-branch-block",
    expectedStatus: 1,
    run(dir) {
      setPrecommitConfig(dir, {
        protectedBranches: ["main"],
        blockProtectedBranches: true,
      });
      run("git", ["branch", "-M", "main"], dir);
      writeFile(path.join(dir, "notes.txt"), "plain text\n");
      run("git", ["add", "notes.txt"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/behind-upstream",
    run(dir) {
      const remote = addBareRemote(dir);
      const clone = fs.mkdtempSync(path.join(dir, "clone-"));
      run("git", ["clone", "-b", "main", remote, clone], dir);
      run("git", ["config", "user.name", "demo"], clone);
      run("git", ["config", "user.email", "demo@example.com"], clone);
      writeFile(path.join(clone, "remote.md"), "# remote\n");
      commitAll(clone, "remote change");
      run("git", ["push", "origin", "main"], clone);
      run("git", ["fetch", "origin"], dir);
      writeFile(path.join(dir, "notes.txt"), "plain text\n");
      run("git", ["add", "notes.txt"], dir);
      const result = script(dir, "precommit.mjs");
      fs.rmSync(remote, { recursive: true, force: true });
      return result;
    },
  },
  {
    name: "precommit/large-commit",
    run(dir) {
      setPrecommitConfig(dir, { maxCommitFiles: 2, maxCommitLines: 10 });
      for (const n of ["a", "b", "c"]) {
        writeFile(path.join(dir, "docs-batch", `${n}.txt`), "line\n".repeat(8));
      }
      run("git", ["add", "docs-batch"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/large-file",
    run(dir) {
      setPrecommitConfig(dir, { maxFileSizeMb: 1 });
      fs.writeFileSync(
        path.join(dir, "demo.bin"),
        Buffer.alloc(2 * 1024 * 1024, 1),
      );
      run("git", ["add", "demo.bin"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/generated-files",
    run(dir) {
      writeFile(path.join(dir, "dist", "bundle.notjs"), "artifact\n");
      writeFile(path.join(dir, "coverage", "index.html"), "<html></html>\n");
      run("git", ["add", "-f", "dist", "coverage"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/secrets-advisory",
    run(dir) {
      writeFile(path.join(dir, ".env"), "APP_MODE=dev\n");
      writeFile(
        path.join(dir, "src", "auth.notjs"),
        `const key = "${AWS_KEY}";\n`,
      );
      run("git", ["add", "-f", ".env", "src/auth.notjs"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/secrets-block",
    expectedStatus: 1,
    run(dir) {
      setPrecommitConfig(dir, { blockOnSecrets: true });
      writeFile(
        path.join(dir, "src", "auth.notjs"),
        `const key = "${AWS_KEY}";\n`,
      );
      run("git", ["add", "src/auth.notjs"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/fun-tone",
    run(dir) {
      setPrecommitConfig(dir, { tone: "fun" });
      writeFile(path.join(dir, "src", "messy.json"), '{"alpha":1}\n');
      writeFile(path.join(dir, "src", "lonely.mjs"), "export const x = 1;\n");
      run("git", ["add", "src"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/unknown-config-key",
    run(dir) {
      setPrecommitConfig(dir, { requireTest: false });
      writeFile(path.join(dir, "src", "clean.json"), '{ "alpha": 1 }\n');
      run("git", ["add", "src/clean.json"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "precommit/invalid-config-value",
    run(dir) {
      setPrecommitConfig(dir, { requireTests: "yes" });
      writeFile(path.join(dir, "src", "clean.json"), '{ "alpha": 1 }\n');
      run("git", ["add", "src/clean.json"], dir);
      return script(dir, "precommit.mjs");
    },
  },
  {
    name: "prepush/tests-passed",
    run(dir) {
      setPrecommitConfig(dir, { advisePushTests: true });
      writeFile(
        path.join(dir, "src", "widget.mjs"),
        "export const widget = () => 1;\n",
      );
      writeFile(path.join(dir, "src", "widget.test.mjs"), passingTest);
      commitAll(dir, "add widget");
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "prepush/advisory-failure",
    run(dir) {
      setPrecommitConfig(dir, { advisePushTests: true });
      writeFile(path.join(dir, "src", "widget.test.mjs"), failingTest);
      commitAll(dir, "add failing test");
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "prepush/blocking-failure",
    expectedStatus: 1,
    run(dir) {
      setPrecommitConfig(dir, { blockPushOnTestFailure: true });
      writeFile(path.join(dir, "src", "widget.test.mjs"), failingTest);
      commitAll(dir, "add failing test");
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "prepush/no-tests-to-run",
    run(dir) {
      setPrecommitConfig(dir, { advisePushTests: true });
      writeFile(path.join(dir, "notes.txt"), "plain\n");
      commitAll(dir, "add notes");
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "prepush/checks-disabled-interactive",
    run(dir) {
      setPrecommitConfig(dir, { protectedBranches: [] });
      return script(dir, "prepush.mjs", {
        env: { COMMITMENT_ISSUES_ASSUME_TTY: "1" },
      });
    },
  },
  {
    name: "prepush/protected-branch-warn",
    run(dir) {
      setPrecommitConfig(dir, {
        protectedBranches: ["main"],
        advisePushTests: false,
      });
      run("git", ["branch", "-M", "main"], dir);
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "prepush/protected-branch-block",
    expectedStatus: 1,
    run(dir) {
      setPrecommitConfig(dir, {
        protectedBranches: ["main"],
        blockProtectedBranches: true,
      });
      run("git", ["branch", "-M", "main"], dir);
      return script(dir, "prepush.mjs", { input: pushInput(dir) });
    },
  },
  {
    name: "doctor/wires-hooks",
    run(dir) {
      return script(dir, "doctor.mjs");
    },
  },
  {
    name: "doctor/healthy",
    run(dir) {
      script(dir, "doctor.mjs");
      return script(dir, "doctor.mjs");
    },
  },
  {
    name: "init/success",
    run(dir) {
      return script(dir, "init.mjs");
    },
  },
  {
    name: "init/already-configured",
    run(dir) {
      script(dir, "init.mjs");
      return script(dir, "init.mjs");
    },
  },
  {
    name: "uninstall/success",
    run(dir) {
      script(dir, "init.mjs");
      return script(dir, "uninstall.mjs");
    },
  },
  {
    name: "uninstall/dry-run",
    run(dir) {
      script(dir, "init.mjs");
      return script(dir, "uninstall.mjs", { args: ["--dry-run"] });
    },
  },
  {
    name: "uninstall/custom-hook-warning",
    run(dir) {
      writeFile(
        path.join(dir, ".git", "hooks", "pre-commit"),
        "echo custom check\ncommitment-issues precommit\n",
      );
      return script(dir, "uninstall.mjs");
    },
  },
  {
    name: "fix-staged/fixes-applied",
    run(dir) {
      writeFile(path.join(dir, "src", "messy.json"), '{"alpha":1}\n');
      run("git", ["add", "src/messy.json"], dir);
      return script(dir, "fix-staged.mjs");
    },
  },
  {
    name: "fix-staged/already-clean",
    run(dir) {
      writeFile(path.join(dir, "src", "clean.json"), '{ "alpha": 1 }\n');
      run("git", ["add", "src/clean.json"], dir);
      return script(dir, "fix-staged.mjs");
    },
  },
  {
    name: "commit-fix/amended",
    run(dir) {
      writeFile(path.join(dir, "src", "messy.json"), '{"alpha":1}\n');
      commitAll(dir, "add messy file");
      return script(dir, "commit-fix.mjs");
    },
  },
  {
    name: "commit-fix/already-clean",
    run(dir) {
      writeFile(path.join(dir, "src", "clean.json"), '{ "alpha": 1 }\n');
      commitAll(dir, "add clean file");
      return script(dir, "commit-fix.mjs");
    },
  },
];

function printResult(name, result, expectedStatus = 0) {
  console.log("");
  console.log(pc.bold(pc.cyan(`━━━ ${name} `.padEnd(72, "━"))));
  const output = `${result?.stdout ?? ""}${result?.stderr ?? ""}`.trimEnd();
  console.log(output.length > 0 ? output : pc.dim("(no output)"));
  console.log(pc.dim(`exit ${result?.status ?? "unknown"}`));
  if (result?.status !== expectedStatus) {
    console.log(pc.red(`expected exit ${expectedStatus}`));
  }
}

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const scenario of SCENARIOS) {
    console.log(scenario.name);
  }
  process.exit(0);
}

const filters = args.filter((arg) => !arg.startsWith("--"));
const selected = SCENARIOS.filter(
  (scenario) =>
    filters.length === 0 ||
    filters.some((filter) => scenario.name.includes(filter)),
);

if (selected.length === 0) {
  console.error(`No states match: ${filters.join(", ")} (see --list)`);
  process.exit(1);
}

console.log(
  pc.dim(
    `Rendering ${selected.length} message state${selected.length === 1 ? "" : "s"} live (throwaway repos, real hooks)…`,
  ),
);

let failed = false;
for (const scenario of selected) {
  let dir;
  try {
    dir = createTempRepo();
    const result = scenario.run(dir);
    const expectedStatus = scenario.expectedStatus ?? 0;
    printResult(scenario.name, result, expectedStatus);
    if (result?.status !== expectedStatus) failed = true;
  } catch (error) {
    failed = true;
    printResult(
      scenario.name,
      {
        stdout: "",
        stderr: `scenario error: ${error.message}`,
        status: 1,
      },
      0,
    );
  } finally {
    if (dir) cleanupTempRepo(dir);
  }
}

console.log("");
if (failed) process.exitCode = 1;
