# Commitment Issues

[![CI](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml/badge.svg)](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/commitment-issues.svg)](https://www.npmjs.com/package/commitment-issues)
[![npm weekly downloads](https://img.shields.io/npm/dw/commitment-issues.svg)](https://www.npmjs.com/package/commitment-issues)
[![Node >=22.22.1](https://img.shields.io/badge/node-%3E%3D22.22.1-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Advisory-first pre-commit and pre-push checks for JavaScript and TypeScript projects using Husky, lint-staged, ESLint, and Prettier.

**Advisory by default:** `commitment-issues` reports issues without discarding unstaged work, rewriting already-pushed history, or blocking pushes. Blocking behavior is opt-in.

## Why use it?

- Warn before commits without blocking by default.
- Warn before pushes when related tests fail.
- Refuse unsafe fixes when staged and unstaged changes overlap.
- Suggest safe follow-up commands instead of mutating work unexpectedly.
- Enable stricter behavior only when your repo wants it.

## Quickstart

Use this when you want the shortest path from install to the first checked commit.

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

### 3. Commit normally

Stage your work and commit normally:

```bash
git add -A
git commit -m "your message"
```

By default, commit-time checks are advisory. They report issues, but the commit continues.

### 4. Fix when suggested

When the hook reports auto-fixable lint or formatting issues before committing, run:

```bash
npm run fix:staged
```

When the hook suggests amending the latest commit and the working tree is safe, run:

```bash
npm run commit:fix
```

### 5. Push normally

After `init`, push-time tests run in advisory mode. They warn when associated pushed-file tests fail, but the push continues.

To make pushed-file test failures block the push, set:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true
  }
}
```

## What it looks like

`commitment-issues` prints compact terminal boxes so commit and push feedback is visible without being noisy.

**Pre-commit suggestions**

<p>
  <img src="assets/precommit-suggestions-warning.svg" alt="Pre-commit warning output showing formatting suggestions and the commit fix command" width="476">
</p>

**Safety refusal**

<p>
  <img src="assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="620">
</p>

**Safe automatic amend**

<p>
  <img src="assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="555">
</p>

**Advisory push failure**

<p>
  <img src="assets/advisory-push-failure.svg" alt="Warning output showing failing push-time tests in advisory mode" width="450">
</p>

In default advisory mode, your commit and push still go through. The tool gives future-you a heads up.

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

## How commit and push checks behave

| Action       | Default behavior                                        | Stricter option                                                |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| `git commit` | Reports lint, formatting, missing-test, and test issues | Enable `runStagedTests` to run staged-related tests            |
| `git push`   | Runs pushed-file tests in advisory mode after `init`    | Enable `blockPushOnTestFailure` to stop pushes on test failure |

## Advisory push tests (default)

`init` enables `advisePushTests` by default. On `git push`, the pre-push hook runs only the tests associated with the files being pushed: the changed test files themselves, plus any test discovered for a changed source file.

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

## Safety model

- Default commit-time checks report issues without mutating the working tree.
- Default push-time checks warn without blocking the push.
- `npm run fix:staged` only targets staged files.
- If a file has both staged and unstaged changes, `npm run fix:staged` refuses to run for safety.
- `npm run commit:fix` only runs when tracked staged and unstaged changes are absent, so it can safely amend the latest commit.
- If ESLint cannot fix everything automatically, available fixes are still applied and re-staged, and the command exits non-zero so the remaining issues are visible.

## Requirements

- **Node.js >= 22.22.1** — the scripts use modern ESM features and the built-in `node --test` runner.
- Peer tools in your project: `husky`, `lint-staged`, `eslint`, and `prettier`.
- An ESLint flat config, usually `eslint.config.js`.
- For TypeScript, a TypeScript-aware ESLint config.

## Configuration

All options live under `precommitChecks` in `package.json`.

```json
{
  "precommitChecks": {
    "runStagedTests": true,
    "blockPushOnTestFailure": true,
    "testCommand": ["node", "--test"],
    "testExempt": ["src/legacy/**"],
    "tone": "standard"
  }
}
```

| Key                      | What it controls                                     |
| ------------------------ | ---------------------------------------------------- |
| `runStagedTests`         | Runs related tests at commit time                    |
| `blockPushOnTestFailure` | Blocks pushes when pushed-file tests fail            |
| `testCommand`            | Sets the test runner used by staged and pushed tests |
| `testExempt`             | Exempts extra paths from missing-test warnings       |
| `requireTests`           | Turns missing-test warnings on or off                |
| `timeoutMs`              | Caps spawned tool runtime                            |
| `tone`                   | Uses `"standard"` or `"fun"` advisory message text   |

See [Configuration and Behavior](docs/configuration.md) for the full behavior reference, test-runner examples, TypeScript notes, and CI notes.

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

Repair the hook wiring on demand with:

```bash
npm run doctor
```

`doctor` checks hook wiring and rebuilds missing pieces without overwriting existing hooks. It is safe to run anytime; if everything is already healthy it just says so.

Also check your environment has not disabled Husky hooks.

## More docs

- [Message states](docs/message-states.md) — fuller gallery of common output states.
- [Configuration and Behavior](docs/configuration.md) — full configuration reference, test heuristics, push behavior, TypeScript notes, CI notes, and project internals.

## Why the name?

Because sometimes your code has commitment issues.

`commitment-issues` points out the things future-you may regret: lint problems, formatting drift, missing tests, and other small signs that the relationship may need work.

It nudges first. It can enforce when configured. It keeps the choice explicit.

> `commitment-issues` starts as a friendly warning system.
>
> It tells you what looks risky before you share the work, while leaving enforcement as a deliberate configuration choice.

## Optional: make it a little weird

The default output stays professional, but local projects can opt into a more playful advisory tone:

```json
{
  "precommitChecks": {
    "tone": "fun"
  }
}
```

This only changes advisory message text. It does not change exit codes, safety checks, automatic fixes, push behavior, or blocking behavior.

Use it when you want the package name to show through a little more in local developer output.

## License

MIT — see [LICENSE](LICENSE).
