# Contributing to Commitment Issues

Thanks for helping improve `commitment-issues`. Contributions of all sizes are
welcome, including bug reports, documentation fixes, tests, and new features.

`commitment-issues` is an advisory-first Git hook toolkit for JavaScript and
TypeScript projects. Changes should preserve that safe default: warn first, and
block only when a repository explicitly opts in.

## Before you start

- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
- Search the [existing issues](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue)
  before opening a new one.
- Use the [issue chooser](https://github.com/RoryGlenn/commitment-issues/issues/new/choose)
  for bugs, feature requests, and usage questions.
- Open an issue before starting a substantial behavior, security, release, or
  governance change. Small documentation corrections, typo fixes, and low-risk
  maintenance changes may go directly to a pull request.
- Report vulnerabilities privately through
  [GitHub Security Advisories](https://github.com/RoryGlenn/commitment-issues/security/advisories/new),
  not a public issue. See the [Security Policy](./SECURITY.md).

Project authority, decision-making, review requirements, and maintainer roles
are documented in [Governance](../GOVERNANCE.md) and
[Project roles](../docs/project-roles.md).

## Prerequisites

- **Node.js >= 22.11.0**. Check with `node --version`.
- **Git**. Check with `git --version`.
- **npm**, which is included with Node.js.
- A GitHub account.

The package uses ESM and Node's built-in `node:test` runner. There is no build or
transpilation step.

## Set up your development environment

1. [Fork the repository](https://github.com/RoryGlenn/commitment-issues/fork),
   then clone your fork:

   ```bash
   git clone https://github.com/<your-username>/commitment-issues.git
   cd commitment-issues
   ```

2. Add the main repository as `upstream` so you can keep your fork current:

   ```bash
   git remote add upstream https://github.com/RoryGlenn/commitment-issues.git
   git fetch upstream
   ```

3. Install the exact locked dependencies:

   ```bash
   npm ci
   ```

   Installation runs the repository's `prepare` script. That quietly verifies
   the local hook wiring with `doctor` without replacing unrelated custom hooks.

4. Confirm the checkout is healthy:

   ```bash
   npm run doctor
   npm run lint
   npm run format:check
   npm test
   ```

## Project layout

| Path                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `scripts/`           | Published CLI commands and Git-hook entry points            |
| `scripts/lib/`       | Shared runtime modules                                      |
| `test/`              | Top-level `node:test` suites and test helpers               |
| `test/integration/`  | Package lifecycle integration tests                         |
| `tools/`             | Repository maintenance and documentation utilities          |
| `docs/`              | Indexed user, contract, maintainer, and audit documentation |
| `assets/`            | README and message-state visual assets                      |
| `.github/workflows/` | CI, security, release, and maintenance workflows            |

Entry scripts are tested through subprocesses in disposable Git repositories.
Reusable setup helpers live in
[`test/helpers/temp-repo.mjs`](../test/helpers/temp-repo.mjs).

Start documentation changes from the
[documentation index](../docs/index.md). Update the canonical source for a
fact instead of copying its complete reference table into another page.

## Development workflow

1. Start a focused branch from the latest `upstream/main`:

   ```bash
   git fetch upstream
   git switch -c fix/short-description upstream/main
   ```

2. Make one logical change per pull request.

3. Add or update tests:

   - Major new functionality must include automated tests.
   - Bug fixes must include a regression test when one can be written
     practically.
   - Cross-platform behavior must avoid shell-specific assumptions and
     hard-coded path separators.

4. Update documentation when behavior changes. Add user-visible changes to
   [`CHANGELOG.md`](../CHANGELOG.md) under `## [Unreleased]`.

5. Run the local checks described below.

6. Sign off every commit under the Developer Certificate of Origin:

   ```bash
   git commit -s -m "Describe the change"
   ```

7. Push your branch and open a pull request against `main`.

## Testing and validation

Run these checks before every pull request:

```bash
npm run lint
npm run format:check
npm test
```

Use `npm run lint:fix` and `npm run format` to apply safe mechanical fixes.

Also run the checks that match your change:

| Change                                                             | Additional validation                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Published runtime code in `scripts/`                               | `npm run test:coverage`                                      |
| Install, init, doctor, hook wiring, uninstall, or package behavior | `npm run test:lifecycle:npm`                                 |
| Package contents or release tooling                                | `npm run test:lifecycle:npm` and the relevant release checks |

The runtime coverage gate requires 100% line, branch, and function coverage.
See the [Runtime Coverage Policy](../docs/branch-coverage.md) for the exact source
and test scope.

Run a single top-level test file with:

```bash
node --test test/<name>.test.mjs
```

CI tests Ubuntu, macOS, and Windows on Node.js 22.11.0 and 24. It also exercises
npm, pnpm, Yarn, and Bun package lifecycles. Keep changes cross-platform even if
you develop on only one operating system.

## Coding style

- Formatting is enforced by Prettier.
- Linting is enforced by ESLint's flat configuration.
- Match the surrounding code: use small, composable functions and clear names.
- Add comments for non-obvious intent, invariants, or safety boundaries—not to
  restate the code.
- Preserve user work. Setup, repair, and fix flows must fail safely when Git or
  the filesystem cannot prove that an operation is safe.

## Working with message states

`commitment-issues` prints its output as compact terminal boxes. There are two
separate, non-overlapping tools for working with the states these boxes can
show — don't confuse them:

- **Live scenario runner** (`tools/show-message-states.mjs`) drives the real
  entry scripts inside throwaway git repositories and streams their actual
  output to your terminal. It covers a curated, representative subset of
  states — useful for confirming a change behaves correctly end to end.
- **Static SVG gallery generator** (`tools/gen-message-state-svgs.mjs`) renders
  every documented message state as a hand-specified SVG mockup into
  `assets/`, for the exhaustive catalog in
  [`docs/message-states.md`](../docs/message-states.md).

Both tools live in `tools/`, which is maintainer-only tooling and is excluded
from the published npm package (outside the `package.json` `files` allowlist).

### Commands

| Command                                 | What it does                                                     |
| --------------------------------------- | ---------------------------------------------------------------- |
| `npm run states`                        | Runs every representative live scenario in a throwaway repo      |
| `npm run states -- <filter>`            | Runs only the scenario(s) whose name includes `<filter>`         |
| `npm run states -- --list`              | Lists all available live scenario names                          |
| `node tools/gen-message-state-svgs.mjs` | Regenerates only the SVGs defined in that script, into `assets/` |

### Adding a live scenario

Add an entry to the `SCENARIOS` array in `tools/show-message-states.mjs`.
Follow the existing `<command>/<short-description>` naming convention (for
example `precommit/large-commit`), and use the helpers in
`test/helpers/temp-repo.mjs` to set up the exact staged files or configuration
needed to trigger the state, then run the real script with `script()`. If the
scenario is expected to exit non-zero, set `expectedStatus` accordingly.

### Adding or regenerating a static gallery entry

1. In `tools/gen-message-state-svgs.mjs`, add a `boxSvg()` call (for a
   bordered terminal box) or `bareSvg()` call (for plain console-line output
   like a `doctor --quiet` warning) with the **exact wording** the command
   prints.
2. Run:

```bash
   node tools/gen-message-state-svgs.mjs
```

to regenerate the SVG into `assets/`.

3. Add the new state to [`docs/message-states.md`](../docs/message-states.md)
   under the matching command section, embedding the generated SVG.

The metadata drift test fails the build until every terminal box title used
in the source is documented here or in a referenced SVG — this keeps the
gallery from silently going stale as behavior changes. Run `npm test` to
confirm this check passes after adding a new state.

### Rules

- A single CLI invocation renders **at most one** human-facing box. When
  several findings apply at once, they are consolidated into one box rather
  than printed as separate boxes.
- Do not duplicate the full state gallery elsewhere in the docs — link to
  [`docs/message-states.md`](../docs/message-states.md) instead.
- These tools only affect documentation and internal test fixtures; they do
  not change any published runtime behavior in `scripts/`.

Before opening a pull request that touches message states, run:

```bash
npm test
npm run lint
npm run format:check
```

## Developer Certificate of Origin

This project uses the [Developer Certificate of Origin](../DCO) to confirm that
contributors have the right to submit their changes. Every commit must contain
a sign-off trailer:

```text
Signed-off-by: Your Name <you@example.com>
```

Create it automatically with `git commit -s`. If your latest local commit is
missing the trailer, add it with:

```bash
git commit --amend --signoff --no-edit
```

CI checks the sign-off on each pull-request commit. See
[Governance](../GOVERNANCE.md) for the enforcement baseline and merge policy.

## Pull request checklist

Before requesting review, confirm that:

- the pull request explains what changed and why;
- related issues are linked with `Closes #<number>` when appropriate;
- tests cover new behavior and practical bug regressions;
- lint, formatting, tests, and change-specific validation pass;
- user-visible changes update the changelog and relevant documentation;
- every commit includes a DCO sign-off; and
- the change remains focused and preserves the advisory-first safety model.

Fill out the pull request template, including the commands you ran. All required
CI checks and review requirements must pass before merge. The current rules and
the temporary single-maintainer exception are maintained in
[Governance](../GOVERNANCE.md) rather than duplicated here.

Contributions are licensed under the project's [MIT License](../LICENSE).

## Getting help

- Browse open [`good first issue`](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  tasks for newcomer-friendly work.
- Use the [issue chooser](https://github.com/RoryGlenn/commitment-issues/issues/new/choose)
  for a bug report, feature request, or question.
- Read [Support](./SUPPORT.md) for troubleshooting and response expectations.
