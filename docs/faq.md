# FAQ

Answers to common questions about installing, adopting, and configuring
`commitment-issues`.

## Is `commitment-issues` a replacement for Husky or lint-staged?

Yes, for the workflow it covers. `commitment-issues` writes plain `.git/hooks`
files itself (no hook manager) and applies staged-file ESLint/Prettier fixes
directly (no lint-staged), adding the opinionated setup, advisory-first
output, safe fix helpers, pushed-file test checks, and `doctor` repair command
on top. Versions before 3.0 wrapped husky and lint-staged; `init` migrates
that wiring automatically.

## What does it do by default?

After `npx commitment-issues init`, commits run lint, format, and missing-test
checks against staged project files. The commit still continues when issues are
found.

Pushes run tests associated with pushed files in advisory mode when matching
files exist. If those tests fail, the push still continues and a warning is
printed.

## When does it block anything?

Commit-time checks are advisory and exit successfully by default. Push-time test
failures only block when `blockPushOnTestFailure` is enabled:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true
  }
}
```

The fix commands can still fail when they cannot run safely or when manual fixes
remain. That is separate from the default commit and push hook behavior.

## What does `init` change?

`npx commitment-issues init` updates the consuming project so the installed
package can run from Git hooks. It can:

- add or update npm scripts for `doctor`, `fix:staged`, `commit:fix`, and
  `test:precommit`
- add `precommitChecks.advisePushTests` when no push-test mode is configured
- add `commitment-issues doctor --quiet` as `prepare`, or append it after the
  project-owned `prepare` command, so hook wiring self-heals on install
- create `.git/hooks/pre-commit` and `.git/hooks/pre-push` when they are
  missing (existing hook files are never overwritten)
- migrate a pre-3.0 setup: retire the husky-era `core.hooksPath` and remove
  the `.husky` wiring this tool generated (user-authored `.husky` hooks are
  kept and reported)
- add cache and dependency ignores such as `.eslintcache`, `.prettiercache`, and
  `node_modules/`

The composition uses `&&`, so repair runs only after the project's existing
setup succeeds. This also works with Yarn Classic, which does not run an npm-style
`postprepare` lifecycle.

It does not vendor package source into your repo. The hooks call the installed
`commitment-issues` binary from `node_modules/.bin`.

## Is it safe to run `init` more than once?

Yes. `init` is idempotent. Re-running it repairs missing setup and leaves healthy
setup alone.

## Will it change my code automatically?

The commit and push hooks report problems by default; they do not rewrite files
or commits automatically.

Automatic changes happen only when you run a fix command:

```bash
npm run fix:staged
npm run commit:fix
```

`fix:staged` runs ESLint and Prettier fixes on staged files and restages the
result. `commit:fix` fixes files
from the latest commit and amends that commit only when the latest commit has not
already been pushed and the working tree is safe.

## Why did `fix:staged` refuse to run?

`fix:staged` refuses when a file has both staged and unstaged changes. That is
intentional: automatically rewriting a partially staged file can accidentally
stage unrelated work or lose the boundary between what you meant to commit and
what you were still editing.

Commit, stash, discard, or split the unstaged changes first, then retry.

## Why did `commit:fix` refuse to amend?

`commit:fix` refuses when amending could be unsafe. Common reasons include:

- the latest commit has already been pushed
- tracked staged or unstaged changes exist
- Git cannot inspect the current repository state
- automatic fixes ran, but remaining issues still need manual attention

When the latest commit has already been pushed, make a new fix commit instead of
rewriting published history.

## How are matching tests discovered?

For a changed source file, `commitment-issues` looks for a matching test:

- next to the source file
- in an adjacent `__tests__/` directory
- in a top-level `test/` or `tests/` directory

For example, `src/foo.ts` can be satisfied by `test/foo.test.ts`.

## How do I silence a false missing-test warning?

For one-off paths, add `testExempt` globs:

```json
{
  "precommitChecks": {
    "testExempt": ["src/legacy/**", "**/*.pb.ts"]
  }
}
```

To disable the missing-test check entirely, set `requireTests` to `false`:

```json
{
  "precommitChecks": {
    "requireTests": false
  }
}
```

## Does it run tests on every commit?

Not by default. The commit hook checks whether staged source files have matching
tests, but it does not run those tests unless you enable `runStagedTests`:

```json
{
  "precommitChecks": {
    "runStagedTests": true
  }
}
```

Push-time tests are enabled in advisory mode by `init` through
`advisePushTests`.

## How do I use Jest, Vitest, or another test runner?

Set `testCommand` to a command that accepts test file paths as arguments.

Vitest:

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "vitest", "run"]
  }
}
```

Jest:

```json
{
  "precommitChecks": {
    "testCommand": ["npx", "jest"]
  }
}
```

The same `testCommand` is used for staged tests and push-time tests.

## Does it support TypeScript?

Yes. TypeScript extensions such as `.ts`, `.tsx`, `.mts`, and `.cts` are treated
as code files. Linting still delegates to your project's ESLint configuration, so
TypeScript projects need a TypeScript-aware ESLint parser and config.

Declaration files such as `.d.ts` are excluded from the missing-test check.

## Which package managers work?

`commitment-issues` works with npm, pnpm, yarn, and bun. It detects the package
manager and prints matching command hints, such as `pnpm run commit:fix` in a
pnpm project.

Yarn Berry projects should use `nodeLinker: node-modules`. Plug'n'Play is not
supported because the hooks resolve binaries from `node_modules/.bin`. See the
[Yarn Berry guide](yarn-berry.md) for step-by-step setup.

## Does it work in a monorepo or workspaces?

Yes. Install and initialize `commitment-issues` once at the repository root. The
Git hooks run from the root and check staged files across every workspace
package using the root `precommitChecks` configuration and the tools hoisted to
the root `node_modules/.bin`.

Per-package `precommitChecks` configuration and per-package tool versions are not
supported. See the [Monorepo & workspaces guide](monorepo.md) for setup, scoping,
and the boundary details.

## Are there framework-specific recipes?

Yes. `commitment-issues` is framework-agnostic — it uses your ESLint config and a
configurable `testCommand` — so setup mostly comes down to wiring those per
stack. See the [Framework recipes](framework-recipes.md) for Next.js, Vite, and
TypeScript library setups.

## Should I use this in CI?

Use CI for the real enforcement path: run your normal lint, format, and test
commands directly in the workflow.

`commitment-issues` is Git-hook tooling. In CI, set `COMMITMENT_ISSUES=0` to
skip the hooks when needed and run explicit commands such as:

```bash
npm run lint
npm run format:check
npm test
```

See the [CI provider recipes](ci-recipes.md) for ready-to-use GitHub Actions,
GitLab CI, and CircleCI examples.

## How do I repair hook wiring?

Run:

```bash
npm run doctor
```

`doctor` verifies the git hook wiring and repairs missing pieces without
overwriting custom hooks it cannot safely own.

## What if I already have custom Git hooks?

`commitment-issues` avoids clobbering custom hook files. If a hook already exists
and is not one of the known legacy generated hooks, `doctor` reports that the
hook is not wired and leaves it alone.

Add the `commitment-issues` command to the custom hook manually when you want it
to run alongside your existing behavior.

## How do I make the output more playful?

Set `tone` to `"fun"`:

```json
{
  "precommitChecks": {
    "tone": "fun"
  }
}
```

This only changes advisory message text. It does not change exit codes, safety
checks, automatic fixes, push behavior, or blocking behavior.

## How do I see every output state?

See [Message states](message-states.md) for the full gallery of pre-commit,
fixer, pre-push, and `doctor` output examples.

## How do I remove it?

Preview the cleanup first:

```bash
npx commitment-issues uninstall --dry-run
```

Then remove the generated setup while the package is still installed:

```bash
npx commitment-issues uninstall
```

The uninstaller removes exact generated package scripts, the
`precommitChecks` configuration block, and exact generated native hook bodies.
It preserves customized scripts and hooks and reports any command that needs
manual removal. It also preserves shared `.gitignore` entries, ESLint,
Prettier, the package dependency, and the lockfile because the project may own
those independently.

Finish by removing the dependency with your package manager:

```bash
npm remove commitment-issues
```

Run the commands in that order so the installed binary can remove its generated
`prepare` command or repair suffix before the package is removed.

## Why does it require Node.js 22.22.1 or newer?

The package uses modern ESM behavior and the built-in `node --test` runner by
default. Node.js 22.22.1 is the minimum Node 22 release exercised by the CI
matrix; Node 24 is tested as well. Older runtimes are outside the supported and
release-tested range.
