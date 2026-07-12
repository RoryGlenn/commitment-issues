# Contributing to Commitment Issues

Thanks for your interest in improving `commitment-issues`! This project is an
advisory-first Git hook toolkit for JavaScript and TypeScript, and it dogfoods
its own hooks — so contributing here is a good way to see the tool in action.

Every contribution is welcome: bug reports, documentation fixes, tests, and
features. Please read this guide before opening a pull request.

## Code of Conduct

This project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold it.

## Governance and roles

Project decisions, maintainer authority, sensitive-resource access, and role
responsibilities are documented in [Governance](../GOVERNANCE.md) and
[Project roles](../docs/project-roles.md).

## Getting started

### Prerequisites

- **Node.js >= 22.11.0** (the scripts use modern ESM features and the built-in
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
| `.github/workflows/` | CI (lint, format, tests, coverage, package-manager lifecycle checks)   |

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

3. Add or update tests. Major new functionality **MUST** include automated tests
   in the project test suite. Bug fixes **MUST** include a regression test when a
   practical regression test can be written.

4. Sign off every commit to assert that you are legally authorized to contribute
   the change:

   ```bash
   git commit -s
   ```

5. Run the full local check suite before pushing:

   ```bash
   npm test              # node --test test/*.test.mjs test/*.test.js
   npm run lint          # eslint .
   npm run format:check  # prettier . --check (use `npm run format` to fix)
   ```

   Optionally, verify the end-to-end packaging lifecycle:

   ```bash
   npm run test:lifecycle:npm
   ```

6. Update [`CHANGELOG.md`](../CHANGELOG.md) under the `## [Unreleased]` heading if
   your change is user-visible, and update the docs in `docs/` or `README.md`
   when behavior changes.

## Testing

- Tests use `node:test` and `node:assert/strict` — no external test runner.
- Major new functionality **MUST** include automated tests.
- Bug fixes **MUST** include regression tests when practical.
- Run the whole suite with `npm test`, or a single file with
  `node --test test/<name>.test.mjs`.
- Runtime line, branch, and function coverage is gated at 100%: `npm run test:coverage`. See the
  [exact source/test scope](../docs/branch-coverage.md).
- CI runs on Ubuntu, macOS, and Windows against Node 22.11.0 and 24, plus
  lifecycle integrations for npm, pnpm, yarn, and bun. Please keep changes
  cross-platform (avoid shell-specific assumptions and hard-coded path
  separators).

## Coding style

- Formatting is enforced by **Prettier** and linting by **ESLint** (flat
  config). Run `npm run format` and `npm run lint:fix` before committing.
- Match the surrounding code: small, composable functions and clear names.
- Only add comments where intent is non-obvious. Avoid documenting code you did
  not change.

## Contribution requirements

To keep contributions reviewable and releasable, pull requests must meet these
requirements:

- Major new functionality **MUST** include automated tests in the project test
  suite.
- Bug fixes **MUST** include regression tests when practical.
- Every commit **MUST** include a Developer Certificate of Origin sign-off
  (`Signed-off-by:`), normally created with `git commit -s`.
- Keep changes focused and scoped to one logical update.
- Pass local checks: `npm test`, `npm run lint`, and `npm run format:check`.
- Update `CHANGELOG.md` (`## [Unreleased]`) and docs for user-visible changes.
- Follow the project's advisory-first design philosophy.

## Developer Certificate of Origin

The project uses the [Developer Certificate of Origin](../DCO) as its legal
contribution authorization mechanism. By signing off a commit, you certify that
you have the right to submit the contribution under the project license.

Every commit must contain a sign-off trailer in this form:

```text
Signed-off-by: Your Name <you@example.com>
```

Use this command to create the trailer automatically:

```bash
git commit -s
```

Pull requests are checked for DCO sign-offs in CI. The aggregate required
`CI Success` status includes that DCO job, and pushes to `main` are audited
against the prospective baseline documented in [Governance](../GOVERNANCE.md).
When squash-merging, verify that the generated squash commit message retains a
valid `Signed-off-by` trailer; the post-merge audit will flag an unsigned squash
commit even when every head-branch commit was signed.

## Code review standards

All pull requests are reviewed against the same baseline:

- Correctness: behavior matches the stated intent and does not regress defaults.
- Safety: advisory-first behavior remains default unless explicit config opts in to
  blocking.
- Cross-platform compatibility: changes work on macOS, Linux, and Windows.
- Tests: major new functionality includes automated tests; bug fixes include
  regressions when practical.
- Documentation: user-visible behavior updates include README/docs and changelog
  updates.

For acceptance, a pull request must have passing CI and maintainer sign-off that
these checks are satisfied.

## Review and branch-protection policy

The `main` branch uses pull requests as the normal merge path. Its live ruleset
requires one approval, dismisses stale approvals after new commits, requires
approval of the most recent push by someone other than the pusher, requires all
review threads to be resolved, and strictly requires the aggregate
`CI Success` status. Squash and rebase are the only allowed merge methods.

The repository currently has one trusted maintainer. Until a second trusted
reviewer or maintainer is listed, the sole maintainer may use the documented
temporary admin-bypass exception only for an otherwise green pull request when
independent approval cannot be obtained. The pull request must say that the
exception was used; DCO, CI, and thread resolution still apply. Self-approval
does not count as independent review.

Direct pushes or bypasses of failed checks are limited to incidents where the
normal pull-request path cannot safely be used. They require signed commits, a
record of the reason and skipped control, follow-up validation, and
retrospective review. See [Governance](../GOVERNANCE.md) for the complete
prospective baseline, emergency criteria, and continuity plan.

## Commit messages

- Write clear, imperative commit subjects (for example, "Add version flag to
  CLI"). A short body explaining the "why" is appreciated for non-trivial
  changes.
- Conventional Commits are welcome but not required.
- Include a DCO sign-off on every commit with `git commit -s`.

## Opening a pull request

1. Push your branch and open a PR against `main`.
2. Fill out the pull request template, including how you tested the change.
3. Ensure CI is green — pull requests must pass all required checks before merge.
4. A maintainer will review your PR. Please be responsive to feedback; small,
   well-scoped PRs are reviewed fastest.

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](../LICENSE) and that your DCO sign-off is accurate.

## Questions

Not sure where to start? Look for issues labeled
[`good first issue`](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
or open a question issue. We also keep newcomer-friendly tasks under
[`help wanted`](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
See [SUPPORT.md](SUPPORT.md) for more ways to get help.
