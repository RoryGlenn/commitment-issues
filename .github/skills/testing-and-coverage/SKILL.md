---
name: testing-and-coverage
description: "How to write, run, and debug tests for commitment-issues (node:test + node:assert/strict, no external runner). USE WHEN: adding or fixing tests; a test fails only in CI; coverage attribution looks wrong or drops; working with temp git repos, subprocess entry-script tests, COMMITMENT_ISSUES=0/HUSKY=0, or node:coverage-ignore comments. Explains the subprocess-coverage-via-symlink model, the hook-skip hermetic-env trap, the temp-repo helpers (fakeGitEnv/recordingGitEnv/addBareRemote), and how to inspect lcov branch gaps."
---

# Testing & Coverage

This package uses the built-in Node test runner only — `node:test` + `node:assert/strict`. There is **no** Jest/Mocha/Vitest, no build step, and no transpile. Tests live in `test/*.test.mjs`; shared helpers live in [`test/helpers/temp-repo.mjs`](../../../test/helpers/temp-repo.mjs). The one extra test library is `fast-check`, powering the property-based tests in `test/property.test.js` — that file is deliberately **`.js`, not `.mjs`** (still ESM via `"type": "module"`): the OpenSSF Scorecard fuzzing check only scans `*.js`/`*.jsx` for the fast-check import, so renaming it to `.mjs` silently zeroes the Fuzzing score.

## Commands

| Goal                          | Command                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| Run everything                | `npm test` (= `node --test test/*.test.mjs test/*.test.js`)         |
| Run one file                  | `node --test test/precommit.test.mjs`                               |
| Runtime coverage gate         | `npm run test:coverage` (100% lines, branches, and functions)       |
| Reproduce CI locally          | prefix any test command with `COMMITMENT_ISSUES=0` (see trap below) |
| Package lifecycle integration | `npm run test:lifecycle:npm` (also `:pnpm`, `:yarn`, `:bun`)        |
| Shell compatibility lifecycle | `npm run test:shell-compat -- sh` (also platform-native targets)    |

## The two kinds of code, and how each is tested

1. **Helper modules** (`scripts/lib/*.mjs`) are pure and side-effect-light. **Unit-test them in-process** with a direct `import`. Easy to cover.
2. **Entry scripts** (`cli`, `init`, `doctor`, `precommit`, `prepush`, `commit-msg`, `commit-fix`, `fix-staged`, `fix-staged-js`, `ci-lifecycle-smoke`) run top-level code and call `process.exit`. They **cannot** be imported cleanly, so they are tested by **spawning a subprocess** inside a temporary git repo via the helpers. Assert on `result.stdout`, `result.stderr`, and `result.status`.

Typical subprocess test shape:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  createTempRepo,
  cleanupTempRepo,
  run,
  writeFile,
} from "./helpers/temp-repo.mjs";

test("describes the behavior", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  writeFile(path.join(tempDir, "src", "mixed.js"), "const value=1\n");
  run("git", ["add", "src/mixed.js"], tempDir);

  const result = run(
    "node",
    [path.join(tempDir, "scripts", "precommit.mjs")],
    tempDir,
  );
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /npm run commit:fix/);
});
```

## CRITICAL: two invariants that silently break the suite if violated

### 1. Subprocess coverage relies on **symlinks**, not copies

`createTempRepo()` **symlinks** `scripts/` and `node_modules/` from the temp repo back to the real repo root, and gitignores both (`.gitignore` = `node_modules/\nscripts/\n`). Node attributes V8 coverage to a module's **realpath** and propagates it to subprocesses via `NODE_V8_COVERAGE`. The symlink is what lets subprocess runs count toward the real `scripts/*.mjs` files in the coverage report.

**Do NOT change these symlinks back to `fs.cpSync`/copies.** A copy attributes coverage to the ephemeral temp path, so real entry-script coverage silently drops to ~0.

### 2. Hook-skip env vars must be stripped from subprocess env (the CI trap)

CI (`.github/workflows/ci.yml`) sets job-level `COMMITMENT_ISSUES=0`, and the generated `.git/hooks` bodies honor both `COMMITMENT_ISSUES=0` and the legacy `HUSKY=0` as "skip this hook". If either leaks into the test subprocess, every test that relies on a wired hook actually firing goes green-but-vacuous or breaks — **in CI only**, which is confusing.

The fix already lives in `run()` inside the helper: it deletes `HUSKY` and `COMMITMENT_ISSUES` from the subprocess env (inherited or caller-provided) so tests are hermetic. **Keep it.** Always reproduce CI failures locally with `COMMITMENT_ISSUES=0 npm test` before assuming a test is flaky.

## Helpers available from `test/helpers/temp-repo.mjs`

| Helper                                    | Purpose                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createTempRepo({ commit = true })`       | Fresh temp git repo, symlinked scripts + node_modules, repo's real `package.json`/`eslint.config.js`/`README.md`. Drops the repo's own `precommitChecks.tone` so tests assert default wording. Pass `{ commit: false }` for an uncommitted tree. |
| `cleanupTempRepo(dir)`                    | Remove the temp repo. Always register with `t.after(...)`.                                                                                                                                                                                       |
| `run(cmd, args, cwd, options?)`           | `spawnSync` wrapper that strips `HUSKY` and `COMMITMENT_ISSUES` from env. Use for both git and node subprocess calls.                                                                                                                            |
| `writeFile` / `readFile` / `readHeadFile` | Write a file (mkdir -p), read a worktree file, read a path at `HEAD`.                                                                                                                                                                            |
| `setPrecommitConfig(dir, obj)`            | Overwrite the temp repo's `precommitChecks` block (tone, timeoutMs, blockPushOnTestFailure, testExempt, runStagedTests, …).                                                                                                                      |
| `addBareRemote(dir)`                      | Add a bare `origin` + `main` upstream so `@{u}` diffs have a target (needed for prepush tests).                                                                                                                                                  |
| `fakeGitEnv(dir, substr, exitCode = 1)`   | Env whose `git` exits `exitCode` when argv contains `substr` (0 = silent no-op), else delegates to `REAL_GIT`. Exercises "git command failed" defensive branches without corrupting a repo.                                                      |
| `recordingGitEnv(dir, logPath)`           | Env whose `git` appends each argv line to `logPath` then delegates — assert exactly how a script called git (e.g. that it forced `core.quotePath=false`).                                                                                        |
| `REAL_GIT`, `repoRoot`                    | The real git path captured before any PATH override, and the repo root.                                                                                                                                                                          |

All shim helpers are cross-platform (POSIX launcher + `.cmd`), so keep tests free of shell-specific and hard-coded-separator assumptions — CI runs on Ubuntu, macOS, and Windows.

## Shell compatibility lifecycle

`npm run test:shell-compat -- <target>` exercises the exact packed artifact through install, init, advisory commit, push to a local bare remote, doctor, and uninstall. Supported targets are `sh`, `bash`, `fish`, `zsh`, `powershell`, and `cmd`; each target must run on its native platform. CI owns the authoritative matrix across Linux, macOS, and Windows. Use `SHELL_COMPAT_TARBALL=/absolute/path/to/package.tgz` to reuse a previously packed candidate while debugging locally.

The scenario deliberately constrains `PATH` for Git-hook invocations and uses paths containing spaces, Unicode, and shell metacharacters. Do not replace the argument-array process spawning with `shell: true`, interpolate fixture paths into shell source, or introduce registry/network access into the consumer install.

## Driving specific branches (patterns that already exist here)

- **Timeout branches**: `setPrecommitConfig(dir, { ...cfg, timeoutMs: 1 })` makes `spawnAsync`'s timer kill tools (SIGTERM), covering the process timer + the eslint/prettier "timed out" paths.
- **Tool failure branches**: a broken `eslint.config.js` (throws) → "ESLint failed to complete"; malformed staged JSON → "Prettier failed to complete"; a `prefer-const` `let` → an auto-fixable ESLint issue.
- **Missing-tool advisory** (doctor): create a temp repo, run doctor once to establish healthy wiring, then unlink the `node_modules` symlink and `mkdir` an empty dir so tools become unresolvable while wiring already exists on disk (no repair/npx/network). See the `hideNodeModules()` pattern in `test/doctor.test.mjs`.
- **Plural wording / no-args / parse-error / already-clean** edge cases exist to close branch gaps — mirror them when adding new user-facing strings.

## Inspecting coverage gaps

Coverage is gated at 100% for lines, branches, and functions. The exact
runtime/test scope and maintenance-only exclusions are documented in
`docs/branch-coverage.md`. To see _which_ branches are uncovered, emit lcov and
inspect the branch-data lines:

```bash
npm run test:coverage
node --test --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=/tmp/cov.info \
  test/*.test.mjs test/*.test.js
grep -E ",-$|,0$" /tmp/cov.info   # BRDA lines ending in ,- (never taken) or ,0 (taken 0x)
```

### Handling genuinely unreachable defensive code

Prefer a behavior test with an injected dependency or platform seam. If a
branch's invariant makes it impossible, simplify the dead fallback. Only when a
defensive path must remain and cannot be triggered on either supported Node line
may it use a narrowly scoped, explained **block comment** (`ignore next` does
**not** work in Node 22+):

```js
/* node:coverage disable */
try {
  // unreachable defensive path
} catch {
  // ...
}
/* node:coverage enable */
```

Wrap only the smallest complete construct that is genuinely unreachable; for a
`try/catch`, that means the whole statement because wrapping only the catch body
leaves the braces uncovered. Never add blanket file exclusions or ignores to
reachable code just to satisfy the gate.

## Pre-flight before you push

```bash
npm test
npm run lint
npm run format:check   # `npm run format` to fix
```

Add or update a test for every behavior change (bug fixes get a regression test), keep changes cross-platform, and update `docs/` + the `## [Unreleased]` section of `CHANGELOG.md` when behavior is user-visible.
