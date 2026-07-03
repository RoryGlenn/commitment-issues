import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cleanupTempRepo,
  createTempRepo,
  fakeGitEnv,
  readFile,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";

function runHook(tempDir, options = {}) {
  return run(
    "node",
    [path.join(tempDir, "scripts", "precommit.mjs")],
    tempDir,
    options,
  );
}

test("shows commit:fix for fully auto-fixable warnings", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "format-only.json"), '{"alpha":1}\n');
  run("git", ["add", "src/format-only.json"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /npm run commit:fix/);
  assert.doesNotMatch(output, /still need your attention/);
});

test("shows commit:fix and manual warning note for mixed safe warnings", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "mixed.js"), "const value=1\n");
  run("git", ["add", "src/mixed.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /npm run commit:fix/);
  assert.match(output, /Manual items above still need your attention\./);
});

test("suppresses commit:fix when tracked worktree changes would block amend", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "README.md"), "dirty\n");
  writeFile(path.join(tempDir, "src", "format-only.json"), '{"alpha":1}\n');
  run("git", ["add", "src/format-only.json"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /npm run commit:fix/);
  assert.match(
    output,
    /Other tracked changes will still be present after commit/,
  );
});

test("labels non-fixable ESLint issues as manual and omits commit:fix", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Prettier-clean file whose only problem is an unfixable no-unused-vars error.
  writeFile(
    path.join(tempDir, "src", "manual.js"),
    "const unusedValue = 123;\n",
  );
  run("git", ["add", "src/manual.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /ESLint issue needing manual fixes/);
  assert.match(output, /manual\.js.*no-unused-vars/);
  assert.doesNotMatch(output, /npm run commit:fix/);
});

test("does not flag files that live inside a test directory", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "test", "helpers", "util.mjs"),
    "export const u = 1;\n",
  );
  run("git", ["add", "test/helpers/util.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("does not flag source files that have a matching test in test/", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "src", "widget.mjs"),
    "export const widget = () => 1;\n",
  );
  writeFile(path.join(tempDir, "test", "widget.test.mjs"), "export {};\n");
  run("git", ["add", "src/widget.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("requireTests:false disables the missing-test check", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = { requireTests: false };
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  writeFile(path.join(tempDir, "src", "widget.mjs"), "export const w = 1;\n");
  run("git", ["add", "src/widget.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("treats staged TypeScript files as lintable code files", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // JS-compatible TS so the default parser lints it without typescript-eslint.
  writeFile(path.join(tempDir, "src", "thing.ts"), "const unused = 1;\n");
  run("git", ["add", "src/thing.ts"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /ESLint issue needing manual fixes/);
  assert.match(output, /missing unit tests/);
});

test("finds a matching .test.ts for a TypeScript source", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "thing.ts"), "export const thing = 1;\n");
  writeFile(path.join(tempDir, "test", "thing.test.ts"), "export {};\n");
  run("git", ["add", "src/thing.ts"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("does not flag .d.ts declaration files for missing tests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "types.d.ts"), "export {};\n");
  run("git", ["add", "src/types.d.ts"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("handles a mixed JS and TS commit together", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "a.js"), "export const a = 1;\n");
  writeFile(path.join(tempDir, "src", "b.ts"), "export const b = 1;\n");
  run("git", ["add", "src/a.js", "src/b.ts"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /2 staged source files missing unit tests/);
  assert.match(output, /src\/a\.js/);
  assert.match(output, /src\/b\.ts/);
});

test("does not flag config files for missing tests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "app.config.js"), "export default {};\n");
  run("git", ["add", "app.config.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("does not flag Storybook story files for missing tests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "src", "Button.stories.js"),
    "export default {};\n",
  );
  run("git", ["add", "src/Button.stories.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("does not flag generated files for missing tests", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(
    path.join(tempDir, "src", "api.generated.ts"),
    "export const api = 1;\n",
  );
  writeFile(
    path.join(tempDir, "src", "generated", "schema.ts"),
    "export const schema = 1;\n",
  );
  run(
    "git",
    ["add", "src/api.generated.ts", "src/generated/schema.ts"],
    tempDir,
  );

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("honors package.json precommitChecks.testExempt globs", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = { testExempt: ["src/legacy/**"] };
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );

  writeFile(
    path.join(tempDir, "src", "legacy", "old.js"),
    "export const old = 1;\n",
  );
  run("git", ["add", "src/legacy/old.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /missing unit tests/);
});

test("shows an info message when nothing is staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // Clean working tree, nothing staged.
  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /No staged files to check\./);
  assert.doesNotMatch(output, /All pre-commit checks passed/);
});

test("shows info when only non-checkable files are staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "assets", "logo.png"), "not really binary\n");
  run("git", ["add", "assets/logo.png"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /No lintable or formattable files staged\./);
  assert.doesNotMatch(output, /All pre-commit checks passed/);
});

test("distinguishes a deletion-only commit from nothing staged", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  run("git", ["rm", "README.md"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /Deletion-only commit/);
  assert.doesNotMatch(output, /Stage changes with git add/);
});

test("runs staged tests and warns when they fail (opt-in)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = { runStagedTests: true };
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );

  writeFile(
    path.join(tempDir, "test", "thing.test.mjs"),
    'import test from "node:test";\n' +
      'import assert from "node:assert/strict";\n' +
      'test("fails", () => assert.equal(1, 2));\n',
  );
  run("git", ["add", "test/thing.test.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /staged test file.*failing/);
});

test("runs staged tests and stays clean when they pass (opt-in)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = { runStagedTests: true };
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );

  writeFile(
    path.join(tempDir, "test", "thing.test.mjs"),
    'import test from "node:test";\ntest("passes", () => {});\n',
  );
  run("git", ["add", "test/thing.test.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, /failing/);
});

test("continues (exit 0) when staged files cannot be inspected", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "x.js"), "export const x = 1;\n");
  run("git", ["add", "src/x.js"], tempDir);

  const env = fakeGitEnv(tempDir, "--diff-filter=ACMRT");
  const result = runHook(tempDir, { env });
  const output = `${result.stdout}${result.stderr}`;

  // Advisory: it never blocks, even when git is unavailable.
  assert.equal(result.status, 0);
  assert.match(output, /Unable to inspect staged files\./);
});

test("reports a timeout when tools exceed the configured limit", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // A 1ms ceiling forces ESLint and Prettier to be killed before they finish.
  setPrecommitConfig(tempDir, { requireTests: false, timeoutMs: 1 });
  writeFile(path.join(tempDir, "src", "slow.js"), "export const x=1;\n");
  run("git", ["add", "src/slow.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /timed out/);
});

test("reports when ESLint cannot complete (broken config)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  // An eslint config that throws makes ESLint exit >1 with no JSON results.
  writeFile(
    path.join(tempDir, "eslint.config.js"),
    "throw new Error('broken config');\n",
  );
  setPrecommitConfig(tempDir, { requireTests: false });
  writeFile(path.join(tempDir, "src", "x.js"), "export const x = 1;\n");
  run("git", ["add", "src/x.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /ESLint failed to complete/);
});

test("reports when staged tests cannot run (bad testCommand)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, {
    runStagedTests: true,
    testCommand: ["definitely-not-a-real-binary-xyz"],
  });
  writeFile(
    path.join(tempDir, "test", "thing.test.mjs"),
    'import test from "node:test";\ntest("passes", () => {});\n',
  );
  run("git", ["add", "test/thing.test.mjs"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /Unable to run staged tests/);
});

test("flags auto-fixable ESLint issues (prefer-const)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { requireTests: false });
  // `let` that is never reassigned trips the auto-fixable prefer-const rule.
  writeFile(
    path.join(tempDir, "src", "fixable.js"),
    "let x = 1;\nexport { x };\n",
  );
  run("git", ["add", "src/fixable.js"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /auto-fixable ESLint issue/);
});

test("reports when Prettier cannot complete (unparseable file)", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { requireTests: false });
  // Malformed JSON is a format-only file Prettier cannot parse (exit > 1).
  writeFile(path.join(tempDir, "src", "bad.json"), '{"a":}\n');
  run("git", ["add", "src/bad.json"], tempDir);

  const result = runHook(tempDir);
  const output = `${result.stdout}${result.stderr}`;

  assert.match(output, /Prettier failed to complete/);
});
