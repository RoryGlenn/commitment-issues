# Configuration and Behavior

This page covers the deeper behavior behind `commitment-issues`: what `init` changes, how commit and push checks run, how test discovery works, and which options are available.

For the short install path, start with the [README](../README.md). For terminal output examples, see [Message states](message-states.md).

## What `init` changes

`npx commitment-issues init` updates the consuming repo so the installed package can run from Git hooks:

- wires the pre-commit hook to `commitment-issues precommit`
- wires the pre-push hook to `commitment-issues prepush`
- adds npm scripts for `doctor`, `fix:staged`, `commit:fix`, and direct pre-commit checks
- adds a `lint-staged` config for JavaScript, TypeScript, and common formatted files
- enables advisory push tests through `precommitChecks.advisePushTests`
- activates Husky
- gitignores `.eslintcache`, `.prettiercache`, and `node_modules/`

Nothing is copied into your repo from the package source. The hooks call the installed `commitment-issues` bin.

## What happens on commit and push?

| Action       | Default behavior                                        | Stricter option                                                |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| `git commit` | Reports lint, formatting, missing-test, and test issues | Enable `runStagedTests` to run staged-related tests            |
| `git push`   | Runs pushed-file tests in advisory mode after `init`    | Enable `blockPushOnTestFailure` to stop pushes on test failure |

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

## Running staged tests at commit time

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

## Advisory push tests

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

## Blocking pushes on test failure

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

| Key                      | Type                    | Default              | Description                                                                                          |
| ------------------------ | ----------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `testExempt`             | string[]                | `[]`                 | Glob patterns for files excluded from the missing-test check.                                        |
| `requireTests`           | boolean                 | `true`               | Set `false` to disable the missing-test check.                                                       |
| `runStagedTests`         | boolean                 | `false`              | Run tests for staged files at commit time.                                                           |
| `advisePushTests`        | boolean                 | `true` after `init`  | Run the pushed files' tests at `git push` but only warn. Ignored if `blockPushOnTestFailure` is set. |
| `blockPushOnTestFailure` | boolean                 | `false`              | Run the pushed files' tests at `git push` and block on failure.                                      |
| `testCommand`            | string[]                | `["node", "--test"]` | Test runner used by staged tests and the push gate; must accept test file paths.                     |
| `timeoutMs`              | number                  | `120000`             | Max time any spawned tool may run before it is treated as timed out.                                 |
| `tone`                   | `"standard"` or `"fun"` | `"standard"`         | Output tone for advisory pre-commit messages.                                                        |

Unrecognized `precommitChecks` keys are ignored, and the pre-commit and pre-push hooks print a one-line warning naming them — so a typo like `requireTest` cannot silently disable the behavior you meant to configure.

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

## Continuous integration

These scripts are Git-hook tooling, so disable Husky in CI to avoid installing hooks during `npm ci`.

This project's own workflow runs `npm ci`, `npm run lint`, `npm run format:check`, and `npm test` on Node 22.22.1 and 24. Locally, `npm run test:coverage` runs the same suite with `--experimental-test-coverage` for a coverage report.

For ready-to-use pipelines that disable Husky, see the [CI provider recipes](ci-recipes.md) for GitHub Actions, GitLab CI, and CircleCI.
