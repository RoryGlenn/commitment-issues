# Contributing to Commitment Issues

Thanks for your interest in improving `commitment-issues`! This project is an
advisory-first Git hook toolkit for JavaScript and TypeScript, and it dogfoods
its own hooks — so contributing here is a good way to see the tool in action.

Every contribution is welcome: bug reports, documentation fixes, tests, and
features. Please read this guide before opening a pull request.

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold it.

## Getting started

### Prerequisites

- **Node.js >= 22.22.1** (the scripts use modern ESM features and the built-in
  `node --test` runner). Check with `node --version`.
- **git** and a GitHub account.

### Set up your environment

1. [Fork](https://github.com/RoryGlenn/commitment-issues/fork) the repository and
   clone your fork:

   ```bash
   git clone https://github.com/<your-username>/commitment-issues.git
   cd commitment-issues
   ```

2. Install dependencies. This also runs `prepare` (`doctor --quiet`), which wires
   the repo's own Git hooks so your commits and pushes are checked by the tool:

   ```bash
   npm install
   ```

3. Confirm everything is healthy:

   ```bash
   npm test
   npm run lint
   npm run format:check
   ```

## Project layout

The package is pure ESM (`.mjs`) with **no build step** and no runtime
transpilation.

| Path                 | What lives there                                                       |
| -------------------- | ---------------------------------------------------------------------- |
| `scripts/`           | Entry-point commands (`cli`, `init`, `doctor`, `precommit`, `prepush`) |
| `scripts/lib/`       | Shared, unit-tested helper modules                                     |
| `test/`              | `node:test` suites (`*.test.mjs`) and helpers                          |
| `docs/`              | Configuration, FAQ, and message-state references                       |
| `.github/workflows/` | CI (lint, format, tests, coverage, package-manager smokes)             |

Entry scripts run top-level code and call `process.exit`, so they are tested by
spawning subprocesses inside temporary git repos (see
[`test/helpers/temp-repo.mjs`](../test/helpers/temp-repo.mjs)). Helper modules in
`scripts/lib/` are unit-tested in-process.

## Development workflow

1. Create a branch from `main`:

   ```bash
   git switch -c fix/short-description
   ```

2. Make your change. Keep it focused — one logical change per pull request.

3. Add or update tests. New behavior should come with coverage, and bug fixes
   should include a regression test.

4. Run the full local check suite before pushing:

   ```bash
   npm test              # node --test test/*.test.mjs
   npm run lint          # eslint .
   npm run format:check  # prettier . --check (use `npm run format` to fix)
   ```

   Optionally, verify the end-to-end packaging lifecycle:

   ```bash
   npm run test:smoke
   ```

5. Update [`CHANGELOG.md`](../CHANGELOG.md) under the `## [Unreleased]` heading if
   your change is user-visible, and update the docs in `docs/` or `README.md`
   when behavior changes.

## Testing

- Tests use `node:test` and `node:assert/strict` — no external test runner.
- Run the whole suite with `npm test`, or a single file with
  `node --test test/<name>.test.mjs`.
- Coverage is **reported, not gated**: `npm run test:coverage`.
- CI runs on Ubuntu, macOS, and Windows against Node 22.22.1 and 24, plus
  lifecycle smokes for npm, pnpm, yarn, and bun. Please keep changes
  cross-platform (avoid shell-specific assumptions and hard-coded path
  separators).

## Coding style

- Formatting is enforced by **Prettier** and linting by **ESLint** (flat
  config). Run `npm run format` and `npm run lint:fix` before committing.
- Match the surrounding code: small, composable functions and clear names.
- Only add comments where intent is non-obvious. Avoid documenting code you did
  not change.

## Commit messages

- Write clear, imperative commit subjects (for example, "Add version flag to
  CLI"). A short body explaining the "why" is appreciated for non-trivial
  changes.
- Conventional Commits are welcome but not required.

## Opening a pull request

1. Push your branch and open a PR against `main`.
2. Fill out the pull request template, including how you tested the change.
3. Ensure CI is green — pull requests must pass all required checks before merge.
4. A maintainer will review your PR. Please be responsive to feedback; small,
   well-scoped PRs are reviewed fastest.

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](../LICENSE).

## Questions

Not sure where to start? Look for issues labeled
[`good first issue`](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
or open a question issue. See [SUPPORT.md](SUPPORT.md) for more ways to get help.
