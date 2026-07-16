# Configuration and Behavior

This page covers the deeper behavior behind `commitment-issues`: what `init` changes, how commit and push checks run, how test discovery works, and which options are available.

For the short install path, start with the [README](../README.md). For terminal
output examples, see the repository's
[message-state gallery](https://github.com/RoryGlenn/commitment-issues/blob/main/docs/message-states.md).

## What `init` changes

`npx --no-install commitment-issues init` updates the consuming repo so the installed package can run from Git hooks:

- wires the pre-commit hook to `commitment-issues precommit`
- wires the pre-push hook to `commitment-issues prepush "$@"`
- wires `commitment-issues commit-msg "$1"` only when optional
  commit-message linting is explicitly enabled
- adds npm scripts for `doctor`, `fix:staged`, `commit:fix`, and direct pre-commit checks
- enables advisory push tests in the active configuration source
- migrates pre-3.0 husky-era wiring (retires the old `core.hooksPath`, removes the generated `.husky` files)
- gitignores `.eslintcache`, `.prettiercache`, and `node_modules/`

Nothing is copied into your repo from the package source. The hooks are plain `.git/hooks` files that call the installed `commitment-issues` bin — no hook manager is involved.

Before changing any file, `init` validates that the `package.json` root and any
existing `scripts` and `precommitChecks` values are JSON objects (not `null`,
arrays, or primitive values). An invalid shape exits with the exact property to
fix and leaves `package.json` unchanged.

Existing custom hooks are considered active only when an executable command
line invokes the expected `commitment-issues` subcommand. Comments,
echo/printf-only messages, assignments, and quoted examples do not count. On
POSIX, the hook file must also have an executable mode bit. `init` and `doctor`
never alter these user-owned hooks; they report the command or `chmod +x`
remediation instead.

## Configuration files and precedence

Configuration can live in either of these repository-root files:

1. `.commitmentrc.json`, with options directly at the top level
2. `package.json`, under the existing `precommitChecks` object
3. built-in defaults for options absent from both files

The standalone file is optional. Existing `package.json` configurations behave
exactly as before when it is absent. When both exist, they are shallowly merged
one key at a time and `.commitmentrc.json` wins. Arrays are replaced, not
concatenated. For example:

```json
{
  "requireTests": false,
  "testExempt": ["generated/**"],
  "tone": "fun"
}
```

Only JSON is supported; JavaScript configuration is deliberately not loaded or
executed. The top-level value must be an object. A recognized but invalid
standalone value still owns its higher-precedence key and is omitted in favor
of the built-in default—it does not silently revive the lower-precedence
`package.json` value.

If the standalone file cannot be parsed or has a non-object root, pre-commit and
pre-push print an advisory warning and fall back to `package.json` or defaults.
`doctor` reports the same problem without breaking `doctor --quiet` during an
install. Mutating commands are stricter: `init` and `uninstall` stop before any
write until the file is fixed or removed.

Hook-time readers also warn when `package.json` cannot be read, contains invalid
JSON, has a non-object root, or provides a non-object `precommitChecks` value.
Valid `.commitmentrc.json` settings remain active; otherwise the hooks use safe
defaults so the malformed manifest can still be repaired in a commit. The
fallback never happens silently.

`init` keeps its backward-compatible default of creating `precommitChecks` in
`package.json`. If `.commitmentrc.json` already exists, it instead adds the
default `advisePushTests` setting there when neither push mode is configured.
Every setup decision, including whether to wire the optional `commit-msg` hook,
uses the merged effective configuration and the same standalone precedence as
the runtime hooks.
`uninstall --dry-run` previews removal of a valid standalone file, and
`uninstall` removes it with the rest of the package-specific configuration.

The examples below use the `package.json` form. The same keys can be moved to
the top level of `.commitmentrc.json` without the `precommitChecks` wrapper.

## Hook output policy

Routine hooks default to `"problems-only"`: `precommit`, `prepush`, and
`commit-msg` suppress final `success` and `info` boxes while continuing to run
every configured check. Warnings and errors always remain visible, and a mixed
result is governed by its strongest final severity. For example, passing tests
plus a protected-branch warning still render together as one warning box.

To restore continuous confirmation, opt into normal output:

```json
{
  "precommitChecks": {
    "hookOutput": "normal"
  }
}
```

The equivalent standalone setting is `{ "hookOutput": "normal" }`.
`hookOutput` changes presentation only: check execution, blocking decisions,
exit codes, configuration diagnostics, and `--json` payloads are unchanged.
It does not apply to operational commands such as `init`, `uninstall`,
`doctor`, `commit-fix`, or `fix-staged`. Use `COMMITMENT_ISSUES=0` when the
entire hook should be bypassed instead.

The once-per-clone pre-commit welcome is intentionally outside
`hookOutput`: it remains visible with the default `"problems-only"` policy.
Projects that require completely silent successful hooks can disable that
onboarding message independently. A warning or error takes priority over the
welcome and leaves it available for a later clean invocation.

## First-commit welcome

The first eligible clean or informational human-readable pre-commit run in a
clone shows a compact Commit Owl welcome as its one final presentation. It
explains that `commitment-issues` is active and asks contributors to report
confusing hook guidance. The setup hint uses the detected package manager, such
as `pnpm run doctor` in a pnpm project.

Warnings and errors always take priority. They render without the welcome and
without creating its marker, so the contributor can still receive onboarding
on a later clean invocation and no command emits two boxes.

After displaying the message, the hook creates the versioned marker
`<git-common-dir>/commitment-issues/welcome-v1`. Keeping it below Git's common
directory leaves the working tree untouched and makes linked worktrees share
one welcome. Existing clones may see the message once after upgrading.

To opt out without changing any checks or enforcement behavior:

```json
{
  "precommitChecks": {
    "showWelcomeOnFirstCommit": false
  }
}
```

JSON mode never displays or consumes the welcome. Marker inspection and write
failures are ignored so onboarding can never block a commit.

## Local peer-tool resolution

Built-in ESLint and Prettier checks resolve the package `bin` only from the
repository's reachable `node_modules` tree. There is no implicit `npx`
fallback. When a peer is missing, commit-time checks report an advisory and the
package-manager-specific install command; fix commands fail nonzero rather than
claiming an incomplete fix succeeded. `doctor` reports the same local state.

This restriction does not replace the executable or configured options in
explicit configuration. A command such as `["npx", "vitest", "run"]`
deliberately opts into npx's own resolution and network behavior. The hook
appends discovered test paths as arguments. For Node's built-in `--test`
runner, those paths are placed after `--`; a leading-hyphen relative path is
made absolute so Node cannot interpret a repository filename as an option.

## What happens on commit and push?

| Action         | Default behavior                                                                            | Stricter option                                                |
| -------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `git commit`   | Reports lint, formatting, missing-test, test, branch, and commit-shape issues               | Enable `runStagedTests` to run staged-related tests            |
| `git push`     | Runs pushed-file tests in advisory mode after `init`; warns when pushing a protected branch | Enable `blockPushOnTestFailure` to stop pushes on test failure |
| commit message | No check until `commitMessage.enabled` is true; then warns on commitlint failures           | Set `commitMessage.blockOnFailure` to stop the commit          |

## Active flow

- The pre-commit hook runs `commitment-issues precommit`.
- Its first eligible clean or informational human-readable run shows the
  default-on, once-per-clone welcome as the final box;
  `showWelcomeOnFirstCommit: false` opts out.
- `scripts/precommit.mjs` inspects staged files and prints one consolidated summary box.
- The pre-push hook runs `commitment-issues prepush "$@"` so Git's remote
  arguments reach first-push base selection.
- `scripts/prepush.mjs` runs tests associated with pushed files in advisory mode by default.
- An enabled commit-msg hook passes Git's message file as one quoted argument to
  `commitment-issues commit-msg`; it stays silent when commitlint succeeds.
- `blockPushOnTestFailure` turns pushed-file test failures into a hard gate.
- When automatic fixes can still be applied safely after a commit, the hook suggests `npm run commit:fix`.
- `npm run fix:staged` applies staged-only ESLint and Prettier fixes directly and restages the result.
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

### Timeout cleanup boundary

Timed commands run in a dedicated process group on Ubuntu/macOS. When the
deadline expires, the whole attached group is force-terminated. Windows uses
the built-in `taskkill /t /f` process-tree operation, with a direct-child kill
as a fallback if tree termination is unavailable. The hook reports a timeout
separately from a spawn failure, external signal, normal nonzero exit, or
success.

Cleanup covers descendants that remain attached to the command's process group
or Windows process tree. A descendant that deliberately daemonizes, reparents,
or creates a separate process group can escape that boundary; the operating
system does not expose one portable, permission-free way to reclaim such a
process. Commands used in hooks should not launch background daemons.

### Using a different test runner

`testCommand` can be any command that accepts test file paths as arguments.
Both the staged-test check and the push gate append the relevant test files to
it. Custom runners receive the configured argv followed by those paths. Node
`--test` commands receive discovered paths after an option separator, with
leading-hyphen paths made absolute. Test commands inherit the normal developer
environment except for Git's repository-local routing variables (`GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, and related values). Removing those hook
variables lets tests rediscover the current checkout by working directory and
prevents nested Git fixtures from targeting the hook caller.

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

## Commit and push guards

Beyond tool checks, the hooks run instant, git-only advisory guards. All of them join the same consolidated suggestions box, never block by default, and skip themselves silently if git cannot answer:

- **Protected branches** — committing to or pushing a branch matching `protectedBranches` (names or globs, default `["main", "master"]`) prints an advisory. Opt into hard blocking with `blockProtectedBranches: true`; bypass a block once with `--no-verify`. Set `protectedBranches: []` to disable entirely (e.g. trunk-based repos).
- **Behind upstream** — committing while the branch is behind its upstream (as of the last fetch) suggests pulling or rebasing first. Disable with `adviseBehindUpstream: false`.
- **Commit size** — commits staging more than `maxCommitFiles` files (default 30) or `maxCommitLines` changed lines (default 2000) get a split-it-up nudge. Set either to `0` to disable.
- **Large files** — staged files over `maxFileSizeMb` (default 5) are listed with a Git LFS pointer. Set to `0` to disable.
- **Generated files** — staged paths matching `generatedPaths` (default: `dist`, `build`, `coverage`, `node_modules`, `.DS_Store`, `__pycache__` anywhere in the tree) are flagged as usually-ignored artifacts. Setting `generatedPaths` replaces the default list.
- **Staged secrets** — lines _added_ by the staged diff are scanned against a curated, high-precision credential set (AWS access keys, private-key headers, GitHub/Slack/npm/Stripe live/Google API tokens, URLs with embedded passwords), and staged dotenv files are flagged (`.env.example`/`.env.sample`/`.env.template` are ignored). Known documentation examples and placeholder passwords (`${DB_PASS}`, `<password>`, `changeme`…) never fire. Opt into hard blocking with `blockOnSecrets: true`; exempt fixture paths with `secretExempt` globs; disable with `scanSecrets: false`. Advisory mode warns and allows the commit if Git cannot produce a valid staged patch. Blocking mode fails closed on a Git launch failure, nonzero result, or malformed patch because possible secrets could not be ruled out. Human and JSON output distinguish an unavailable scan from a detected secret and show `git commit --no-verify` as the one-time bypass. A secret that reached a commit should be rotated even if the commit is stopped.

```json
{
  "precommitChecks": {
    "protectedBranches": ["main", "release/*"],
    "blockProtectedBranches": true,
    "maxCommitFiles": 20,
    "maxFileSizeMb": 2
  }
}
```

## Optional commit-message linting

Commit-message linting is disabled by default and uses the consumer's own
[commitlint](https://commitlint.js.org/) installation and configuration. The
package does not add commitlint as a dependency or supply a built-in
Conventional Commits ruleset.

1. Install the CLI and whichever rules package your project chooses. For
   example:

   ```bash
   npm install -D @commitlint/cli @commitlint/config-conventional
   ```

2. Add a consumer-owned commitlint config. This example is optional; any
   commitlint-supported config with at least one rule is valid:

   ```js
   // commitlint.config.js
   export default { extends: ["@commitlint/config-conventional"] };
   ```

3. Enable the advisory integration:

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

The generated `.git/hooks/commit-msg` body invokes
`commitment-issues commit-msg "$1"`, preserving the message-file path as one
literal argument. If a custom commit-msg hook already exists, `init` and
`doctor` leave it unchanged and show that exact command for manual composition.
Git's `git commit --no-verify` bypasses the hook in the standard way.

Resolution is intentionally local-only: the runner walks upward for
`node_modules/.bin/commitlint`, passes its absolute path and literal argv through
the cross-platform process helper, and never falls back to `npx`, a global
binary, or the network. Yarn Plug'n'Play is
therefore outside this integration's boundary, matching the package's existing
`node_modules` requirement.

| Nested key       | Type    | Default | Description                                                         |
| ---------------- | ------- | ------- | ------------------------------------------------------------------- |
| `enabled`        | boolean | `false` | Create/repair the commit-msg hook and run project-local commitlint. |
| `blockOnFailure` | boolean | `false` | Block on lint, setup, missing-config, or unavailable-tool failures. |

`blockOnFailure` never implies enablement; setting it alone produces a
configuration warning and leaves commit-message linting disabled.

In advisory mode, a lint finding, missing local CLI, missing commitlint config,
unreadable message file, timeout, or launch failure prints a warning and allows
the commit. With `blockOnFailure: true`, the same outcomes exit non-zero. The
runner recognizes both commitlint's missing-config result code and the
strict-mode `empty-rules` diagnostic. It uses `--strict` so warning-level rules
are surfaced instead of disappearing behind exit code 0.
A successful run is silent. `doctor` also warns when
the feature is enabled but the project-local CLI is absent, while still exiting
successfully from install-time `doctor --quiet`.

## Configuration reference

All options are optional and use the same types in either configuration file:

| Key                        | Type                            | Default              | Description                                                                                                    |
| -------------------------- | ------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `testExempt`               | string[]                        | `[]`                 | Glob patterns for files excluded from the missing-test check.                                                  |
| `requireTests`             | boolean                         | `true`               | Set `false` to disable the missing-test check.                                                                 |
| `runStagedTests`           | boolean                         | `false`              | Run tests for staged files at commit time.                                                                     |
| `advisePushTests`          | boolean                         | `true` after `init`  | Run the pushed files' tests at `git push` but only warn. Ignored if `blockPushOnTestFailure` is set.           |
| `blockPushOnTestFailure`   | boolean                         | `false`              | Run the pushed files' tests at `git push` and block on failure.                                                |
| `testCommand`              | string[]                        | `["node", "--test"]` | Executable and options for staged/push tests; discovered paths are appended as argv and must be accepted.      |
| `timeoutMs`                | number                          | `120000`             | Max runtime before a spawned command and its attached process tree are terminated; maximum `2,147,483,647` ms. |
| `tone`                     | `"standard"` or `"fun"`         | `"standard"`         | Output tone for advisory pre-commit messages.                                                                  |
| `hookOutput`               | `"problems-only"` or `"normal"` | `"problems-only"`    | Suppress final success/info hook boxes, or preserve every human-readable hook state.                           |
| `showWelcomeOnFirstCommit` | boolean                         | `true`               | Show the Commit Owl onboarding message once per clone; set `false` for completely silent successful hooks.     |
| `protectedBranches`        | string[]                        | `["main", "master"]` | Branch names or globs that trigger the protected-branch advisory on commit and push. `[]` disables.            |
| `blockProtectedBranches`   | boolean                         | `false`              | Block (instead of warn about) commits and pushes to protected branches.                                        |
| `adviseBehindUpstream`     | boolean                         | `true`               | Warn at commit time when the branch is behind its upstream (as of the last fetch).                             |
| `maxCommitFiles`           | number                          | `30`                 | Warn when a commit stages more than this many files. `0` disables.                                             |
| `maxCommitLines`           | number                          | `2000`               | Warn when a commit changes more than this many lines. `0` disables.                                            |
| `maxFileSizeMb`            | number                          | `5`                  | Warn when a staged file exceeds this size in MB. `0` disables.                                                 |
| `generatedPaths`           | string[]                        | build-artifact globs | Globs flagged as generated files when staged. Replaces the default list.                                       |
| `scanSecrets`              | boolean                         | `true`               | Scan added staged lines and dotenv files for likely credentials.                                               |
| `blockOnSecrets`           | boolean                         | `false`              | Block on a secret finding or when the staged patch cannot be safely inspected.                                 |
| `secretExempt`             | string[]                        | `[]`                 | Glob patterns excluded from the secrets scan (e.g. test fixtures).                                             |
| `commitMessage`            | object                          | disabled             | Optional project-local commitlint integration; see the nested keys above.                                      |

Unrecognized configuration keys, including nested `commitMessage` keys, are ignored and named with their effective source in diagnostics from hooks, `init`, and `doctor` — so typos like `requireTest` or `commitMessage.enable` cannot silently disable, enable, or enforce a check.

Recognized keys with the wrong value type (for example a string where a boolean is expected, or an out-of-range `timeoutMs`) are likewise ignored and fall back to their defaults, and the hooks print a one-line warning naming each invalid value — so a mistyped value cannot silently change behavior either. Both warnings are advisory only: the commit or push still proceeds.

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

- `scripts/cli.mjs` — the `commitment-issues` bin; dispatches subcommands: `init`, `doctor`, `precommit`, `prepush`, `commit-msg`, `commit-fix`, `fix-staged`, and `fix-staged-js`.
- `scripts/precommit.mjs` — the pre-commit hook entrypoint.
- `scripts/commit-msg.mjs` — the optional advisory-or-blocking commitlint entrypoint.
- `scripts/init.mjs` — one-command setup for a consuming repo.
- `scripts/prepush.mjs` — the advisory-by-default pre-push test runner; can become a blocking gate through configuration.
- `scripts/doctor.mjs` — verifies and repairs the hook wiring.
- `scripts/fix-staged.mjs` — applies staged-only ESLint/Prettier fixes and restages the result.
- `scripts/fix-staged-js.mjs` — file-list fixer task: ESLint fix followed by Prettier write.
- `scripts/commit-fix.mjs` — applies automatic fixes to the latest clean commit and amends it in place.
- `scripts/lib/` — shared helpers for UI, spawning, file heuristics, output parsing, advisory messages, and config loading.

## Continuous integration

These scripts are Git-hook tooling, so set `COMMITMENT_ISSUES=0` in CI to skip hook runs.

This project's own workflow runs `npm ci`, `npm run lint`, `npm run format:check`, and `npm test` on Node 22.11.0 and 24 across Ubuntu, macOS, and Windows. `npm run test:coverage` measures the explicitly scoped user-facing runtime and enforces 100% line, branch, and function coverage on both Node lines. Packed npm, pnpm, Yarn Classic 1.22.22, Yarn Berry 4.17.0 `node-modules`, and Bun lifecycle integration remains a separately named pass/fail gate; the non-npm managers run on all three OSes at Node 24 and at the exact Node floor on Ubuntu. See the [compatibility matrix](compatibility.md) and [runtime coverage policy](branch-coverage.md) for the exact boundaries, badge freshness rule, and rationale.

For ready-to-use pipelines, see the [CI provider recipes](ci-recipes.md) for GitHub Actions, GitLab CI, and CircleCI.
