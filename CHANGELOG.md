# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A branded setup banner in `commitment-issues init` — a split-heart logo and wordmark unified into the setup box.
- `commitment-issues --version` / `-v` to print the package version from the CLI.
- `commitment-issues init --dry-run` to preview setup changes without writing `package.json`, `.gitignore`, or hook files.
- A migration guide for raw `husky` + `lint-staged`, `lefthook`, and `pre-commit` setups.
- A public roadmap in `ROADMAP.md`.
- A coverage badge in the README that surfaces the CI coverage result.
- An OpenSSF Scorecard workflow and badge.
- A dedicated Yarn Berry guide covering the `node-modules` linker setup and the Plug'n'Play boundary.
- A monorepo & workspaces guide covering root-level setup, per-package scoping, and the support boundary.
- Framework recipes for Next.js, Vite, and TypeScript libraries.
- CI provider recipes for disabling Husky on GitHub Actions, GitLab CI, and CircleCI.

## [2.3.0] - 2026-07-05

### Added

- Package-manager detection (npm, pnpm, yarn, bun) via `npm_config_user_agent` and lockfiles, with package-manager-aware command hints in advisory, `fix:staged`, and `doctor` output (e.g. `pnpm run commit:fix`).
- End-to-end CI lifecycle smokes for pnpm, yarn, and bun (pack → install → init → commit → push), alongside the existing npm smoke.
- README "How it compares" table, a "Package managers" section, and a one-line positioning tagline.
- This changelog.

## [2.2.0] - 2026-07-05

### Added

- Opt-in **fun tone** for advisory messages via `precommitChecks.tone: "fun"`.
- `init` now merges a missing JS `lint-staged` task into an existing object config, preserving custom JS tasks and array configs.
- `doctor` verifies hook **content**: it reports custom hooks that never invoke `commitment-issues`, and never overwrites them.
- Expanded message-state gallery in `docs/message-states.md`, plus a scenario-coverage tracker that catalogs the full test suite.

### Changed

- Pre-push now diffs with `core.quotePath=false`, so pushed files with spaces or Unicode names still match their associated tests (matching the pre-commit and fix flows).
- Blocking pre-push (`blockPushOnTestFailure`) now **fails closed** when the pushed-file diff cannot be computed; advisory mode warns and allows the push.
- Restructured the README around the quickstart flow and added configuration/behavior docs and an npm downloads badge.

## [2.1.2] - 2026-07-04

### Added

- CI lifecycle smoke test (install → commit → push) across the OS/Node matrix, run before publish.
- Pre-commit skips accidentally staged dependency files (`node_modules`); `init` adds `node_modules/` to `.gitignore` defaults.
- Message-state SVG gallery in the docs.

### Fixed

- README engine-metadata regex.

## [2.1.1] - 2026-07-04

### Added

- Message-states documentation and README terminal-output screenshots.
- Scenario coverage tracker; expanded CLI, init, config, and path-safety tests.

### Changed

- Read staged paths with Git quoting disabled (`core.quotePath=false`) in precommit, fix-staged, and commit-fix for safe handling of spaces, quotes, and Unicode.

### Fixed

- Advisory message normalization edge cases; surface Prettier hard failures.

## [2.1.0] - 2026-07-04

### Added

- Advisory pre-push tests enabled by default during `init`.
- Package metadata consistency tests and CI across the OS matrix with coverage and a packaged-tarball smoke test.

### Changed

- Align `engines.node` with the lint-staged floor (`>=22.22.1`).

### Fixed

- Cross-platform (Windows) path-separator and ESM import issues.
- `commit:fix` messaging when the index already matches `HEAD`.

## [2.0.1] - 2026-07-02

### Added

- `init` migrates legacy 1.x vendored setups to the `commitment-issues` bin.

### Fixed

- Cross-platform issues on Windows.

## [2.0.0] - 2026-07-02

### Changed

- **Breaking:** restructured as an installable CLI — hooks call the `commitment-issues` bin instead of vendoring scripts into the consuming repo.

## Earlier releases

See the Git tags (`v1.0.1` through `v1.3.0`) for pre-2.0 history.
