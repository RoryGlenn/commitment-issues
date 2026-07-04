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

### Config

- **CFG-001** — valid `precommitChecks` loads. Unit: `test/config.test.mjs`.
- **CFG-002** — missing `package.json` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-003** — invalid JSON degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-004** — missing `precommitChecks` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-005** — malformed `precommitChecks` containers are ignored. Fuzz unit: `test/config.test.mjs`.
- **CFG-006** — malformed option values inside an object are tolerated. Fuzz unit: `test/config.test.mjs`.

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

### Init

- **INIT-001** — init wires hooks, scripts, config, and is idempotent. Fixture: `test/init.test.mjs`.
- **INIT-002** — init upgrades legacy vendored setup. Fixture: `test/init.test.mjs`.
- **INIT-003** — init preserves explicit push blocking config. Fixture: `test/init.test.mjs`.
- **INIT-004** — init leaves customized pre-commit and pre-push hooks untouched. Fixture: `test/init.test.mjs`.
- **INIT-005** — init errors when `package.json` is missing. Fixture: `test/init.test.mjs`.
- **INIT-006** — init creates `.gitignore` when absent. Fixture: `test/init.test.mjs`.
- **INIT-007** — init appends cache ignores with no trailing newline. Fixture: `test/init.test.mjs`.
- **INIT-008** — init preserves an unrelated existing `prepare` script. Fixture: `test/init.test.mjs`.
- **INIT-009** — init preserves existing lint-staged object config. Fixture: `test/init.test.mjs`.
- **INIT-010** — init preserves existing lint-staged array config. Fixture: `test/init.test.mjs`.
- **INIT-011** — init errors clearly when `package.json` is invalid JSON. Fixture: `test/init.test.mjs`.
- **INIT-012** — init setup summary renders as a readable list instead of one wide line. Fixture: `test/init.test.mjs`.
- **INIT-013** — init succeeds from the published npm package in a fresh Git repo. Manual: temp project with `npm install -D commitment-issues@latest`.
- **INIT-014** — init adds `node_modules/` to `.gitignore` defaults and avoids duplicate existing entries. Fixture: `test/init-gitignore.test.mjs`.

### Safety path matrix

- **SEC-001** — paths with spaces are passed as argv and through a staged-file flow. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-002** — paths with quotes are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-003** — paths with semicolons are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-004** — Unicode paths are passed safely through argv and staged-file flows. Unit/subprocess: `test/process.test.mjs`, `test/fix-staged.test.mjs`.
- **SEC-005** — Windows-style backslash tokens are passed as literal argv. Unit: `test/process.test.mjs`.
- **SEC-006** — glob-like filename characters are passed safely through a staged-file flow. Subprocess: `test/fix-staged.test.mjs`.
- **SEC-007** — Git path output is read with `core.quotePath=false` in key hook flows. Source: `scripts/precommit.mjs`, `scripts/fix-staged.mjs`, `scripts/commit-fix.mjs`.
- **SEC-008** — accidentally staged `node_modules` files are skipped by pre-commit checks. Fixture: `test/precommit-dependency-ignore.test.mjs`.

### Performance

- **PERF-001** — timeout is enforced. Fixture: precommit / prepush tests.

### User lifecycle

- **LIFE-003** — advisory-only forever. Fixture/docs: README + prepush tests.
- **LIFE-004** — blocking on push. Fixture/docs: README + prepush tests.
- **LIFE-005** — user installs from npm, runs help, initializes, and runs the pre-commit command with no staged files. Manual: fresh temp project with `commitment-issues@latest`.

## Partial

- **LIFE-001** — user installs and immediately commits. Covered by init + precommit fixtures and npm install/init/precommit smoke; needs full external-repo `git commit` smoke.
- **LIFE-002** — user installs and immediately pushes. Covered by init + prepush fixtures and npm install/init smoke; needs full external-repo `git push` smoke.

## Deferred

- **PM-002** — pnpm package-manager compatibility. Document support boundary first.
- **PM-003** — yarn classic compatibility. Document support boundary first.
- **PM-004** — yarn berry compatibility. Document support boundary first.
- **PM-005** — bun compatibility. Document support boundary first.
- **MONO-001** — workspace root behavior. Deferred until workspace support boundary is explicit.
- **MONO-002** — nested workspace package behavior. Deferred until workspace support boundary is explicit.
- **PERF-002** — many-files performance. Add only after the behavior matrix is stable.

## Not covered yet

### Init / install fixture matrix

- Read-only `package.json` / `.gitignore` where practical.
- More custom hook variants if users report specific merge expectations.
- More lint-staged merge variants if users report specific merge expectations.

### Safety path matrix

- Newlines in filenames, if Git and the platform can create the filename reliably.
- Pre-push Git path output with forced `core.quotePath=false`; connector blocked the full-file write, so this remains a later cleanup.

### Release and lifecycle

- Full external-repo install plus first `git commit` smoke.
- Full external-repo install plus first `git push` smoke.
- Exact minimum Node version.
- Release from a tag.
- Release from GitHub Actions.
- Upgrade from older package versions.
- Downgrade behavior.
- Corporate locked-down environment behavior.

## Next batches

### Batch 4: lifecycle smoke tests

- Full external-repo install plus first `git commit` smoke.
- Full external-repo install plus first `git push` smoke.
- Exact minimum Node version.

### Batch 5: deferred support boundaries

- pnpm / yarn / bun.
- Monorepo root/package fixtures.
- Release-from-tag / release-from-CI workflows.
