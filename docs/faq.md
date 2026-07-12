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

ESLint and Prettier are resolved only from the project's installed
`node_modules`. A missing peer tool produces an advisory with the detected
package manager's install command; hooks do not ask `npx` to fetch it.

Successful and no-op hook results are quiet by default. Warning and error boxes
still appear, including mixed results whose strongest severity is a warning or
error. The checks still run and communicate success through exit status `0`.

## How do I show successful hook messages?

Set `hookOutput` to `"normal"`:

```json
{
  "precommitChecks": {
    "hookOutput": "normal"
  }
}
```

Use the same key at the top level of `.commitmentrc.json` if you use the
standalone configuration. `"problems-only"` is the default. Neither value
changes check execution, blocking, exit codes, JSON payloads, or output from
`init`, `uninstall`, `doctor`, and the explicit fix commands.

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

Optional commit-message failures block only when both
`commitMessage.enabled` and `commitMessage.blockOnFailure` are `true`.

The fix commands can still fail when they cannot run safely or when manual fixes
remain. That is separate from the default commit and push hook behavior.

## Why is it advisory-first instead of blocking by default?

A newly installed hook should not unexpectedly stop an established commit or
push workflow. Advisory mode lets a team observe the findings, tune its
configuration and exemptions, and decide which checks are reliable enough to
enforce before enabling individual blocking options.

The warnings also never trigger an automatic rewrite. Fixes remain separate,
explicit commands with their own safety checks. Local hooks shorten the feedback
loop; CI remains the authoritative shared gate.

## Can developers bypass it with `--no-verify`?

Yes. Git's standard `git commit --no-verify` bypasses the commit hooks once, and
`git push --no-verify` bypasses the pre-push hook once. This escape hatch is
deliberate, and `commitment-issues` does not try to conceal or defeat normal Git
behavior.

Rules that must not be bypassable on a developer machine belong in CI, branch
protection, or another server-side control. A local blocking option is useful
for immediate feedback, but it is not an organization-wide security boundary.

## What does `init` change?

`npx commitment-issues init` updates the consuming project so the installed
package can run from Git hooks. It can:

- add or update npm scripts for `doctor`, `fix:staged`, `commit:fix`, and
  `test:precommit`
- add `advisePushTests` to an existing `.commitmentrc.json`, or add
  `precommitChecks.advisePushTests` to `package.json` when no standalone file
  exists and no push-test mode is configured
- add `commitment-issues doctor --quiet` as `prepare`, or append it after the
  project-owned `prepare` command, so hook wiring self-heals on install
- create `.git/hooks/pre-commit` and `.git/hooks/pre-push` when they are
  missing (existing hook files are never overwritten)
- create `.git/hooks/commit-msg` only when `commitMessage.enabled` is `true`
  (custom commit-msg hooks are preserved like every other custom hook)
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

## Can configuration live outside package.json?

Yes. Put the same option names directly in a repository-root
`.commitmentrc.json`. It is parsed as JSON only—JavaScript config files are not
executed. When both sources exist, standalone keys override matching
`package.json` `precommitChecks` keys and unmatched package keys remain active.
See [Configuration files and precedence](configuration.md#configuration-files-and-precedence)
for malformed-file fallback and validation details.

## How do I enable commit-message linting?

Bring your own commitlint installation and rules. For example:

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

```js
// commitlint.config.js
export default { extends: ["@commitlint/config-conventional"] };
```

Then enable advisory feedback:

```json
{
  "precommitChecks": {
    "commitMessage": {
      "enabled": true,
      "blockOnFailure": false
    }
  }
}
```

Run `npx commitment-issues init` or `npm run doctor` after enabling it so the
native commit-msg hook is created. Set `blockOnFailure` to `true` only after the
team trusts the rules. The runner uses project-local
`node_modules/.bin/commitlint` only—never implicit `npx`, a global install, or
the network—and it never substitutes a built-in Conventional Commits policy.
Missing CLI/config and lint failures warn in advisory mode and block in blocking
mode. `git commit --no-verify` remains the explicit one-time bypass.

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

## Can `init` or a fix command overwrite existing work?

`init` does not rewrite source files or overwrite an unrecognized custom hook.
Use `npx commitment-issues init --dry-run` to inspect its proposed package,
configuration, ignore-file, and hook changes first. It replaces hook or script
wiring only when that wiring exactly matches a generated form it owns.

The explicitly invoked fix commands do modify their target files. `fix:staged`
refuses partially staged files rather than risk mixing staged and unstaged work.
`commit:fix` refuses tracked working-tree changes and commits that have already
been pushed. If ownership or a safe mutation cannot be proven, the command
stops and reports the manual next step.

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

`testCommand` is explicit user intent and runs exactly as configured. The `npx`
examples above may use npx's normal package-resolution behavior. Install the
runner locally or use `npx --no-install`/`--offline` as supported by your npx
version when the hook must remain network-isolated.

## Will a hook download ESLint or Prettier if one is missing?

No. Built-in ESLint and Prettier checks resolve only project-local package bins.
If one is absent, the commit check remains advisory and names the missing tool
plus the correct npm, pnpm, Yarn, or Bun dev-install command. `doctor` reports
the same condition. Fix commands exit nonzero because they cannot safely claim
the requested fix completed.

Explicitly configured commands are a separate trust boundary. For example,
`testCommand: ["npx", "vitest", "run"]` is preserved as written and opts into
npx's behavior.

## Does it collect telemetry, upload code, or make runtime network requests?

No. The package does not add telemetry, transmit repository contents, store
credentials, or provide a network service. Its hooks inspect local Git and
project state and run local tools.

Installing packages and performing the underlying `git push` can naturally use
the network. An explicitly configured command can also have its own network
behavior; for example, a `testCommand` beginning with `npx` opts into that
executable's normal resolution behavior. See the
[security assurance case](security/assurance-case.md) for the complete boundary.

## What is the trust boundary for configured commands?

Configuration is read from JSON, validated, and never imported as JavaScript.
Built-in ESLint, Prettier, and optional commitlint integrations resolve only
project-local executables and receive argument arrays without shell
interpolation.

`testCommand` is different: it is an explicit, repository-owned command array
that runs exactly as configured, without a shell. Its executable still runs with
the developer's permissions and can have behavior of its own. Review the
configuration and installed tools before running hooks in an unfamiliar
repository, just as you would review its package scripts.

## Does it support TypeScript?

Yes. TypeScript extensions such as `.ts`, `.tsx`, `.mts`, and `.cts` are treated
as code files. Linting still delegates to your project's ESLint configuration, so
TypeScript projects need a TypeScript-aware ESLint parser and config.

Declaration files such as `.d.ts` are excluded from the missing-test check.

## Can I use it outside JavaScript or TypeScript, or without Node.js?

The supported v3 product boundary is JavaScript and TypeScript projects running
Node.js. Some repository guards are language-neutral, but installation, hook
execution, local tool discovery, and the lint/format integrations currently
assume a Node project and `node_modules/.bin`.

A standalone, language-neutral executable is being explored in
[#84](https://github.com/RoryGlenn/commitment-issues/issues/84), but it is not a
capability or compatibility promise for the current release.

## Which package managers work?

`commitment-issues` works with npm, pnpm, yarn, and bun. It detects the package
manager and prints matching command hints, such as `pnpm run commit:fix` in a
pnpm project.

Yarn Berry projects should use `nodeLinker: node-modules`. Plug'n'Play is not
supported because the hooks resolve binaries from `node_modules/.bin`. See the
[Yarn Berry guide](yarn-berry.md) for step-by-step setup.

## Which shells and GUI Git clients are currently supported?

The main test and npm lifecycle matrix runs on Ubuntu, macOS, and Windows with
the supported Node.js versions; pnpm, Yarn, and Bun lifecycle jobs run on
Ubuntu. Generated hooks are POSIX `sh` scripts; Git for Windows runs them
through its bundled shell, so the interactive shell that launched Git does not
interpret the hook body. Node.js and the project's local binary still need to
be reachable in the environment Git receives.

Dedicated black-box coverage for Bash, Zsh, Fish, PowerShell, Command Prompt,
VS Code Source Control, JetBrains IDEs, and GitHub Desktop is not complete. That
work is tracked in [#83](https://github.com/RoryGlenn/commitment-issues/issues/83),
so the project does not yet make a blanket compatibility claim for every GUI
client and launch environment.

## Does it work in a monorepo or workspaces?

Yes. Install and initialize `commitment-issues` once at the repository root. The
Git hooks run from the root and check staged files across every workspace
package using the root `precommitChecks` configuration and the tools hoisted to
the root `node_modules/.bin`.

The lifecycle matrix covers npm, pnpm, Yarn, and Bun with both shallow and
nested packages, plus fresh clones and linked Git worktrees. Install
dependencies separately in each linked worktree; the worktrees share the
repository's native hooks.

Per-package `precommitChecks` configuration and per-package tool versions are not
supported. See the [Monorepo & workspaces guide](monorepo.md) for setup, scoping,
and the boundary details.

## Are there framework-specific recipes?

Yes. `commitment-issues` is framework-agnostic — it uses your ESLint config and a
configurable `testCommand` — so setup mostly comes down to wiring those per
stack. See the [Framework recipes](framework-recipes.md) for Next.js, Vite, and
TypeScript library setups.

## Should I use this in CI?

Use CI for the real enforcement path. Local hooks can be bypassed, missing, or
run in a different environment, so they improve the developer feedback loop but
cannot replace a shared gate. Run your normal lint, format, and test commands
directly in the workflow.

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
to run alongside your existing behavior. Put it on an executable command line;
a comment, `echo`/`printf` message, or quoted example is intentionally not
treated as wiring. On POSIX, also make the hook executable, for example:

```bash
chmod +x .git/hooks/pre-commit .git/hooks/pre-push
```

For a custom commit-msg hook, preserve Git's message file as one argument:

```sh
commitment-issues commit-msg "$1"
```

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

## How can I verify the published package and its provenance?

Follow the [release verification guide](release-verification.md). It uses
supported npm signature and attestation commands, compares the npm and GitHub
release tarballs, and verifies that the attached SLSA provenance names the same
artifact digest and source tag.

Releases are produced from version tags through trusted npm publishing. For
v3.3.2 and later releases produced by the current workflow, the GitHub Release
contains the exact packed tarball plus its `.intoto.jsonl` provenance asset so
both distribution paths can be checked against the same bytes.

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
`precommitChecks` configuration block, and exact generated native hook bodies,
including an owned optional commit-msg hook.
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

## Why does it require Node.js 22.11.0 or newer?

The package uses modern ESM behavior and the built-in `node --test` runner by
default. Node.js 22.11.0, the first Node 22 LTS release, is the minimum exercised
by the CI matrix; Node 24 is tested as well. Older runtimes are outside the
supported and release-tested range.
