# Commitment Issues

[![CI](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml/badge.svg)](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/commitment-issues.svg)](https://www.npmjs.com/package/commitment-issues)
[![Node >=22.22.1](https://img.shields.io/badge/node-%3E%3D22.22.1-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Advisory-first pre-commit and pre-push checks for JavaScript and TypeScript projects using Husky, lint-staged, ESLint, and Prettier.

The default flow gives lightweight feedback before commits and advisory test feedback before pushes. Stricter blocking behavior can be enabled through configuration.

**Advisory by default:** the hooks report issues without discarding unstaged work, rewriting already-pushed history, or blocking pushes. Blocking behavior is opt-in.

## Why the name?

Because sometimes your code has commitment issues.

`commitment-issues` points out the things future-you may regret: lint problems, formatting drift, missing tests, and other small signs that the relationship may need work.

It nudges first. It can enforce when configured. It keeps the choice explicit.

> `commitment-issues` starts as a friendly warning system.
>
> It tells you what looks risky before you share the work, while leaving enforcement as a deliberate configuration choice.

## What it looks like

`commitment-issues` prints compact terminal boxes so commit and push feedback is visible without being noisy.

**Pre-commit suggestions**

<p>
  <img src="assets/precommit-suggestions-warning.svg" alt="Pre-commit warning output showing formatting suggestions and the commit fix command" width="476">
</p>

**Safe automatic amend**

<p>
  <img src="assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="555">
</p>

**Safety refusal**

<p>
  <img src="assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="620">
</p>

**Pre-push test summary**

<p>
  <img src="assets/prepush-success.svg" alt="Success output showing all pushed-file tests passed and push was allowed" width="294">
</p>

In default advisory mode, your commit still goes through. The tool gives future-you a heads up.

The boxes are intentionally advisory-first: they explain what happened, what is safe to do next, and when the tool refuses to mutate risky work.

## What it catches

| Check                | What happens                                       |
| -------------------- | -------------------------------------------------- |
| Lint issues          | Reports issues during commit                       |
| Formatting drift     | Reports issues and suggests a safe fix             |
| Missing tests        | Points out code without nearby tests               |
| Failing staged tests | Optional commit-time warning or enforcement        |
| Failing push tests   | Advisory warning by default; optional push blocker |
| Broken hook wiring   | `doctor` can repair it                             |

## Requirements

- **Node.js >= 22.22.1** — the scripts use modern ESM features and the built-in `node --test` runner.
- Peer tools in your project: `husky`, `lint-staged`, `eslint`, and `prettier`.
- An ESLint flat config, usually `eslint.config.js`.
- For TypeScript, a TypeScript-aware ESLint config.

## Quickstart

Use this when you want the shortest path from install to the first checked commit.

Want to see the common output states first? See [Message states](docs/message-states.md).

### 1. Install

Install `commitment-issues` with the peer tools it runs:

```bash
npm install -D commitment-issues husky lint-staged eslint prettier
```

### 2. Initialize

Run the setup command:

```bash
npx commitment-issues init
```

This wires the Git hooks, adds helper npm scripts, adds the `lint-staged` config, enables advisory push tests, activates Husky, and ignores the local ESLint/Prettier cache files.

The command is idempotent, so it is safe to re-run.

### 3. Make a commit

Stage your work and commit normally:

```bash
git add -A
git commit -m "your message"
```

By default, commit-time checks are advisory. They report issues, but the commit continues.

### 4. Fix staged files when needed

When the hook reports auto-fixable lint or formatting issues before committing, run:

```bash
npm run fix:staged
```

Then stage the updated files and commit again.

### 5. Fix the latest commit when safe

When the hook suggests amending the latest commit, run:

```bash
npm run commit:fix
```

This only runs when the working tree is safe enough to amend.

### 6. Push behavior

After `init`, push-time tests run in advisory mode. They warn when associated pushed-file tests fail, but the push continues.

To make pushed-file test failures block the push, set:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true
  }
}
```

If `blockPushOnTestFailure` and `advisePushTests` are both set, blocking takes precedence.

## What `init` changes

`npx commitment-issues init` updates the consuming repo so the installed package can run from Git hooks:

- wires the pre-commit hook to `commitment-issues precommit`
- wires the pre-push hook to `commitment-issues prepush`
- adds npm scripts for `doctor`, `fix:staged`, `commit:fix`, and direct pre-commit checks
- adds a `lint-staged` config for JavaScript, TypeScript, and common formatted files
- enables advisory push tests through `precommitChecks.advisePushTests`
- activates Husky
- gitignores `.eslintcache` and `.prettiercache`

Nothing is copied into your repo from the package source. The hooks call the installed `commitment-issues` bin.

## What happens on commit and push?

| Action       | Default behavior                                        | Stricter option                                                |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| `git commit` | Reports lint, formatting, missing-test, and test issues | Enable `runStagedTests` to run staged-related tests            |
| `git push`   | Runs pushed-file tests in advisory mode after `init`    | Enable `blockPushOnTestFailure` to stop pushes on test failure |

## Project structure

- `scripts/cli.mjs` — the `commitment-issues` bin; dispatches subcommands: `init`, `doctor`, `precommit`, `prepush`, `commit-fix`, `fix-staged`, and `fix-staged-js`.
- `scripts/precommit.mjs` — the pre-commit hook entrypoint.
- `scripts/init.mjs` — one-command setup for a consuming repo.
- `scripts/prepush.mjs` — the advisory-by-default pre-push test runner; can become a blocking gate through configuration.
- `scripts/doctor.mjs` — verifies and repairs the hook wiring.
- `scripts/fix-staged.mjs` — runs lint-staged on staged files.
- `scripts/fix-staged-js.mjs` — lint-staged task: ESLint fix followed by Prettier write.
- `scripts/commit-fix.mjs` — applies automatic fixes to the latest clean commit and amends it in place.
- `scripts/lib/` — shared helpers for UI, spawning, file heuristics, output parsing, advisory messages, and config loading.

## Active flow

- The pre-commit hook runs `commitment-issues precommit`.
- `scripts/precommit.mjs` inspects staged files and prints one consolidated summary box.
- The pre-push hook runs `commitment-issues prepush`.
- `scripts/prepush.mjs` runs tests associated with pushed files in advisory mode by default.
- `blockPushOnTestFailure` turns pushed-file test failures into a hard gate.
- When automatic fixes can still be applied safely after a commit, the hook suggests `npm run commit:fix`.
- `npm run fix:staged` delegates staged-file fixing to `lint-staged`.
- `npm run commit:fix` applies automatic fixes to the latest clean commit and amends it in place.

## TypeScript and mixed projects

- Staged `.ts`, `.tsx`, `.mts`, `.cts`, and `.cjs` files are treated as code files alongside `.js`, `.jsx`, and `.mjs`.
- `.d.ts` declaration files are excluded from the missing-test check.
- The unit-test heuristic recognizes matching tests in the same directory, an adjacent `__tests__/`, or a top-level `test/` / `tests/` directory.
- These scripts delegate linting to your project's own ESLint config. Real TypeScript projects need a TypeScript-aware ESLint parser/config.

## Unit-test heuristics

The hook flags staged code files that have no matching test, but it skips files that do not normally need one:

- test files themselves (`*.test.*`, `*.spec.*`) and anything under `test/`, `tests/`, `__tests__/`, or `__mocks__/`
- config files (`*.config.*` and dotfile configs like `.eslintrc.cjs`)
- type declarations (`*.d.ts`, `.d.mts`, `.d.cts`)
- Storybook stories (`*.stories.*`)
- generated code (`*.generated.*`, or files under `generated/` / `__generated__/`)

A matching test is found when it sits next to the file, in an adjacent `__tests__/`, or in a top-level `test/` / `tests/` directory. For example, `src/foo.ts` is satisfied by `test/foo.test.ts`.

To exempt additional paths, add glob patterns under `precommitChecks.testExempt` in `package.json`:

```json
{
  "precommitChecks": {
    "testExempt": ["src/legacy/**", "**/*.pb.ts"]
  }
}
```

## Running staged tests (opt-in)

By default the commit hook only checks for missing tests; it does not run them. To also run the tests relevant to a commit, enable it in `package.json`:

```json
{
  "precommitChecks": {
    "runStagedTests": true,
    "testCommand": ["node", "--test"]
  }
}
```

When enabled, the hook runs `testCommand` against the staged test files plus the tests it can find for staged source files. `testCommand` is optional and defaults to `node --test`.

> Enabling `runStagedTests` executes a repo-defined command on every commit, similar to `lint-staged`. Only enable it in repositories you trust. Spawned tools are capped by a timeout so a hung command cannot wedge a commit.

### Using a different test runner

`testCommand` can be any command that accepts test file paths as arguments. Both the staged-test check and the push gate append the relevant test files to it.

**Vitest:**

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "vitest", "run"]
  }
}
```

The `run` subcommand is required. Without it, Vitest starts watch mode and the hook will hang.

**Jest:**

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "jest"]
  }
}
```

If your tests rely on a runner's globals, running them under the default `node --test` can fail with `ReferenceError: test is not defined`. Set `testCommand` to your actual runner.

## Advisory push tests (default)

`init` enables `advisePushTests` by default. On `git push`, the pre-push hook runs only the tests associated with the files being pushed: the changed test files themselves, plus any test discovered for a changed source file.

```json
{
  "precommitChecks": {
    "advisePushTests": true,
    "testCommand": ["node", "--test"]
  }
}
```

Failures show a `Tests failed (advisory)` warning box, but the push still proceeds. If the pushed files have no associated tests, the push is allowed. The runner is `testCommand`, which defaults to `node --test` and must accept test file paths as arguments.

## Blocking pushes on test failure (opt-in)

Use push-time blocking when you want a hard gate before code is shared. Enable it in `package.json`:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true,
    "testCommand": ["node", "--test"]
  }
}
```

When enabled, the same pushed-files test run blocks the push if any tests fail. If `blockPushOnTestFailure` and `advisePushTests` are both set, blocking takes precedence.

The gate is capped by a timeout.

## Configuration reference

All options live under `precommitChecks` in `package.json`; all are optional:

| Key                      | Type     | Default              | Description                                                                                          |
| ------------------------ | -------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `testExempt`             | string[] | `[]`                 | Glob patterns for files excluded from the missing-test check.                                        |
| `requireTests`           | boolean  | `true`               | Set `false` to disable the missing-test check.                                                       |
| `runStagedTests`         | boolean  | `false`              | Run tests for staged files at commit time.                                                           |
| `advisePushTests`        | boolean  | `true` after `init`  | Run the pushed files' tests at `git push` but only warn. Ignored if `blockPushOnTestFailure` is set. |
| `blockPushOnTestFailure` | boolean  | `false`              | Run the pushed files' tests at `git push` and block on failure.                                      |
| `testCommand`            | string[] | `["node", "--test"]` | Test runner used by staged tests and the push gate; must accept test file paths.                     |
| `timeoutMs`              | number   | `120000`             | Max time any spawned tool may run before it is treated as timed out.                                 |

```json
{
  "precommitChecks": {
    "testExempt": ["src/legacy/**"],
    "runStagedTests": true,
    "blockPushOnTestFailure": true,
    "testCommand": ["node", "--test"]
  }
}
```

## Message states

The hook prints one box per commit:

- **success** — staged files were checked and look clean
- **warning** — issues found; behavior depends on your configuration
- **info** — nothing to check
- **error** — the hook could not inspect Git or run a tool

See [Message states](docs/message-states.md) for a fuller gallery of common output states.

## Safety model

- Default commit-time checks report issues without mutating the working tree.
- Default push-time checks warn without blocking the push.
- `npm run fix:staged` only targets staged files.
- If a file has both staged and unstaged changes, `npm run fix:staged` refuses to run for safety.
- `npm run commit:fix` only runs when tracked staged and unstaged changes are absent, so it can safely amend the latest commit.
- If ESLint cannot fix everything automatically, available fixes are still applied and re-staged, and the command exits non-zero so the remaining issues are visible.

## Performance

The hook is tuned to stay fast even on slow machines:

- ESLint, Prettier, and opt-in staged tests run concurrently.
- Tools run directly through the project's local Node binaries, skipping `npx` resolution overhead.
- ESLint and Prettier caches speed up repeated runs.

## Continuous integration

These scripts are Git-hook tooling, so disable Husky in CI to avoid installing hooks during `npm ci`.

This project's own workflow runs `npm ci`, `npm run lint`, `npm run format:check`, and `npm test` on Node 22 and 24. Locally, `npm run test:coverage` runs the same suite with `--experimental-test-coverage` for a coverage report.

## Commands

```bash
npx commitment-issues init   # one-command setup
npm run doctor               # verify and repair hook wiring
npm run test:precommit       # run the pre-commit checks directly
npm run fix:staged           # apply staged-only ESLint/Prettier fixes
npm run commit:fix           # apply automatic fixes to the latest clean commit and amend it
```

The npm scripts above are added by `init` and call the `commitment-issues` bin. You can also invoke any subcommand directly, for example `npx commitment-issues doctor`.

## Troubleshooting

### The hooks silently stopped running

If commits and pushes suddenly skip all checks, the Husky wiring was probably knocked out by a stale checkout, a dependency reinstall that skipped `prepare`, or a cleanup that removed ignored hook support files.

`init` sets `prepare` to `commitment-issues doctor --quiet`, so every install can re-establish the wiring. In a non-git context it no-ops.

If the wiring drops without a reinstall, repair it on demand with:

```bash
npm run doctor
```

`doctor` checks hook wiring and rebuilds missing pieces without overwriting existing hooks. It is safe to run anytime; if everything is already healthy it just says so.

Also check your environment has not disabled Husky hooks.

## License

MIT — see [LICENSE](../LICENSE).
