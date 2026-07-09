<p align="center">
  <img src="assets/commitment-issues.png" alt="commitment-issues — advisory-first Git hooks for developers who overthink every commit" width="100%" />
</p>

# Commitment Issues

[![CI](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml/badge.svg)](https://github.com/RoryGlenn/commitment-issues/actions/workflows/ci.yml)
[![Coverage: 93.93%](https://img.shields.io/badge/coverage-93.93%25-brightgreen.svg)](docs/scenario-coverage.md)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/RoryGlenn/commitment-issues/badge)](https://securityscorecards.dev/viewer/?uri=github.com/RoryGlenn/commitment-issues)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13528/badge)](https://www.bestpractices.dev/projects/13528)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/13528/baseline)](https://www.bestpractices.dev/projects/13528)
[![npm version](https://img.shields.io/npm/v/commitment-issues.svg)](https://www.npmjs.com/package/commitment-issues)
[![npm weekly downloads](https://img.shields.io/npm/dw/commitment-issues.svg)](https://www.npmjs.com/package/commitment-issues)
[![Node >=22.22.1](https://img.shields.io/badge/node-%3E%3D22.22.1-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

_For developers who overthink every commit._

<p align="center">
  <img src="assets/demo.gif" alt="commitment-issues in action: init, an advisory commit, commit:fix, and a passing push" width="800" />
</p>

## Project status and support

- **Status:** actively maintained.
- **Discussion and feedback:** use [GitHub Issues](https://github.com/RoryGlenn/commitment-issues/issues) for bugs, feature requests, and questions.
- **How to contribute:** see [Contributing](.github/CONTRIBUTING.md).
- **Contribution requirements:** see the requirements section in [Contributing](.github/CONTRIBUTING.md).
- **Reference docs for the external interface:** see [External interface reference](docs/external-interface.md).
- **Language:** project documentation and issue/PR discussion are in English.

## Why use it?

- Warn before commits without blocking by default.
- Warn before pushes when related tests fail.
- Refuse unsafe fixes when staged and unstaged changes overlap.
- Suggest safe follow-up commands instead of mutating work unexpectedly.
- Enable stricter behavior only when your repo wants it.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/project-flowchart-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/project-flowchart-light.svg">
  <img alt="commitment-issues project flowchart showing setup, Git hook wiring, pre-commit checks, safe fix paths, and pre-push checks" src="assets/project-flowchart-light.svg">
</picture>

`commitment-issues` wires native Git hooks, runs advisory checks by default, and only blocks or mutates work when it is safe or explicitly configured. See [How commitment-issues works](docs/how-it-works.md) for the full breakdown.

## Quickstart

Use this when you want the shortest path from install to the first checked commit.

### 1. Install

Install `commitment-issues` with the peer tools it runs:

```bash
npm install -D commitment-issues eslint prettier
```

### 2. Initialize

Run the setup command:

```bash
npx commitment-issues init
```

This wires the Git hooks (plain `.git/hooks` files — no hook manager), adds helper npm scripts, enables advisory push tests, and ignores the local ESLint/Prettier cache files and `node_modules/`. Upgrading from 2.x? `init` also migrates the old husky-era wiring automatically.

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
  <img src="assets/precommit-suggestions-warning.svg" alt="Pre-commit warning output showing formatting suggestions and the commit fix command" width="479">
</p>

**Safety refusal**

<p>
  <img src="assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="568">
</p>

**Safe automatic amend**

<p>
  <img src="assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="590">
</p>

**Advisory push failure**

<p>
  <img src="assets/advisory-push-failure.svg" alt="Warning output showing failing push-time tests in advisory mode" width="713">
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

## How it compares

`commitment-issues` owns its Git hook wiring and staged-fix pipeline directly — no husky, no lint-staged — and adds an advisory-first opinion with a one-command setup. Compared with wiring those tools together yourself or reaching for another hook manager:

| Capability                                  | commitment-issues  | husky + lint-staged (DIY) | lefthook            | pre-commit          |
| ------------------------------------------- | ------------------ | ------------------------- | ------------------- | ------------------- |
| Advisory (non-blocking) by default          | Yes                | You build it              | No (fails the hook) | No (fails the hook) |
| One-command setup                           | Yes (`init`)       | Manual wiring             | Config file         | Config file         |
| Extra runtime dependencies for hooks        | None               | husky + lint-staged       | lefthook binary     | Python + tool cache |
| Self-heals broken hook wiring               | Yes (`doctor`)     | No                        | No                  | No                  |
| Pushed-file test gate (advisory → blocking) | Yes                | You build it              | Manual              | Manual              |
| Safe auto-fix + amend helper                | Yes (`commit:fix`) | No                        | No                  | No                  |
| Refuses unsafe fixes on partial staging     | Yes                | No                        | No                  | No                  |
| Primary ecosystem                           | JS / TS (npm)      | JS / TS (npm)             | Any                 | Any (Python)        |

## Package managers

`commitment-issues` works with **npm, pnpm, yarn, and bun**. It detects your package manager — from `npm_config_user_agent` and your lockfile — and tailors the command hints it prints (for example, a pnpm project sees `pnpm run commit:fix`). Hooks run through `node_modules/.bin`, so no extra configuration is required. Each manager is exercised by an end-to-end CI lifecycle smoke. Yarn Berry projects should set `nodeLinker: node-modules` — Plug'n'Play is not supported, since hooks resolve the bin from `node_modules/.bin`. See the [Yarn Berry guide](docs/yarn-berry.md) for setup details.

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

## Privacy

`commitment-issues` runs entirely on your machine, inside your Git workflow.

- **No telemetry.** It collects no usage data.
- **No phone-home.** It reports nothing back to us or any third party.
- **No repository data leaves your machine.** Your code, diffs, and history stay local.
- Checks run locally through the tools already installed in your project.

There's no account and nothing to opt out of — the checks are just your own ESLint, Prettier, and tests running where you already run them.

## Requirements

- **Node.js >= 22.22.1** — the scripts use modern ESM features and the built-in `node --test` runner.
- Peer tools in your project: `eslint` and `prettier`.
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
npx commitment-issues init --dry-run
npx commitment-issues --version
npm run doctor               # verify and repair hook wiring
npm run test:precommit       # run the pre-commit checks directly
npm run fix:staged           # apply staged-only ESLint/Prettier fixes
npm run commit:fix           # apply automatic fixes to the latest clean commit and amend it
```

The npm scripts above are added by `init` and call the `commitment-issues` bin. You can also invoke any subcommand directly, for example `npx commitment-issues doctor`.

## Troubleshooting

### The hooks silently stopped running

If commits and pushes suddenly skip all checks, the hook wiring was probably knocked out by a fresh clone, a stale checkout, or a reinstall that skipped `prepare` — `.git/hooks` is never committed, so it starts empty.

Repair the hook wiring on demand with:

```bash
npm run doctor
```

`doctor` checks hook wiring and rebuilds missing pieces without overwriting existing hooks. It is safe to run anytime; if everything is already healthy it just says so.

Also check your environment has not disabled the hooks (`COMMITMENT_ISSUES=0` or the pre-3.0 `HUSKY=0` skip both hooks).

## More docs

- [How commitment-issues works](docs/how-it-works.md) — visual flowchart and text breakdown of setup, hooks, checks, fix paths, and push behavior.
- [FAQ](docs/faq.md) — answers for adoption, safety, configuration, test runners, package managers, CI, and removal.
- [Migration guide](docs/migration.md) — paths from raw husky + lint-staged, lefthook, and pre-commit setups.
- [External interface reference](docs/external-interface.md) — commands, scripts, hooks, config keys, defaults, and outputs.
- [OpenSSF Best Practices evidence](docs/openssf-best-practices.md) — criterion-to-URL mapping for badge questionnaire updates.
- [Yarn Berry guide](docs/yarn-berry.md) — using `commitment-issues` with Yarn 2+ and the `node-modules` linker.
- [Monorepo & workspaces guide](docs/monorepo.md) — running `commitment-issues` from the root of a workspaces repository.
- [Framework recipes](docs/framework-recipes.md) — wiring for Next.js, Vite, and TypeScript libraries.
- [CI provider recipes](docs/ci-recipes.md) — disabling hooks on GitHub Actions, GitLab CI, and CircleCI.
- [Roadmap](ROADMAP.md) — public view of what the project is improving next.
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
