# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- OpenSSF badge-readiness governance docs updates:
  - Added explicit `Code review standards` and `Two-person review policy`
    sections to `.github/CONTRIBUTING.md`.
  - Added maintainer phishing-resistant 2FA guidance and a security review
    cadence section to `.github/SECURITY.md`.
  - Added `docs/security-review-2026-07.md` to document the latest scoped
    security review.
  - Added `docs/security-hardening.md` to document hardening controls and
    dynamic-analysis practices.
  - Expanded `docs/openssf-best-practices.md` to map Gold criteria IDs to
    concrete evidence URLs.

## [3.0.0] - 2026-07-08

### Removed (BREAKING)

- **Dropped the `husky` and `lint-staged` dependencies.** They are no longer peer dependencies, are never invoked, and `commitment-issues` now has zero hook-manager dependencies:
  - Git hooks are plain `.git/hooks/pre-commit` and `.git/hooks/pre-push` files written by `init`/`doctor` (git's default hooks location — no `core.hooksPath`, nothing extra committed to the repo). The generated hooks skip themselves when `COMMITMENT_ISSUES=0` (or the pre-3.0 `HUSKY=0`) is set and exit harmlessly when the bin is uninstalled.
  - `fix:staged` now runs ESLint `--fix` and Prettier `--write` on the staged files directly and restages the result with `git add`. The existing safety guards (partial-staging refusal, missing-file refusal) already made lint-staged's stash/revert machinery redundant. Custom `lint-staged` configs are no longer read; keep running lint-staged yourself if you rely on custom tasks.
  - `init` no longer writes a `lint-staged` config into `package.json` and never edits an existing one.

### Added

- **Automatic husky-era migration.** `doctor` (including the `prepare`-time `doctor --quiet`) and `init` detect pre-3.0 wiring and migrate it: retire the husky `core.hooksPath` and write the native hooks; `init` also deletes the `.husky` hook files this tool generated (exact-content match — user-authored hooks are never touched). `doctor` only auto-migrates once the husky package is out of the dependency tree (the normal v3 upgrade); while husky remains installed, its live wiring is respected with a nudge toward `init`. Upgrading a consumer repo is: update the package, reinstall (or run `init` once).
- New message states with gallery SVGs: `core.hooksPath points somewhere else.` (a foreign hooks dir is respected, never rewired — and counts as healthy when its hooks already invoke the tool), `Leftover .husky hooks no longer run.` (stranded user hooks are reported, never deleted), `Hook wiring needs your attention.` (init's post-summary warning), and `Unable to restage fixed files.` (fixes applied but `git add` failed).
- `init` now warns when run outside a git repository instead of silently skipping hook setup.
- A metadata regression test asserting `husky` and `lint-staged` stay out of `dependencies`, `devDependencies`, and `peerDependencies`.
- A `file:` self-dependency so this repo's own hooks run the real `commitment-issues` bin from `node_modules/.bin`, exactly like a consumer install.
- `docs/external-interface.md`: a dedicated reference for the public interface (commands, scripts, hook entrypoints, configuration keys/defaults, and output/exit behavior).
- `docs/openssf-best-practices.md`: an evidence map that links OpenSSF Best Practices criteria to concrete repository URLs for faster badge updates.
- `docs/message-states.md` now catalogs every message state the commands can produce, each with a rendered SVG: the full `init` output set, the remaining pre-commit advisory variants (auto-fixable lint, failing staged tests, tool crash/unavailable, amend-withheld notes, fun tone, uninspectable staged files), every `commit:fix` outcome (partial amend, already clean, emptied commit, already-pushed and dirty-worktree refusals, and all failure boxes), the remaining `fix:staged` outcomes, the pre-push could-not-run-tests states and config-conflict warning, and the doctor missing-tools, not-a-repo, repair-failure, and quiet-mode states.
- A metadata test that extracts every terminal box title from the entry scripts and fails if one is missing from the `docs/message-states.md` gallery (or its referenced SVGs), so new message states cannot ship undocumented.
- Fun-tone rewrites for the exact tool-failure messages (`ESLint timed out`, `Prettier timed out`, `Staged tests timed out`, and the three `Unable to run …` variants), so a fun-toned advisory box no longer falls back to standard wording for those issues.
- A pre-push regression test covering the test-command timeout (`timeoutMs`) branch of the `Push blocked: could not run tests` state.
- The pre-commit and pre-push hooks now print a one-line advisory warning when `precommitChecks` contains an unrecognized key, so a typo (e.g. `requireTest`) can no longer silently fall back to default behavior.
- `tools/gen-message-state-svgs.mjs`: the maintainer script that renders the `docs/message-states.md` gallery SVGs, so new message states can be documented by appending an entry instead of hand-drawing an SVG (kept out of the npm tarball).

### Changed

- `doctor`'s required-tool advisory now checks only `eslint` and `prettier`.
- CI recipes and this repo's own workflow use `COMMITMENT_ISSUES=0` to skip hooks in CI (the old `HUSKY=0` remains honored for existing pipelines).
- `docs/migration.md` now leads with the 2.x → 3.0 upgrade path; README, FAQ, configuration, monorepo, Yarn Berry, framework, and CI docs no longer instruct installing husky or lint-staged.
- The pre-commit `Unable to inspect staged files` box is now a warning instead of an error: the commit continues (advisory philosophy), matching the severity of the equivalent pre-push `Could not inspect pushed files (advisory)` state.
- README now includes a `Project status and support` section with explicit links for interaction, contribution requirements, interface docs, maintenance status, and English-language support.
- CONTRIBUTING now includes a dedicated `Contribution requirements` section.

### Fixed

- The all-manual pre-commit advisory footer (`No automatic fix command for these issues.`) is no longer indented two extra spaces, matching the other footer notes.

## [2.5.0] - 2026-07-08

### Added

- A Privacy section in the README documenting the no-telemetry, no-phone-home posture.
- Maintainer adoption-metrics checklist in `docs/adoption-metrics.md`.
- A CodeQL static-analysis (SAST) workflow that scans JavaScript/TypeScript on pushes, pull requests, and a weekly schedule.
- Property-based tests (`fast-check`) fuzzing the pure path, glob, and tool-output parsing helpers with generated inputs; also satisfies the OpenSSF Scorecard fuzzing check.
- `npm run coverage:badge` to refresh the README coverage badge from live `npm run test:coverage` output.

### Changed

- Punchier fun-tone advisory messages: files now tell Prettier "this is just how I am", source files "won't commit to unit tests", failing tests say "we need to talk", and Prettier crashes "leave you on read" (`precommitChecks.tone: "fun"` only; standard tone unchanged).
- Expanded the FAQ removal guide with step-by-step manual removal steps, and added before/after examples (husky + lint-staged, lefthook, pre-commit) to the migration guide.
- Raised the `lint-staged` peer requirement to `>=16.2.0`: `fix:staged` relies on the `--continue-on-error` and `--no-revert` flags introduced in 16.2.0 and 16.1.0, which older versions reject as unknown options.

### Fixed

- The pre-commit advisory no longer recommends amending with `commit:fix` when the working tree could not be inspected; it now explains that a safe post-commit amend could not be verified.
- A Prettier crash (parse error or broken install) during the pre-commit check is now reported as its own non-fixable "Prettier failed to complete" issue instead of being counted as a formatting issue with a `commit:fix` recommendation.
- `commit:fix` now refuses to amend when Git cannot verify the latest commit is unpushed, instead of assuming it is safe to rewrite.
- Pushed-file test discovery now skips vendored `node_modules/` paths, matching the pre-commit hook's third-party filtering.
- `init --dry-run` now previews the hook files and `.gitignore` defaults a real run would add, instead of listing only `package.json` changes.

### Security

- Signed releases: publishing a `vX.Y.Z` tag now attaches the packed npm tarball and its SLSA build-provenance attestation to the matching GitHub release, so release artifacts can be verified with `slsa-verifier`.
- Pinned GitHub Actions dependencies to full commit SHAs across the CI, publish, Scorecard, and CodeQL workflows (with the SLSA generator referenced by a semantic version tag per SLSA requirements; Dependabot keeps the pins current).

## [2.4.0] - 2026-07-07

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
