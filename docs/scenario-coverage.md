# Scenario Coverage

This tracker turns the exhaustive scenario list into an implementation plan. It should be updated whenever a scenario is covered, deferred, or intentionally left manual.

## Status values

| Status | Meaning |
| --- | --- |
| Covered | Automated coverage exists and is expected to run in CI. |
| Partial | Some coverage exists, but important variants remain. |
| Not covered | No meaningful automated coverage yet. |
| Manual | Best validated manually for now. |
| Deferred | Intentionally not implemented yet. |
| Not applicable | Out of scope for this package. |

## Coverage map

| ID | Scenario | Area | Status | Test type | File / location | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-001 | package metadata stays consistent with lockfile | package publishing | Covered | unit | `test/metadata.test.mjs` | Guards package-lock drift. |
| PKG-002 | package README documents the Node engine | package publishing | Covered | unit | `test/metadata.test.mjs` | Guards README / engine drift. |
| PKG-003 | package description does not contradict configurable blocking | package publishing | Covered | unit | `test/metadata.test.mjs` | Guards positioning drift. |
| PKG-004 | package `files` entries exist | package publishing | Covered | unit | `test/metadata.test.mjs` | Guards missing packaged entries. |
| PKG-005 | package bin works from packed tarball across OS / Node matrix | package publishing | Covered | CI smoke | `.github/workflows/ci.yml` | Uses `npm pack`, install tarball, run `commitment-issues --help`. |
| PATH-001 | POSIX paths normalize correctly | path normalization | Covered | unit | `test/path-normalization.test.mjs` | Dedicated path suite. |
| PATH-002 | Windows backslash paths normalize correctly | path normalization | Covered | unit | `test/path-normalization.test.mjs` | Dedicated path suite. |
| PATH-003 | mixed separators normalize correctly | path normalization | Covered | unit | `test/path-normalization.test.mjs` | Dedicated path suite. |
| PATH-004 | spaces and Unicode survive path normalization | path normalization | Covered | unit | `test/path-normalization.test.mjs` | Dedicated path suite. |
| PATH-005 | equivalent test paths dedupe after normalization | path normalization | Covered | unit | `test/path-normalization.test.mjs` | Dedicated path suite. |
| DOC-001 | README avoids unconditional non-blocking claims | docs drift | Covered | unit | `test/metadata.test.mjs` | Allows advisory positioning without denying opt-in blocking. |
| DOC-002 | README documents advisory push mode | docs drift | Covered | unit | `test/metadata.test.mjs` | Required section: `## Advisory push tests (default)`. |
| DOC-003 | README documents blocking push mode | docs drift | Covered | unit | `test/metadata.test.mjs` | Required section: `## Blocking pushes on test failure (opt-in)`. |
| CFG-001 | valid `precommitChecks` loads | config | Covered | unit | `test/config.test.mjs` | Baseline config loading. |
| CFG-002 | missing `package.json` degrades to `{}` | config | Covered | unit | `test/config.test.mjs` | Defensive config behavior. |
| CFG-003 | invalid JSON degrades to `{}` | config | Covered | unit | `test/config.test.mjs` | Defensive config behavior. |
| CFG-004 | missing `precommitChecks` degrades to `{}` | config | Covered | unit | `test/config.test.mjs` | Defensive config behavior. |
| CFG-005 | malformed `precommitChecks` containers are ignored | config | Covered | fuzz unit | `test/config.test.mjs` | Includes `null`, booleans, strings, numbers, and arrays. |
| CFG-006 | malformed option values inside object are tolerated | config | Covered | fuzz unit | `test/config.test.mjs` | Consumers validate their own options. |
| CLI-001 | `commitment-issues --help` exits 0 | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-002 | `commitment-issues -h` exits 0 | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-003 | no command prints usage and exits 1 | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-004 | unknown command exits 1 | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-005 | `doctor` dispatches through the bin | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-006 | `precommit` dispatches through the bin | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing CLI smoke. |
| CLI-007 | extra args forward to subcommands | CLI | Covered | subprocess | `test/cli.test.mjs` | Existing `doctor --quiet` test. |
| CLI-008 | `init` dispatches through the bin | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-009 | `prepush` dispatches through the bin | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-010 | `commit-fix` dispatches through the bin | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-011 | `fix-staged` dispatches through the bin | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-012 | `fix-staged-js` dispatches through the bin | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-013 | command runs from project root | CLI | Partial | subprocess | multiple tests | Most tests run from root. |
| CLI-014 | command runs from subdirectory | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-015 | command runs outside Git repo | CLI | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| CLI-016 | shell-sensitive command tokens are not shell-expanded by the CLI wrapper | CLI / safety | Not covered | subprocess | `test/cli.test.mjs` | Batch 1 target. |
| INIT-001 | init wires hooks, scripts, config and is idempotent | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-002 | init upgrades legacy vendored setup | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-003 | init preserves explicit push blocking config | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-004 | init leaves customized hooks untouched | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-005 | init errors when package.json is missing | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-006 | init creates `.gitignore` when absent | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| INIT-007 | init appends cache ignores with no trailing newline | init | Covered | fixture | `test/init.test.mjs` | Existing fixture coverage. |
| PM-001 | npm package manager compatibility | package manager | Covered | CI/local | npm CI + npm pack | npm is the supported path today. |
| PM-002 | pnpm package manager compatibility | package manager | Deferred | smoke | TBD | Document support boundary first. |
| PM-003 | yarn classic compatibility | package manager | Deferred | smoke | TBD | Document support boundary first. |
| PM-004 | yarn berry compatibility | package manager | Deferred | smoke | TBD | Document support boundary first. |
| PM-005 | bun compatibility | package manager | Deferred | smoke | TBD | Document support boundary first. |
| MONO-001 | workspace root behavior | monorepo | Deferred | fixture | TBD | Deferred until workspace support boundary is explicit. |
| MONO-002 | nested workspace package behavior | monorepo | Deferred | fixture | TBD | Deferred until workspace support boundary is explicit. |
| SEC-001 | paths with spaces are passed as argv | security / safety | Partial | unit | `test/process.test.mjs` | Process helper covers a space-containing arg. Add command-level tests later. |
| SEC-002 | paths with quotes are passed safely | security / safety | Not covered | subprocess | TBD | Later safety batch. |
| SEC-003 | paths with semicolons are passed safely | security / safety | Not covered | subprocess | TBD | Later safety batch. |
| SEC-004 | paths with Unicode are passed safely | security / safety | Partial | path unit | `test/path-normalization.test.mjs` | Needs command-level safety later. |
| PERF-001 | timeout is enforced | performance | Covered | fixture | precommit / prepush tests | Existing timeout coverage. |
| PERF-002 | many files performance | performance | Deferred | performance smoke | TBD | Add only after behavior matrix is stable. |
| LIFE-001 | user installs and immediately commits | user lifecycle | Partial | fixture/manual | init + precommit tests | Needs full install smoke in external repo. |
| LIFE-002 | user installs and immediately pushes | user lifecycle | Partial | fixture/manual | init + prepush tests | Needs full install smoke in external repo. |
| LIFE-003 | advisory-only forever | user lifecycle | Covered | fixture/docs | README + prepush tests | Default/advisory behavior is covered. |
| LIFE-004 | blocking on push | user lifecycle | Covered | fixture/docs | README + prepush tests | `blockPushOnTestFailure` covered. |

## Next batches

### Batch 1: CLI command matrix

- Cover remaining subcommand dispatch: `init`, `prepush`, `commit-fix`, `fix-staged`, `fix-staged-js`.
- Cover running from a subdirectory.
- Cover running outside a Git repo / Node project enough to prove the CLI wrapper itself still dispatches and reports cleanly.
- Cover shell-sensitive command tokens at the CLI-wrapper level.

### Batch 2: init / install fixture matrix

- Existing custom pre-commit hook.
- Existing custom pre-push hook.
- Existing prepare script.
- Existing lint-staged object syntax.
- Existing lint-staged array syntax.
- Invalid package.json.
- Read-only package.json / `.gitignore` where practical.

### Batch 3: safety path matrix

- Spaces.
- Quotes.
- Semicolons.
- Unicode.
- Windows backslashes.
- Glob characters.
- Newlines if Git and the platform can create the filename reliably.

### Batch 4: deferred support boundaries

- pnpm / yarn / bun.
- Monorepo root/package fixtures.
- Exact minimum Node version.
- Release-from-tag / release-from-CI workflows.
