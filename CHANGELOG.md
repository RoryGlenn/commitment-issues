# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Refreshed the complete documentation set for the verified v3.3.2 baseline:
  launch preparation now requires human-authored HN copy, the roadmap and
  feature backlog reflect the open v4/platform/adapter proposals, release
  instructions use the working npm and SLSA verification flow, and trust,
  compatibility, OpenSSF, maintenance, and supply-chain guidance match current
  behavior. Broken internal anchors and stale shipped/deferred coverage entries
  were corrected as part of the audit.

### Fixed

- Demo rendering CI now ignores only the volatile commit abbreviation and
  runtime values during SSIM comparison, evaluates the existing metadata-bounded
  two-frame timing variance, and keeps the strict visual threshold and original
  rendered artifact intact. Focused synthetic regressions guard against masking
  meaningful missing-scene, color, layout, or clipping changes.

## [3.3.2] - 2026-07-12

### Fixed

- The SLSA caller now retains the `contents: write` permission required by the
  reusable workflow's nested upload-job contract, even while direct generator
  uploads remain disabled. Changes to `publish.yml` also trigger a harmless
  non-publishing pull-request validation run, while release jobs stay
  tag-gated, so GitHub catches reusable-workflow startup failures before merge
  instead of after an immutable tag is pushed.

## [3.3.1] - 2026-07-12

### Fixed

- Immutable GitHub releases are now staged with both the exact npm tarball and
  its signed SLSA provenance before publication. The provenance generator no
  longer publishes an empty release before attempting asset uploads, avoiding
  the immutable-release rejection and its deprecated Node 20 upload action.

## [3.3.0] - 2026-07-12

### Added

- An opt-in `commitment-issues vows` Easter egg that renders the project's four
  safety promises in one deterministic, read-only box. A subtle help clue
  points curious users toward it, while the command remains outside the public
  command list and README reference.
- A validated `hookOutput` policy for `precommit`, `prepush`, and `commit-msg`.
  The new `"problems-only"` default suppresses final success/info boxes while
  preserving every warning, error, mixed-severity result, check, exit code,
  diagnostic, and JSON payload; `"normal"` restores continuous confirmation.
- Optional `.commitmentrc.json` configuration with direct top-level keys. Its
  keys shallowly override `package.json` `precommitChecks` values without
  executing project code; malformed files warn at hook/doctor time and stop
  `init` or `uninstall` before mutation.
- Opt-in `--json` results for `precommit` and `prepush`, with one shared,
  versioned schema covering check outcomes, findings, safe command suggestions,
  configuration diagnostics, and unchanged exit codes. JSON is the only stdout
  content; pre-push test-runner output moves to stderr in this mode.
- Optional bring-your-own commitlint integration under
  `precommitChecks.commitMessage`: disabled by default, advisory after explicit
  enablement, and blocking only with `blockOnFailure`. It owns a safely quoted
  native `commit-msg` hook without overwriting custom hooks, resolves only the
  project-local CLI (no implicit npx/network/global fallback), requires the
  consumer's own rules config, and participates in init/doctor/uninstall and
  fresh-clone repair.
- `commitment-issues uninstall` with a matching `--dry-run` preview. It removes
  only exact generated scripts and native hook bodies plus the package-specific
  configuration block; custom project wiring is preserved and reported for
  manual cleanup.
- Staged-secrets scan (`scanSecrets`, default on): the pre-commit hook checks lines _added_ by the staged diff against a curated high-precision credential set — AWS access key IDs, private-key headers, GitHub/Slack/npm/Stripe live/Google API tokens, and URLs with embedded passwords — and flags staged dotenv files (template variants like `.env.example` are ignored). Findings join the consolidated advisory box with file:line detail and rotation guidance. `blockOnSecrets: true` turns findings into a hard block (bypass once with `git commit --no-verify`); `secretExempt` globs exempt fixture paths. Known documentation examples and placeholder passwords never fire, and deleting a secret is never flagged.
- `npm run states` (repo-only, `tools/show-message-states.mjs`): renders a
  representative subset of the message-state gallery live by driving the real
  entry scripts through throwaway git repos. Filter by substring
  (`npm run states -- secrets`) or list scenario names with `--list`.
- Unknown CLI subcommands now suggest the closest valid command when the input
  looks like a typo (for example, `docter` suggests `doctor`).

### Changed

- Lowered the supported Node.js runtime floor from 22.22.1 to 22.11.0, the first
  Node 22 LTS release. Package metadata, CI, documentation, fixtures, and
  repository guidance now agree on the minimum, with a metadata test preventing
  future version drift.
- Governance and maintainer guidance now match the live strict `main` ruleset:
  one approval, stale/last-push review controls, resolved threads, DCO inside
  the aggregate CI gate, a prospective signed-history baseline, and a narrow,
  auditable single-maintainer exception with a continuity plan. Maintainer
  references also enumerate the full guard/secret configuration surface and
  current lifecycle job names.
- The public runtime now maintains 100% line, branch, and function coverage on
  Node 22.11.0 and 24. `npm run test:coverage` enumerates the complete runtime
  source set, fails if a source is absent from LCOV, and gates all three metrics
  at 100%. Package lifecycle tests remain a separately named pass/fail gate,
  the README branch badge is value-derived, and CI rejects a stale committed
  badge.
- Reorganized the README around a two-command trial, product fit, comparison,
  team rollout, progressive enforcement, ownership boundaries, and reversible
  removal. Detailed output and compliance evidence remain available lower in
  the document without delaying the adoption path.
- The npm, pnpm, Yarn, and Bun lifecycle matrix now installs the packed package
  into a real workspace fixture, covering shallow and nested packages,
  root-owned configuration, fresh clones, and linked Git worktrees.

### Fixed

- Every user-facing command now renders at most one terminal box per invocation.
  Pre-push test results and protected-branch advisories share one final summary,
  while `init`, `doctor`, and `uninstall` fold secondary findings into their
  primary outcome instead of stacking competing boxes.
- OpenSSF Scorecard now runs only for default-branch-relevant events, including
  branch-protection changes, instead of uploading repository-level SARIF from
  every pull request and producing misleading missing-configuration warnings.
- The representative message-state runner now exits nonzero when setup or a
  scenario produces an unexpected result, while continuing to render later
  scenarios, and removes an inherited `NO_COLOR` before forcing colored child
  output.
- Pre-commit, `fix:staged`, and `commit:fix` now consume NUL-delimited Git
  pathname records (including numstat and index metadata), preserving legal
  leading/trailing whitespace, tabs, newlines, and Unicode without trimming.
- A new branch's first push now diffs from its closest unambiguous upstream or
  destination-remote merge base instead of treating the entire inherited
  repository as new. Orphan, ambiguous, and unrelated histories conservatively
  fall back to the empty tree, and generated pre-push hooks forward the remote
  arguments needed to keep multi-remote selection safe. Exact older generated
  hook bodies are refreshed automatically on upgrade; customized hooks remain
  untouched. SHA-1 and SHA-256 zero object IDs are recognized.
- Related-test lookup now respects the nearest workspace package boundary and
  preserves package-relative source paths. Same-basename sources cannot claim
  another workspace's or the root package's fallback test; every candidate in
  the first matching specificity tier runs deterministically.
- The npm package now excludes the promotional hero PNG and demo GIF while
  keeping README images live through GitHub-hosted URLs; a package-content test
  enforces both the required offline SVG/docs set and a documented size budget.
- Release publishing now sends the exact tarball that was packed and hashed to
  npm, attaches that tarball and its SLSA provenance to the GitHub Release, and
  provides a collision-checking preflight plus an immutable-tag recovery
  policy.
- The blocking pre-push gate now retains deleted source paths and both sides of renames when discovering related tests, while filtering test files that no longer exist before invoking the runner. Git name/status output is NUL-delimited so path whitespace and newlines remain unambiguous.
- `blockProtectedBranches` now applies before deletion/no-file early exits and resolves the symbolic branch name before the first commit, so deletion-only and unborn-branch commits cannot bypass protected-branch blocking.
- `init` now verifies that both active hooks invoke `commitment-issues` before claiming setup is complete. User-authored hooks remain untouched; unwired hooks suppress the green commit/push promises and list the exact commands to add.
- `init` now preserves an unrelated `prepare` command and appends automatic fresh-clone hook repair to the same lifecycle script, including on Yarn Classic. `uninstall` removes only the generated repair suffix.
- The staged-secret diff parser now treats `+++ ` as file metadata only outside a hunk, so added source lines beginning with `++ ` cannot evade secret detection.
- `init` now rejects non-object package roots and non-object `scripts` or
  `precommitChecks` containers before writing anything, with an actionable
  error instead of an internal `TypeError`.
- Hook health checks now require a conservative executable command line and,
  on POSIX, an executable hook file. Comments, echo/printf output, and quoted
  examples no longer produce false healthy/setup-success claims.

## [3.2.0] - 2026-07-10

### Added

- Advisory commit and push guards, all reported through the existing consolidated suggestions box and configurable under `precommitChecks`:
  - **Protected-branch awareness** (`protectedBranches`, default `["main", "master"]`, globs supported): warns on direct commits to and pushes of matching branches; `blockProtectedBranches: true` upgrades the warning to a hard block with a `--no-verify` bypass hint. `protectedBranches: []` disables.
  - **Behind-upstream nudge** (`adviseBehindUpstream`, default on): commit-time warning when the branch is behind its upstream as of the last fetch.
  - **Commit-size warnings** (`maxCommitFiles` default 30, `maxCommitLines` default 2000, `0` disables): suggests splitting unusually large commits.
  - **Large-file warning** (`maxFileSizeMb`, default 5, `0` disables): lists staged files over the threshold with a Git LFS pointer.
  - **Generated-file warning** (`generatedPaths`, default covers `dist`, `build`, `coverage`, `node_modules`, `.DS_Store`, and `__pycache__`): flags staged build artifacts — including accidentally staged `node_modules` files, which were previously ignored silently.

### Changed

- The pre-commit hook now loads `precommitChecks` (and prints its unknown-key/invalid-value warnings) before the early-exit states, so config feedback and commit guards also appear for commits with no lintable files.

### Fixed

- `publish.yml` no longer runs `npm install -g npm@latest` before publishing. npm self-updating in place corrupted the workflow's npm installation (`Cannot find module 'sigstore'`) and failed the v3.1.0 publish; the workflow now verifies the bundled npm supports trusted publishing instead of mutating it.

## [3.1.0] - 2026-07-09

### Added

- The pre-commit and pre-push hooks now print a one-line advisory warning when `precommitChecks` contains a recognized key with an invalid value (e.g. a string where a boolean is expected, or a non-positive `timeoutMs`). The invalid value is still ignored in favor of the default; the warning just makes the mistyped setting visible instead of silently falling back.
- OpenSSF Silver-readiness governance and assurance artifacts: `GOVERNANCE.md`, `DCO`, `docs/project-roles.md`, `docs/dependency-management.md`, `docs/release-verification.md`, `docs/security/assurance-case.md`, and `docs/vulnerability-history.md`.
- A dedicated DCO CI workflow (`.github/workflows/dco.yml`) that validates `Signed-off-by:` trailers on every pull request commit.

### Changed

- `scripts/ci-lifecycle-smoke.mjs` now asserts `init` side effects more thoroughly across npm/pnpm/yarn/bun (expected scripts, hook wiring, `.gitignore` defaults, and manager lockfiles), with platform-safe hook executability checks on Windows.
- `scripts/lib/config.mjs` now sanitizes `precommitChecks` via an allowlist/type validation path before use, reducing malformed config-footgun behavior while preserving unknown-key diagnostics.
- `.github/CONTRIBUTING.md` now codifies DCO sign-off requirements and stronger test expectations for major features and bug-fix regressions (when practical).
- Redesigned the project flowchart images: new hand-authored dark and light SVGs (`assets/project-flowchart-dark.svg`, `assets/project-flowchart-light.svg`) used by both the README and `docs/how-it-works.md`, which now theme-switch instead of showing a fixed dark raster. The superseded `assets/project-flowchart.webp` was removed.

### Fixed

- `scripts/cli.mjs` is now tracked with the executable bit (`100755`). Registry installs were unaffected (npm chmods bin entries itself), but git clones and `file:`-linked checkouts resolved a non-executable `node_modules/.bin/commitment-issues`, so the generated hooks silently skipped their checks with "command not found". A metadata test now guards the mode of every `bin` entry.

## [3.0.1] - 2026-07-08

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
