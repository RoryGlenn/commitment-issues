# Commitment Issues

Advisory pre-commit checks that nudge, never block. A non-blocking pre-commit flow for JavaScript and TypeScript projects using Husky, lint-staged, ESLint, and Prettier. It works on pure JS, pure TS, and mixed JS/TS codebases.

**Advisory by design:** the hook reports issues but never blocks a commit, never discards unstaged work, and never rewrites already-pushed history.

## Requirements

- **Node.js >= 22** — the scripts use modern ESM features and the built-in `node --test` runner.
- Peer tools in your project: `husky`, `lint-staged`, `eslint`, `prettier` (the hooks run these). `commitment-issues` itself brings `boxen`, `picocolors`, and `cross-spawn` along as dependencies.
- An ESLint flat config (`eslint.config.js`) in your project. For TypeScript, it must be TypeScript-aware (see [TypeScript and mixed projects](#typescript-and-mixed-projects)).

## Installation

```bash
npm install -D commitment-issues husky lint-staged eslint prettier
npx commitment-issues init
```

That's it. `init` wires up the `.husky/pre-commit` and `.husky/pre-push` hooks (which call the `commitment-issues` bin), adds the npm scripts and `lint-staged` config, seeds an empty `precommitChecks` block, activates Husky, and gitignores the caches — all idempotent, so it's safe to re-run. Nothing is copied into your repo; everything runs from the installed package.

Make sure your project has an ESLint flat config (`eslint.config.js`); for TypeScript, make it TypeScript-aware (see below).

<details>
<summary>Prefer manual setup?</summary>

Instead of `npx commitment-issues init`, register the hooks and add the scripts yourself:

```bash
npx husky init
echo "commitment-issues precommit" > .husky/pre-commit
echo "commitment-issues prepush" > .husky/pre-push
```

```json
{
  "scripts": {
    "prepare": "commitment-issues doctor --quiet",
    "commit:fix": "commitment-issues commit-fix",
    "fix:staged": "commitment-issues fix-staged",
    "test:precommit": "commitment-issues precommit",
    "doctor": "commitment-issues doctor"
  },
  "lint-staged": {
    "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["commitment-issues fix-staged-js"],
    "*.{json,css,scss,md,html,yml,yaml}": ["prettier --write --ignore-unknown"]
  }
}
```

Then gitignore `.eslintcache` and `.prettiercache`.

</details>

Your next `git commit` will run the advisory checks.

## Project structure

- `scripts/cli.mjs` — the `commitment-issues` bin; dispatches subcommands (`init`, `doctor`, `precommit`, `prepush`, `commit-fix`, `fix-staged`, `fix-staged-js`).
- `scripts/precommit.mjs` — the pre-commit hook entrypoint (advisory checks).
- `scripts/init.mjs` — one-command setup for a consuming repo (`commitment-issues init`).
- `scripts/prepush.mjs` — the opt-in pre-push test gate.
- `scripts/doctor.mjs` — `commitment-issues doctor`, verifies and repairs the Husky hook wiring.
- `scripts/fix-staged.mjs` — `commitment-issues fix-staged`, runs lint-staged on staged files.
- `scripts/fix-staged-js.mjs` — lint-staged task: `eslint --fix` + `prettier --write`.
- `scripts/commit-fix.mjs` — `npm run commit:fix`, auto-fixes and amends the latest commit.
- `scripts/lib/` — shared helpers: `ui.mjs` (boxes), `process.mjs` (spawning/tool resolution), `files.mjs` (path/test heuristics), `checks.mjs` (output parsing), `message.mjs` (advisory builder), `config.mjs` (reads `precommitChecks`).

## Active flow

- `.husky/pre-commit` runs `commitment-issues precommit`.
- `scripts/precommit.mjs` inspects staged files, prints one consolidated summary box, and never blocks the commit.
- When automatic fixes can still be applied safely after the commit, the hook suggests `npm run commit:fix` as the post-commit amend path.
- `npm run fix:staged` runs `scripts/fix-staged.mjs`, which delegates staged-file fixing to `lint-staged`.
- `npm run commit:fix` runs `scripts/commit-fix.mjs`, which applies automatic fixes to the latest clean commit and amends it in place (with `--no-verify`, so the advisory hook doesn't re-run and print a duplicate box).
- JavaScript files are fixed by `scripts/fix-staged-js.mjs`, which runs `eslint --fix` and then `prettier --write` on the staged JS file set.
- Other staged Prettier-supported files are fixed by `prettier --write` through `lint-staged`.

## TypeScript and mixed projects

- Staged `.ts`, `.tsx`, `.mts`, `.cts`, and `.cjs` files are treated as code files alongside `.js`/`.jsx`/`.mjs`, so they flow through ESLint and Prettier just like JavaScript.
- `.d.ts` declaration files are excluded from the "missing unit tests" check.
- The unit-test heuristic recognizes matching tests in the same directory, an adjacent `__tests__/`, or a top-level `test/`/`tests/` directory (e.g. `src/foo.ts` is satisfied by `test/foo.test.ts`).
- **Prerequisite for real TypeScript:** these scripts delegate linting to your project's own ESLint config, so your `eslint.config.js` must be set up for TypeScript (e.g. [`typescript-eslint`](https://typescript-eslint.io/)). Prettier formats TypeScript out of the box. Without a TypeScript-aware ESLint parser, ESLint will report parse errors on real type syntax.

## Unit-test heuristics

The hook flags staged code files that have no matching test, but it skips files that don't normally need one:

- test files themselves (`*.test.*`, `*.spec.*`) and anything under `test/`, `tests/`, `__tests__/`, or `__mocks__/`
- config files (`*.config.*` and dotfile configs like `.eslintrc.cjs`)
- type declarations (`*.d.ts`, `*.d.mts`, `*.d.cts`)
- Storybook stories (`*.stories.*`)
- generated code (`*.generated.*`, or files under `generated/` / `__generated__/`)

A matching test is found when it sits next to the file, in an adjacent `__tests__/`, or in a top-level `test/` / `tests/` directory (so `src/foo.ts` is satisfied by `test/foo.test.ts`).

To exempt additional paths, add glob patterns under `precommitChecks.testExempt` in `package.json` (supports `*`, `**`, and `?`):

```json
{
  "precommitChecks": {
    "testExempt": ["src/legacy/**", "**/*.pb.ts"]
  }
}
```

## Running staged tests (opt-in)

By default the hook only checks for _missing_ tests; it does not run them. To also run the tests relevant to a commit, enable it in `package.json`:

```json
{
  "precommitChecks": {
    "runStagedTests": true,
    "testCommand": ["node", "--test"]
  }
}
```

When enabled, the hook runs `testCommand` against the staged test files plus the tests it can find for staged source files. Failures are reported as an advisory warning (the commit still continues). `testCommand` is optional and defaults to `node --test`.

> Note: enabling `runStagedTests` executes a repo-defined command (`testCommand`) on every commit, just like `lint-staged`. Only enable it in repositories you trust. Spawned tools are capped by a timeout so a hung command can't wedge a commit.

### Using a different test runner (Vitest, Jest, …)

`testCommand` can be **any** command that accepts test file paths as arguments — both the staged-test check and the push gate append the relevant test files to it. If your project doesn't use Node's built-in runner, point it at your own.

**Vitest:**

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "vitest", "run"]
  }
}
```

The `run` subcommand is required — without it Vitest starts **watch mode** and the hook will hang.

**Jest:**

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "jest"]
  }
}
```

> **Common gotcha:** if your tests rely on a runner's globals (e.g. Vitest's or Jest's `test`/`expect` without importing them), running them under the default `node --test` fails with `ReferenceError: test is not defined`. That's not a broken test — it's the wrong runner. Set `testCommand` to your actual runner.

## Blocking pushes on test failure (opt-in)

The pre-commit flow is always advisory. If you want a hard gate, enforce it at **push** time instead — commits stay cheap and non-blocking, while broken code is stopped before it is shared. This is handled by a separate `pre-push` hook (`.husky/pre-push` runs `commitment-issues prepush`).

It is **off by default**. Enable it in `package.json`:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true,
    "testCommand": ["node", "--test"]
  }
}
```

When enabled, `git push` runs **only the tests associated with the files being pushed** — the changed test files themselves, plus any test discovered for a changed source file (same heuristic as the missing-test check) — and **blocks the push (exit 1) if any fail**. If the pushed files have no associated tests, the push is allowed. The runner is `testCommand` (shared with the staged-test feature), which defaults to `node --test` and must accept test file paths as arguments. The output streams live and ends with a boxed `N passed, N failed` summary.

### Advisory push tests (run but never block)

If you want the suite to run on push but only **warn** on failure (never blocking), enable `advisePushTests` instead:

```json
{
  "precommitChecks": {
    "advisePushTests": true
  }
}
```

This runs the same pushed-files tests and prints the live output and summary, but always exits 0 — a failure shows a `Tests failed (advisory)` warning box and the push still proceeds. If `blockPushOnTestFailure` is also set, it takes precedence and the push is blocked.

To register the hook, add it once:

```bash
echo "commitment-issues prepush" > .husky/pre-push
```

> The gate is capped by a timeout. To bypass it for a single push, use `git push --no-verify`.

## Configuration reference

All options live under `precommitChecks` in `package.json`; all are optional:

| Key                      | Type     | Default              | Description                                                                                                        |
| ------------------------ | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `testExempt`             | string[] | `[]`                 | Glob patterns (`*`, `**`, `?`) for files excluded from the missing-test check.                                     |
| `requireTests`           | boolean  | `true`               | Set `false` to disable the "missing unit tests" advisory entirely.                                                 |
| `runStagedTests`         | boolean  | `false`              | Run tests for staged files at commit time (advisory).                                                              |
| `blockPushOnTestFailure` | boolean  | `false`              | Run the pushed files' tests at `git push` and block on failure.                                                    |
| `advisePushTests`        | boolean  | `false`              | Run the pushed files' tests at `git push` but only warn (never block). Ignored if `blockPushOnTestFailure` is set. |
| `testCommand`            | string[] | `["node", "--test"]` | Test runner used by both staged tests and the push gate; must accept test file paths.                              |
| `timeoutMs`              | number   | `120000`             | Max time any spawned tool may run before it's treated as timed out.                                                |

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
- **warning** — advisory issues found (lint, formatting, missing/failing tests); the commit continues
- **info** — nothing to check: no staged files, only a deletion, or only non-code/non-format files were staged
- **error** — the hook could not inspect Git or run a tool

## Safety model

- Commits are advisory: the hook reports issues but exits successfully.
- `npm run fix:staged` only targets staged files.
- If a file has both staged and unstaged changes, `npm run fix:staged` refuses to run for safety.
- `npm run commit:fix` only runs when tracked staged and unstaged changes are absent, so it can safely amend the latest commit.
- If ESLint cannot fix everything automatically, available fixes are still applied and re-staged, and the command exits non-zero so the remaining issues are visible.

## Performance

The hook is tuned to stay fast even on slow machines:

- ESLint, Prettier, and (opt-in) staged tests run **concurrently**.
- Tools run directly through the project's local Node binaries, skipping `npx` resolution overhead.
- ESLint (`.eslintcache`) and Prettier (`.prettiercache`) caches speed up repeated runs. Both are written to the project root and should be gitignored.

## Continuous integration

These scripts are Git-hook tooling, so disable Husky in CI with `HUSKY=0` to avoid installing hooks during `npm ci`. This project's own workflow runs `npm ci`, `npm run lint`, `npm run format:check`, and `npm test` on Node 22 and 24. Locally, `npm run test:coverage` runs the same suite with `--experimental-test-coverage` for a coverage report.

## Commands

```bash
npx commitment-issues init   # one-command setup (hooks, scripts, config)
npm run doctor               # verify and repair the git hook wiring
npm run test:precommit       # run the pre-commit checks directly
npm run fix:staged           # apply staged-only ESLint/Prettier fixes
npm run commit:fix           # apply automatic fixes to the latest clean commit and amend it
```

The npm scripts above are added by `init` and call the `commitment-issues` bin. You can also invoke any subcommand directly, e.g. `npx commitment-issues doctor`.

## Troubleshooting

### The hooks silently stopped running

If commits and pushes suddenly skip all checks — no advisory box, no push gate — the Husky wiring was probably knocked out. Husky runs every hook through the **gitignored** `.husky/_` wrapper directory plus git's `core.hooksPath`, and **neither is committed**. A `git clean -fdx`, a stale checkout, a discarded-untracked-files action in a Git GUI, or a dependency reinstall that skipped `prepare` can remove them — which silently switches off _both_ `pre-commit` and `pre-push` at once.

**This heals itself on install.** `init` sets `prepare` to `commitment-issues doctor --quiet`, so every `npm install`/`npm ci` automatically re-establishes the wiring (silently when healthy, with a one-line notice when it repairs something). It can never break an install — in a non-git context it just no-ops.

If the wiring drops _without_ a reinstall (e.g. a `git clean` mid-session), git can't launch any hook to fix itself — that's an inherent chicken-and-egg limit. Repair it on demand with:

```bash
npm run doctor
```

`doctor` checks that `core.hooksPath` points at `.husky/_`, that the `.husky/_` wrappers exist, and that `.husky/pre-commit`/`.husky/pre-push` are present — and rebuilds whatever is missing (without overwriting existing hooks). It's safe to run anytime; if everything is already healthy it just says so.

> Also check you haven't left `HUSKY=0` set in your environment — that env var disables **all** Husky hooks until it's removed.

## License

MIT — see [LICENSE](LICENSE).
