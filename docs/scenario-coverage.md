# Scenario Coverage

This tracker turns the exhaustive scenario list into an implementation plan. Update it whenever a scenario is covered, deferred, or intentionally left manual.

## Status values

- **Covered** — automated coverage exists and is expected to run in CI.
- **Partial** — some coverage exists, but important variants remain.
- **Not covered** — no meaningful automated coverage yet.
- **Manual** — best validated manually for now.
- **Deferred** — intentionally not implemented yet.
- **Not applicable** — out of scope for this package.

## Covered

### Package publishing

- **PKG-001** — package metadata stays consistent with lockfile. Unit: `test/metadata.test.mjs`.
- **PKG-002** — package README documents the Node engine. Unit: `test/metadata.test.mjs`.
- **PKG-003** — package description does not contradict configurable blocking. Unit: `test/metadata.test.mjs`.
- **PKG-004** — package `files` entries exist. Unit: `test/metadata.test.mjs`.
- **PKG-005** — package bin works from packed tarball across OS / Node matrix. CI smoke: `.github/workflows/ci.yml`.
- **PKG-006** — README relative image assets, including HTML `<img>` sources, exist and are included in package `files`. Unit: `test/metadata.test.mjs`.
- **PKG-007** — package includes README gallery assets and docs in the tarball. Manual: `npm pack --dry-run`.
- **PKG-008** — published npm package installs and exposes the CLI bin. Manual: fresh temp project with `npm install -D commitment-issues@latest` and `npx commitment-issues --help`.
- **PKG-009** — exact minimum supported Node version runs the full CI matrix. CI: `.github/workflows/ci.yml`.

### Path normalization

- **PATH-001** — POSIX paths normalize correctly. Unit: `test/path-normalization.test.mjs`.
- **PATH-002** — Windows backslash paths normalize correctly. Unit: `test/path-normalization.test.mjs`.
- **PATH-003** — mixed separators normalize correctly. Unit: `test/path-normalization.test.mjs`.
- **PATH-004** — spaces and Unicode survive path normalization. Unit: `test/path-normalization.test.mjs`.
- **PATH-005** — equivalent test paths dedupe after normalization. Unit: `test/path-normalization.test.mjs`.

### Docs drift

- **DOC-001** — README avoids unconditional non-blocking claims. Unit: `test/metadata.test.mjs`.
- **DOC-002** — README documents advisory push mode. Unit: `test/metadata.test.mjs`.
- **DOC-003** — README documents blocking push mode. Unit: `test/metadata.test.mjs`.
- **DOC-004** — README image references cannot drift away from packaged assets. Unit: `test/metadata.test.mjs`.
- **DOC-005** — supported Node version stays consistent across the README, docs, and workflows. Unit: `test/metadata.test.mjs`.

### Config

- **CFG-001** — valid `precommitChecks` loads. Unit: `test/config.test.mjs`.
- **CFG-002** — missing `package.json` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-003** — invalid JSON degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-004** — missing `precommitChecks` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-005** — malformed `precommitChecks` containers are ignored. Fuzz unit: `test/config.test.mjs`.
- **CFG-006** — malformed option values inside an object are tolerated. Fuzz unit: `test/config.test.mjs`.
- **CFG-007** — nested `commitMessage` keys are allowlisted, sanitized, typo-diagnosed, and disabled unless `enabled: true`. Unit: `test/config.test.mjs`.

### CLI command matrix

- **CLI-001** — `commitment-issues --help` exits 0. Subprocess: `test/cli.test.mjs`.
- **CLI-002** — `commitment-issues -h` exits 0. Subprocess: `test/cli.test.mjs`.
- **CLI-003** — no command prints usage and exits 1. Subprocess: `test/cli.test.mjs`.
- **CLI-004** — unknown command exits 1. Subprocess: `test/cli.test.mjs`.
- **CLI-005** — `doctor` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-006** — `precommit` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-007** — extra args forward to subcommands. Subprocess: `test/cli.test.mjs`.
- **CLI-008** — `init` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-009** — `prepush` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-010** — `commit-fix` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-011** — `fix-staged` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-012** — `fix-staged-js` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-013** — command runs from project root. Subprocess: `test/cli.test.mjs` and other fixture tests.
- **CLI-014** — command runs from a subdirectory. Subprocess: `test/cli.test.mjs`.
- **CLI-015** — CLI help and subcommand error reporting work outside a Git repo / Node project. Subprocess: `test/cli.test.mjs`.
- **CLI-016** — shell-sensitive command tokens are not shell-expanded by the CLI wrapper. Subprocess: `test/cli.test.mjs`.
- **CLI-017** — `uninstall` dispatches through the bin. Subprocess: `test/cli.test.mjs`.
- **CLI-018** — `commit-msg` dispatches through the bin and preserves its message-file argument. Subprocess: `test/cli.test.mjs`.

### Init

- **INIT-001** — init wires hooks, scripts, config, and is idempotent. Fixture: `test/init.test.mjs`.
- **INIT-002** — init upgrades legacy vendored setup. Fixture: `test/init.test.mjs`.
- **INIT-003** — init preserves explicit push blocking config. Fixture: `test/init.test.mjs`.
- **INIT-004** — init leaves customized pre-commit and pre-push hooks untouched. Fixture: `test/init.test.mjs`.
- **INIT-005** — init errors when `package.json` is missing. Fixture: `test/init.test.mjs`.
- **INIT-006** — init creates `.gitignore` when absent. Fixture: `test/init.test.mjs`.
- **INIT-007** — init appends cache ignores with no trailing newline. Fixture: `test/init.test.mjs`.
- **INIT-008** — init preserves an unrelated existing `prepare` command and appends automatic repair. Fixture: `test/init.test.mjs`.
- **INIT-009** — init leaves an existing lint-staged config exactly as the user wrote it (no adoption, no edits). Fixture: `test/init.test.mjs`.
- **INIT-010** — init migrates a husky-era 2.x setup: retires `core.hooksPath`, removes generated `.husky` wiring, writes native hooks. Fixture: `test/init.test.mjs`.
- **INIT-011** — init errors clearly when `package.json` is invalid JSON. Fixture: `test/init.test.mjs`.
- **INIT-012** — init setup summary renders as a readable list instead of one wide line. Fixture: `test/init.test.mjs`.
- **INIT-013** — init succeeds from the published npm package in a fresh Git repo. Manual: temp project with `npm install -D commitment-issues@latest`.
- **INIT-014** — init adds `node_modules/` to `.gitignore` defaults and avoids duplicate existing entries. Fixture: `test/init-gitignore.test.mjs`.
- **INIT-015** — init keeps user-authored `.husky` hooks and warns they no longer run. Fixture: `test/init.test.mjs`.
- **INIT-016** — init warns about a foreign `core.hooksPath` and leaves it alone. Fixture: `test/init.test.mjs`.
- **INIT-017** — init warns when run outside a git repository but still writes scripts/config. Fixture: `test/init.test.mjs`.
- **INIT-018** — init preserves custom native hooks, accepts those that invoke `commitment-issues`, and withholds setup-complete claims while listing exact commands for those that do not. Fixture: `test/init.test.mjs`.
- **INIT-019** — init preserves an unrelated `postprepare` while composing repair into the project-owned `prepare`. Fixture: `test/init.test.mjs`.
- **INIT-020** — commit-msg wiring is opt-in, dry-run aware, executable, idempotent, and never overwrites a custom hook. Fixture: `test/init.test.mjs`, unit: `test/hooks.test.mjs`.

## Uninstall

- **UNINST-001** — uninstall removes exact generated scripts and native hook bodies plus the package-specific configuration block while preserving dependencies and shared `.gitignore` entries. Fixture: `test/uninstall.test.mjs`.
- **UNINST-002** — uninstall is idempotent. Fixture: `test/uninstall.test.mjs`.
- **UNINST-003** — `uninstall --dry-run` previews package and hook cleanup without writing. Fixture: `test/uninstall.test.mjs`.
- **UNINST-004** — customized scripts and hooks are preserved and reported for manual cleanup. Fixture: `test/uninstall.test.mjs`.
- **UNINST-005** — package cleanup still works outside a Git repository while uninspectable hooks are reported. Fixture: `test/uninstall.test.mjs`.
- **UNINST-006** — missing and invalid `package.json` states fail clearly. Fixture: `test/uninstall.test.mjs`.
- **UNINST-007** — an active foreign hooks directory is inspected; exact generated bodies are removed while customized commands are preserved. Fixture: `test/uninstall.test.mjs`.
- **UNINST-008** — legacy commands in an active Husky directory are reported and preserved. Fixture: `test/uninstall.test.mjs`.
- **UNINST-009** — a configured native hooks path is deduplicated during inspection. Fixture: `test/uninstall.test.mjs`.
- **UNINST-010** — an unreadable or malformed hook path is reported and left unchanged. Fixture: `test/uninstall.test.mjs`.
- **UNINST-011** — uninstall removes the appended repair suffix while restoring the project's unrelated `prepare`. Fixture: `test/uninstall.test.mjs`.
- **UNINST-012** — uninstall previews/removes an exact owned commit-msg hook and preserves customized variants for manual cleanup. Fixture: `test/uninstall.test.mjs`.

### Pre-commit checks

- **PRE-001** — auto-fixable formatting/lint warnings recommend `npm run commit:fix` (and pluralize). Fixture: `test/precommit.test.mjs`.
- **PRE-002** — a mix of fixable and manual issues recommends `commit:fix` and still flags the manual work. Fixture: `test/precommit.test.mjs`.
- **PRE-003** — `commit:fix` is suppressed when tracked worktree changes would block a safe amend. Fixture: `test/precommit.test.mjs`.
- **PRE-004** — non-fixable ESLint issues are labeled manual with no `commit:fix`, including messages with no rule id. Fixture: `test/precommit.test.mjs`.
- **PRE-005** — staged JS/TS source files without a matching test are flagged as missing unit tests. Fixture: `test/precommit.test.mjs`.
- **PRE-006** — files in test dirs, files with a matching test, config, Storybook, generated, `.d.ts`, and `testExempt` globs are not flagged. Fixture: `test/precommit.test.mjs`.
- **PRE-007** — `requireTests: false` disables the missing-test check. Fixture: `test/precommit.test.mjs`.
- **PRE-008** — nothing staged, only non-checkable files, and deletion-only commits each show the correct info box. Fixture: `test/precommit.test.mjs`.
- **PRE-009** — opt-in staged tests run and warn on failure or stay clean on success (pluralized). Fixture: `test/precommit.test.mjs`.
- **PRE-010** — tool failures stay advisory: ESLint/Prettier/test errors, timeouts, and unreadable staged/unstaged probes never crash the commit. Fixture: `test/precommit.test.mjs`.
- **PRE-011** — `blockProtectedBranches` blocks ordinary, deletion-only, allow-empty, and first commits on an unborn protected branch; genuinely unidentifiable branches still fail open. Fixture: `test/commit-guards-integration.test.mjs`.

### Commit-message linting

- **CMSG-001** — disabled by default: no commit-msg hook and a direct invocation is silent. Fixture: `test/commit-msg.test.mjs`, `test/init.test.mjs`.
- **CMSG-002** — advisory findings preserve commitlint detail and allow; explicit `blockOnFailure` rejects the same result. Fixture: `test/commit-msg.test.mjs`.
- **CMSG-003** — only an absolute project `node_modules/.bin/commitlint` invocation is allowed; message paths containing spaces/metacharacters stay one argv value and no npx/global/network fallback exists. Unit: `test/process.test.mjs`; fixture: `test/commit-msg.test.mjs`.
- **CMSG-004** — missing local CLI, missing consumer config, unreadable message files, and successful runs have distinct outcomes; no built-in rules are substituted. Fixture: `test/commit-msg.test.mjs`.
- **CMSG-005** — generated hooks block when configured and Git `--no-verify` bypasses without invoking commitlint. Real-Git fixture: `test/commit-msg.test.mjs`.
- **CMSG-006** — standard and fun tones preserve severity/exit behavior. Unit: `test/message.test.mjs`; fixture: `test/commit-msg.test.mjs`.

### Commit fix (amend)

- **CFIX-001** — amends the latest commit when all fixes are automatic. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-002** — amends and warns when non-fixable lint issues remain. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-003** — reports the latest commit is already clean when nothing changes (pluralized). Fixture: `test/commit-fix.test.mjs`.
- **CFIX-004** — the amend summary pluralizes for multiple updated files. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-005** — refuses to amend a commit that has already been pushed. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-006** — refuses to amend when tracked worktree changes exist. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-007** — shows info when the latest commit has no fixable files. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-008** — guides the user to `git reset --soft HEAD^` when the fixes would empty the commit. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-009** — warns when a format-only file cannot be fixed automatically. Fixture: `test/commit-fix.test.mjs`.
- **CFIX-010** — Git failures error clearly: no commit, worktree/file-list/staging/staged-fix inspection, and amend failure. Fixture: `test/commit-fix.test.mjs`.

### Staged fixes

- **STG-001** — `fix:staged` applies auto-fixes and refreshes the index; reports already clean when nothing changes (pluralized, tolerant of an unreadable index snapshot). Fixture: `test/fix-staged.test.mjs`.
- **STG-002** — `fix:staged` warns when fixes apply but non-fixable lint issues remain. Fixture: `test/fix-staged.test.mjs`.
- **STG-003** — `fix:staged` shows an info box when there are no staged fixable files. Fixture: `test/fix-staged.test.mjs`.
- **STG-004** — `fix:staged` refuses partially staged files and files missing from the working tree. Fixture: `test/fix-staged.test.mjs`.
- **STG-005** — `fix:staged` errors when staged or unstaged files cannot be inspected. Fixture: `test/fix-staged.test.mjs`.
- **STG-006** — `fix-staged-js` formats JS/TS and exits 0 when everything is auto-fixable. Fixture: `test/fix-staged-js.test.mjs`.
- **STG-007** — `fix-staged-js` exits 1 on remaining non-fixable lint or a Prettier parse error. Fixture: `test/fix-staged-js.test.mjs`.
- **STG-008** — `fix-staged-js` exits 0 immediately when given no file arguments. Fixture: `test/fix-staged-js.test.mjs`.

### Doctor and hook health

- **HOOK-001** — doctor wires native `.git/hooks` files in a fresh repo. Fixture: `test/doctor.test.mjs`.
- **HOOK-002** — doctor reports healthy when the wiring is intact. Fixture: `test/doctor.test.mjs`.
- **HOOK-003** — doctor migrates husky-era wiring (retires `core.hooksPath`, writes native hooks) and warns about stranded user `.husky` hooks. Fixture: `test/doctor.test.mjs`.
- **HOOK-004** — doctor recreates a missing hook file without overwriting existing ones. Fixture: `test/doctor.test.mjs`.
- **HOOK-005** — custom hooks that still invoke `commitment-issues` are accepted as healthy. Fixture: `test/doctor.test.mjs`.
- **HOOK-006** — custom pre-commit/pre-push hooks that never invoke `commitment-issues` are reported and left untouched. Fixture: `test/doctor.test.mjs`.
- **HOOK-007** — `doctor --quiet` warns but exits 0 when a custom hook does not invoke `commitment-issues`. Fixture: `test/doctor.test.mjs`.
- **HOOK-008** — `doctor --quiet` stays silent when healthy and reports repairs in one line. Fixture: `test/doctor.test.mjs`.
- **HOOK-009** — `doctor --quiet` never breaks an install (no git repo, or repair cannot complete). Fixture: `test/doctor.test.mjs`.
- **HOOK-010** — interactive doctor errors clearly: no `package.json`, unrepairable wiring, or still broken after repair. Fixture: `test/doctor.test.mjs`.
- **HOOK-011** — a foreign `core.hooksPath` is respected: healthy when its hooks invoke the tool, reported (never rewired) when they do not. Fixture: `test/doctor.test.mjs`.
- **HOOK-012** — doctor creates and fresh-clone repairs configured commit-msg wiring, preserves custom bodies, requires quoted `$1`, and warns without failing when the local CLI is absent. Fixture: `test/doctor.test.mjs`.

### Pre-push modes

- **PUSH-001** — disabled by default: silent and allows during a real push, and explains how to enable a mode when run interactively. Fixture: `test/prepush.test.mjs`.
- **PUSH-002** — blocking mode runs only the pushed files' tests and blocks on failure; a pass shows a summary and allows. Fixture: `test/prepush.test.mjs`.
- **PUSH-003** — advisory mode runs tests and warns without blocking; a pass shows a summary. Fixture: `test/prepush.test.mjs`.
- **PUSH-004** — `blockPushOnTestFailure` takes precedence over `advisePushTests`, and the dual-mode conflict is surfaced. Fixture: `test/prepush.test.mjs`.
- **PUSH-005** — deleted test files are never executed; deleting or renaming a source file still runs any surviving related test and blocks when it fails. Fixture: `test/prepush.test.mjs`.
- **PUSH-006** — falls back to the upstream branch when run without piped refs. Fixture: `test/prepush.test.mjs`.
- **PUSH-007** — non-node test commands run through the tee/summary fallback. Fixture: `test/prepush.test.mjs`.
- **PUSH-008** — test-command failure blocks in blocking mode and warns/allows in advisory mode; a missing summary blocks. Fixture: `test/prepush.test.mjs`.
- **PUSH-009** — pushed-file diff failure or malformed name/status output fails closed in blocking mode, warns/allows in advisory mode, and stays silent when disabled. Fixture: `test/prepush.test.mjs`.

### Advisory message and tone

- **MSG-001** — a success message renders when there are no issues. Unit: `test/message.test.mjs`.
- **MSG-002** — recommends `commit:fix` when amend is safe; suppressed when worktree changes block amend or it cannot be inspected. Unit: `test/message.test.mjs`.
- **MSG-003** — mixed fixable + manual issues recommend `commit:fix` and flag manual work, including when amend is blocked. Unit: `test/message.test.mjs`.
- **MSG-004** — no fix command is shown when nothing is auto-fixable. Unit: `test/message.test.mjs`.
- **MSG-005** — an issue's detail lines render. Unit: `test/message.test.mjs`.
- **MSG-006** — fun tone renders the "Relationship notes" variant from `precommitChecks.tone`. Subprocess: `test/fun-tone.test.mjs`.
- **MSG-007** — commit-message findings and setup failures render advisory/blocking and standard/fun variants with an explicit bypass. Unit: `test/message.test.mjs`.

### Internal helpers

- **LIB-001** — ESLint JSON summarizing and manual-issue extraction (totals, fixables, empty/invalid, missing rule id). Unit: `test/checks.test.mjs`.
- **LIB-002** — Prettier list parsing and Node test-summary parsing (TAP/spec, pass-only/fail-only, unrecognized → null). Unit: `test/checks.test.mjs`.
- **LIB-003** — test-exemption and glob logic: `isTestExemptFile`, `testExempt` globs, `globToRegExp`, and file classifiers. Unit: `test/lib-files.test.mjs`.
- **LIB-004** — test discovery and Git-path helpers: `findTestFile`, `collectTestsForFiles`, `parseNameStatusPaths`, and `shortFileList`. Unit: `test/lib-files.test.mjs`.
- **LIB-005** — box rendering: `printBox` and severity boxes color the whole border. Unit: `test/ui.test.mjs`.
- **LIB-006** — process outcomes distinguish missing tool, spawn failure, timeout, external signal, normal nonzero exit, and success. Unit: `test/process.test.mjs`.
- **LIB-007** — Prettier classification is exit-status-first; `[error]` in a filename remains a formatting path. Unit: `test/checks.test.mjs`.
- **LIB-008** — project-local optional-bin resolution walks ancestor `node_modules/.bin` directories while preserving argv and returning null instead of an implicit fallback. Unit: `test/local-tool.test.mjs`.

### Safety path matrix

- **SEC-001** — paths with spaces are passed as argv and through a staged-file flow. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-002** — paths with quotes are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-003** — paths with semicolons are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-004** — Unicode paths are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-005** — Windows-style backslash tokens are passed as literal argv. Unit: `test/process.test.mjs`.
- **SEC-006** — glob-like filename characters are passed safely through a staged-file flow. Subprocess: `test/fix-staged.test.mjs`.
- **SEC-007** — Git path output is read with `core.quotePath=false` in key hook flows. Source: `scripts/precommit.mjs`, `scripts/fix-staged.mjs`, `scripts/commit-fix.mjs`, `scripts/prepush.mjs`.
- **SEC-008** — accidentally staged `node_modules` files are skipped by pre-commit checks. Fixture: `test/precommit-dependency-ignore.test.mjs`.
- **SEC-009** — pre-push diff uses NUL-delimited name/status output (plus `core.quotePath=false`), so deletions, renames, Unicode, whitespace, and newlines remain unambiguous for associated-test discovery. Unit/subprocess: `test/lib-files.test.mjs`, `test/prepush.test.mjs`.
- **SEC-010** — staged-secret parsing distinguishes file headers from added hunk content, including source lines beginning with `++ `. Unit/subprocess: `test/secret-scan.test.mjs`, `test/secret-scan-integration.test.mjs`.
- **SEC-011** — missing ESLint/Prettier peers return an advisory and package-manager install hint without invoking `npx`; explicitly configured `npx` test commands remain verbatim. Unit/subprocess: `test/process.test.mjs`, `test/precommit.test.mjs`.

### Performance

- **PERF-001** — timeout is enforced and reported separately from signals/spawn failures. Fixture: precommit / prepush / process tests.
- **PERF-002** — timeout cleanup terminates an attached grandchild on supported platforms. Fixture: `test/process.test.mjs`; CI matrix: Ubuntu, macOS, Windows.

### User lifecycle

- **LIFE-001** — user installs and immediately commits in a fresh external repo. CI lifecycle smoke: `.github/workflows/ci.yml`.
- **LIFE-002** — user installs and immediately pushes to a bare remote from a fresh external repo. CI lifecycle smoke: `.github/workflows/ci.yml`.
- **LIFE-003** — advisory-only forever. Fixture/docs: README + prepush tests.
- **LIFE-004** — blocking on push. Fixture/docs: README + prepush tests.
- **LIFE-005** — user installs from npm, runs help, initializes, and runs the pre-commit command with no staged files. Manual: fresh temp project with `commitment-issues@latest`.
- **LIFE-006** — a project-owned `prepare` survives init; after commit/push, a fresh clone's normal install runs the composed repair and recreates both local hooks. CI lifecycle matrix: `.github/workflows/ci.yml`; script: `scripts/ci-lifecycle-smoke.mjs`.

### Package managers

- **PM-001** — package-manager detection (npm/pnpm/yarn/bun) via `npm_config_user_agent` and lockfiles, plus package-manager-aware command hints in advisory, `fix:staged`, and `doctor` output. Unit: `test/package-manager.test.mjs`. Subprocess: `test/fix-staged.test.mjs`.
- **PM-002** — uninstall prints a package-removal command for the detected manager. Unit: `test/package-manager.test.mjs`. Fixture: `test/uninstall.test.mjs`.
- **PM-002** — pnpm end-to-end lifecycle smoke (pack → install → init → commit → push). CI: `.github/workflows/ci.yml` (pm-smoke matrix); script: `scripts/ci-lifecycle-smoke.mjs`.
- **PM-003** — yarn classic end-to-end lifecycle smoke. CI: `.github/workflows/ci.yml` (pm-smoke matrix); script: `scripts/ci-lifecycle-smoke.mjs`.
- **PM-005** — bun end-to-end lifecycle smoke. CI: `.github/workflows/ci.yml` (pm-smoke matrix); script: `scripts/ci-lifecycle-smoke.mjs`.

## Deferred

- **PM-004** — yarn Berry (Plug'n'Play) support. Hooks resolve the bin from `node_modules/.bin`, so Berry projects need `nodeLinker: node-modules`; PnP is not yet supported. Classic yarn is covered by PM-003. A dedicated [Yarn Berry guide](yarn-berry.md) documents the `node-modules` setup and the PnP boundary.
- **MONO-001** — workspace root behavior. Hooks run from the Git root and check staged files across all packages using the root `precommitChecks` config and hoisted tools. Boundary documented in the [Monorepo & workspaces guide](monorepo.md).
- **MONO-002** — nested workspace package behavior. Per-package `precommitChecks` config and per-package tool versions are out of scope; the boundary is documented in the [Monorepo & workspaces guide](monorepo.md).
- **PERF-003** — many-files performance. Add only after the behavior matrix is stable.

## Not covered yet

### Init / install fixture matrix

- Read-only `package.json` / `.gitignore` where practical.
- More custom hook variants if users report specific merge expectations.

### Safety path matrix

- Newlines in filenames, if Git and the platform can create the filename reliably.

### Release and lifecycle

- Release from a tag.
- Release from GitHub Actions.
- Upgrade from older package versions.
- Downgrade behavior.
- Corporate locked-down environment behavior.

## Next batches

### Batch 5: deferred support boundaries

- pnpm / yarn / bun.
- Monorepo root/package fixtures.
- Release-from-tag / release-from-CI workflows.
