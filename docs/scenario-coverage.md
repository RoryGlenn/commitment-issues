# Scenario Coverage

> **Audience:** maintainers and auditors. This repository-only matrix is not
> installed with the npm package. Scenario identifiers map claims to concrete
> tests, workflows, or an explicit manual/deferred disposition; update the map
> whenever that evidence changes.

This tracker turns the exhaustive scenario list into an implementation plan. Update it whenever a scenario is covered, deferred, or intentionally left manual.

The command, Git-state, lifecycle, finding, and file-ownership evidence for
production-readiness workstream #130 is consolidated in the
[core CLI and Git behavior audit](audits/core-cli-git.md).

## Status values

- **Covered** — automated coverage exists and is expected to run in CI.
- **Partial** — some coverage exists, but important variants remain.
- **Not covered** — no meaningful automated coverage yet.
- **Manual** — best validated manually for now.
- **Deferred** — intentionally not implemented yet.
- **Not applicable** — out of scope for this package.

## Covered

### Test strategy and coverage enforcement

- **TEST-001** — every published runtime module has an explicit, existing test
  owner that references it, and the ownership set exactly matches the
  fail-closed coverage denominator. Unit/invariant: `test/test-quality.test.mjs`;
  map: `docs/branch-coverage.md`.
- **TEST-002** — the only coverage suppressions are the two documented
  post-preflight filesystem races; new or enlarged suppressions fail the
  inventory. Unit/invariant: `test/test-quality.test.mjs`.
- **TEST-003** — deleted tests are not executed, while a deleted source, a
  source-only rename, and a combined source+test rename cannot evade blocking
  related-test selection. Real-Git fixture: `test/prepush.test.mjs`.
- **TEST-004** — all 64 generated message-state assets are gallery-owned and
  exactly reproducible in a private temporary directory. Unit/subprocess:
  `test/visual-assets.test.mjs`.
- **TEST-005** — the aggregate branch-protection gate succeeds only when DCO,
  the complete OS/Node check matrix, and the package-manager lifecycle matrix
  each report explicit success; skipped or incomplete dependencies fail closed.
  Unit/invariant: `test/test-quality.test.mjs`; CI: `.github/workflows/ci.yml`.
- **TEST-006** — exact logo content and fresh-value behavior are directly
  asserted rather than credited through incidental coverage. Unit:
  `test/logo.test.mjs`.

### Package publishing

- **PKG-001** — package metadata stays consistent with lockfile. Unit: `test/metadata.test.mjs`.
- **PKG-002** — package README documents the Node engine. Unit: `test/metadata.test.mjs`.
- **PKG-003** — package description does not contradict configurable blocking. Unit: `test/metadata.test.mjs`.
- **PKG-004** — package `files` entries exist. Unit: `test/metadata.test.mjs`.
- **PKG-005** — package bin works from a packed tarball across the OS / Node matrix. CI lifecycle integration: `.github/workflows/ci.yml`; runner: `scripts/run-lifecycle-test.mjs`.
- **PKG-006** — README relative image assets, including HTML `<img>` sources, exist and are included in package `files`. Unit: `test/metadata.test.mjs`.
- **PKG-007** — package includes only README-required SVG assets and the explicit
  user-documentation allowlist; repository-only galleries and maintainer
  evidence stay out of the tarball. Unit: `test/metadata.test.mjs` using
  `npm pack --dry-run --json`.
- **PKG-009** — exact minimum supported Node version runs the full npm test and
  lifecycle matrix on Ubuntu, macOS, and Windows, plus every supported non-npm
  lifecycle on Ubuntu. CI: `.github/workflows/ci.yml`.
- **PKG-010** — package excludes promotional raster/video media and enforces compressed/unpacked size budgets. Unit: `test/metadata.test.mjs`.
- **PKG-011** — the publish workflow packs once, lifecycle-tests the exact
  tarball, confirms its CLI bin/shebang/version on every platform and normalized
  0755/0644 file modes on POSIX/release producers, then hashes, uploads, and
  publishes that unchanged artifact. Windows lanes retain platform-relevant
  bin-shim, installability, and digest checks. SLSA generation remains separate,
  and one final immutable-release uploader owns the tarball and provenance.
  Unit/invariant:
  `test/release-integrity.test.mjs`; integration:
  `test/integration/lifecycle-manager.test.mjs` and
  `scripts/ci-lifecycle-smoke.mjs`; tracking: #182.
- **PKG-012** — release preflight rejects local/remote tag, GitHub Release, and
  npm-version collisions and fails closed when a registry cannot be checked.
  Unit: `test/release-integrity.test.mjs`.
- **PKG-013** — release verification uses supported npm signature/attestation
  surfaces rather than the absent `npm view ... provenance` field. Unit:
  `test/release-integrity.test.mjs`.
- **PKG-014** — version tags fetch complete canonical history and fail before
  release-capable work unless their commit is an ancestor of `origin/main`.
  Repository tag rules remain the external release-authority boundary.
  Unit/fixture: `test/release-integrity.test.mjs`; tracking: #94.
- **PKG-015** — partial-publication recovery distinguishes `before-npm`,
  `after-npm`, and `complete` states; inconsistent or unavailable evidence and
  source/digest mismatches fail closed. Before-npm requires no GitHub draft or
  release, and incomplete recovery requires `latest` to remain on the candidate.
  The final job cryptographically verifies local SLSA provenance; every existing
  draft asset must be byte-identical, so a draft containing provenance can
  resume only through a failed-job rerun retaining the original bundle.
  Published partial releases cannot resume. Registry metadata changes and
  unpublish remain outside automation. Mocked unit: `test/release-recovery.test.mjs`;
  workflow invariant:
  `test/release-integrity.test.mjs`; classifier: `tools/release-recovery.mjs`;
  tracking: #183.

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
- **DOC-006** — every allowlisted `precommitChecks` key appears in the canonical
  user configuration reference and maintainer authoring skill; the external
  interface links to that canonical table. Unit: `test/metadata.test.mjs`.
- **DOC-007** — the aggregate CI gate includes DCO and every prospective-enforcement surface names the same immutable baseline. Unit: `test/metadata.test.mjs`.

### Promotional demo

- **DEMO-001** — the render workflow preserves the generated artifact and
  independently enforces dimensions, frame-count drift, duration drift, and
  normalized visual similarity. Unit: `test/visual-assets.test.mjs`.
- **DEMO-002** — visual comparison masks only the four documented volatile
  values, searches only the metadata-bounded frame offsets, accepts those
  differences, and rejects synthetic missing-scene, color, layout, and clipping
  regressions. Unit/integration: `test/demo-visual-comparison.test.mjs`.

### Config

- **CFG-001** — valid `precommitChecks` loads. Unit: `test/config.test.mjs`.
- **CFG-002** — missing `package.json` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-003** — invalid package JSON degrades to `{}` with an explicit source warning. Unit: `test/config.test.mjs`.
- **CFG-004** — missing `precommitChecks` degrades to `{}`. Unit: `test/config.test.mjs`.
- **CFG-005** — malformed `precommitChecks` containers are ignored with an explicit source warning. Fuzz unit: `test/config.test.mjs`.
- **CFG-006** — malformed option values inside an object are tolerated. Fuzz unit: `test/config.test.mjs`.
- **CFG-007** — `.commitmentrc.json` loads direct top-level options without executing code. Unit/subprocess: `test/config.test.mjs`, `test/precommit.test.mjs`.
- **CFG-008** — standalone keys shallowly override matching package keys while preserving unmatched package options; invalid higher-priority values do not revive lower-priority values. Unit/subprocess: `test/config.test.mjs`, `test/precommit.test.mjs`, `test/prepush.test.mjs`.
- **CFG-009** — malformed JSON and non-object standalone roots warn at hook time and fall back to package configuration. Unit/subprocess: `test/config.test.mjs`, `test/precommit.test.mjs`, `test/prepush.test.mjs`.
- **CFG-010** — nested `commitMessage` keys are allowlisted, sanitized, typo-diagnosed, and disabled unless `enabled: true`. Unit: `test/config.test.mjs`.
- **CFG-011** — valid standalone values remain active when the package source is malformed; hooks surface the package failure instead of changing policy silently. Unit/subprocess: `test/config.test.mjs`, `test/precommit.test.mjs`.

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
- **CLI-019** — `--json` forwards to precommit/prepush and is rejected for unsupported subcommands. Subprocess: `test/json-output.test.mjs`.
- **CLI-020** — the hidden `vows` command dispatches successfully, renders one deterministic color-aware box, wraps in narrow terminals, and leaves worktree, package, Git config, and hook state unchanged. Unit/subprocess: `test/vows.test.mjs`, `test/cli.test.mjs`.
- **CLI-021** — every public command's option/positional boundary is documented; unsupported options and excess arguments fail before dispatch can mutate state. Subprocess: `test/cli.test.mjs`, `test/init.test.mjs`, `test/doctor.test.mjs`, `test/uninstall.test.mjs`.

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
- **INIT-013** — init succeeds from the packed package in a fresh Git repo. CI lifecycle integration: `test/integration/lifecycle-manager.test.mjs`.
- **INIT-014** — init adds `node_modules/` to `.gitignore` defaults and avoids duplicate existing entries. Fixture: `test/init-gitignore.test.mjs`.
- **INIT-015** — init keeps user-authored `.husky` hooks and warns they no longer run. Fixture: `test/init.test.mjs`.
- **INIT-016** — init warns about a foreign `core.hooksPath` and leaves it alone. Fixture: `test/init.test.mjs`.
- **INIT-017** — init warns when run outside a git repository but still writes scripts/config. Fixture: `test/init.test.mjs`.
- **INIT-018** — init preserves custom native hooks, accepts those that invoke `commitment-issues`, and withholds setup-complete claims while listing exact commands for those that do not. Fixture: `test/init.test.mjs`.
- **INIT-019** — init preserves an unrelated `postprepare` while composing repair into the project-owned `prepare`. Fixture: `test/init.test.mjs`.
- **INIT-020** — init rejects primitive, null, and array package roots or `scripts`/`precommitChecks` containers before writing; missing and empty object containers remain valid. Fixture: `test/init.test.mjs`.
- **INIT-021** — an existing standalone file receives the generated advisory-push default without creating a package configuration block; dry-run previews without writing. Fixture: `test/init.test.mjs`.
- **INIT-022** — malformed standalone configuration stops init before package, hook, or gitignore writes. Fixture: `test/init.test.mjs`.
- **INIT-023** — commit-msg wiring is opt-in, dry-run aware, executable, idempotent, and never overwrites a custom hook. Fixture: `test/init.test.mjs`, unit: `test/hooks.test.mjs`.
- **INIT-024** — init derives commit-msg wiring from the merged effective
  package/standalone configuration; standalone-only enablement, disabled or
  invalid standalone precedence, dry-run, idempotence, and a packed mixed-source
  lifecycle are covered. Fixture: `test/init.test.mjs`; CI lifecycle integration:
  `scripts/ci-lifecycle-smoke.mjs`.
- **INIT-025** — bare repositories never receive or report active local commit/push hooks. Fixture: `test/init.test.mjs`.
- **INIT-026** — failed `core.hooksPath` and common-directory probes withhold hook-health claims and do not write potentially shadowed hooks. Unit/fixture: `test/hooks.test.mjs`, `test/init.test.mjs`.
- **INIT-027** — uninspectable and unwritable hook paths are preserved and reported without raw exceptions or false success. Fixture: `test/init.test.mjs`.
- **INIT-028** — relative native/common hook paths and tilde-based configured paths are resolved through the correct Git/cwd semantics. Unit/fixture: `test/hooks.test.mjs`, `test/doctor.test.mjs`.
- **INIT-029** — unknown setup options fail before project files or hooks change, including misspelled dry-run flags. Fixture: `test/init.test.mjs`.
- **INIT-030** — rerunning setup repairs a deliberately interrupted/partial hook installation idempotently. Fixture: `test/init.test.mjs`.
- **INIT-031** — uninspectable `.gitignore` and unwritable project files fail before hook installation with bounded diagnostics. Fixture: `test/init-gitignore.test.mjs`, `test/init.test.mjs`.
- **INIT-032** — shallow clones and submodules install hooks in their own Git common directories without requiring full history. Fixture: `test/repository-shapes.test.mjs`.

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
- **UNINST-012** — standalone configuration is included in dry-run and removed during uninstall. Fixture: `test/uninstall.test.mjs`.
- **UNINST-013** — malformed standalone configuration stops uninstall before partial cleanup. Fixture: `test/uninstall.test.mjs`.
- **UNINST-014** — uninstall previews/removes an exact owned commit-msg hook and preserves customized variants for manual cleanup. Fixture: `test/uninstall.test.mjs`.
- **UNINST-015** — a failed `core.hooksPath` probe leaves all hook files untouched while package cleanup remains available. Fixture: `test/uninstall.test.mjs`.
- **UNINST-016** — tilde-based active hook directories are resolved through Git and exact owned hooks are removed from the effective path. Fixture: `test/uninstall.test.mjs`.
- **UNINST-017** — unknown options and an unwritable package fail before generated hooks or configuration are removed. Fixture: `test/uninstall.test.mjs`.

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
- **PRE-012** — JSON mode covers skipped, clean, advisory, and invalid-argument results without changing human output or exit codes. Fixture: `test/json-output.test.mjs`.
- **PRE-013** — staged test selection preserves leading/trailing whitespace, tabs, newlines, and Unicode in real Git pathnames. Fixture: `test/precommit.test.mjs`.
- **PRE-014** — detached HEAD intentionally skips only the branch-name guard while unrelated staged guards continue. Fixture: `test/commit-guards-integration.test.mjs`.
- **PRE-015** — the default-on Commit Owl welcome appears once per clone as the sole final box for an eligible clean/informational result, uses a Git-common-directory marker shared by linked worktrees, stays readable at narrow widths, and supports an explicit opt-out. Unit/fixture: `test/welcome.test.mjs`.
- **PRE-016** — JSON mode, `--no-verify`, `COMMITMENT_ISSUES=0`, and legacy `HUSKY=0` neither display nor consume the welcome; marker probe/write/render failures never block checks. Unit/real-Git fixture: `test/welcome.test.mjs`.
- **PRE-017** — a first-run warning or error takes priority without rendering or consuming the welcome, preserving the one-box invariant in both hook-output modes. Unit/fixture: `test/welcome.test.mjs`.

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
- **CFIX-011** — committed pathnames with leading/trailing whitespace, tabs, newlines, and Unicode are fixed and amended exactly. Fixture: `test/commit-fix.test.mjs`.

### Staged fixes

- **STG-001** — `fix:staged` applies auto-fixes and refreshes the index; reports already clean when nothing changes (pluralized, tolerant of an unreadable index snapshot). Fixture: `test/fix-staged.test.mjs`.
- **STG-002** — `fix:staged` warns when fixes apply but non-fixable lint issues remain. Fixture: `test/fix-staged.test.mjs`.
- **STG-003** — `fix:staged` shows an info box when there are no staged fixable files. Fixture: `test/fix-staged.test.mjs`.
- **STG-004** — `fix:staged` refuses partially staged files and files missing from the working tree. Fixture: `test/fix-staged.test.mjs`.
- **STG-005** — `fix:staged` errors when staged or unstaged files cannot be inspected. Fixture: `test/fix-staged.test.mjs`.
- **STG-006** — `fix-staged-js` formats JS/TS and exits 0 when everything is auto-fixable. Fixture: `test/fix-staged-js.test.mjs`.
- **STG-007** — `fix-staged-js` exits 1 on remaining non-fixable lint or a Prettier parse error. Fixture: `test/fix-staged-js.test.mjs`.
- **STG-008** — `fix-staged-js` exits 0 immediately when given no file arguments. Fixture: `test/fix-staged-js.test.mjs`.
- **STG-009** — staged pathnames with leading/trailing whitespace, tabs, newlines, and Unicode are fixed and restaged exactly. Fixture: `test/fix-staged.test.mjs`.

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
- **HOOK-012** — doctor reports malformed standalone configuration while continuing hook repair; quiet mode remains one-line and exit-zero. Fixture: `test/doctor.test.mjs`.
- **HOOK-013** — comments, echo/printf output, assignments, and quoted examples do not count as hook wiring; executable custom invocations and exact generated hooks remain healthy for all hook names. Unit/fixture: `test/hooks.test.mjs`, `test/init.test.mjs`, `test/doctor.test.mjs`.
- **HOOK-014** — non-executable custom hooks are reported with shell-safe `chmod +x` guidance on POSIX and are never modified by init or doctor. Unit/fixture: `test/hooks.test.mjs`, `test/init.test.mjs`, `test/doctor.test.mjs`.
- **HOOK-015** — doctor creates and fresh-clone repairs configured commit-msg wiring, preserves custom bodies, requires quoted `$1`, and warns without failing when the local CLI is absent. Fixture: `test/doctor.test.mjs`.
- **HOOK-016** — bare repositories are rejected for local hook health; quiet install-time repair remains silent and exit-zero. Unit/fixture: `test/hooks.test.mjs`, `test/doctor.test.mjs`.
- **HOOK-017** — failed `core.hooksPath` probes fail safely instead of being mistaken for an unset value. Unit/fixture: `test/hooks.test.mjs`, `test/doctor.test.mjs`.
- **HOOK-018** — directory, unreadable, and otherwise uninspectable hook paths are preserved and reported without raw exceptions. Unit/fixture: `test/hooks.test.mjs`, `test/doctor.test.mjs`.
- **HOOK-019** — configured hook paths use Git's effective path resolution, including tilde expansion. Unit/fixture: `test/hooks.test.mjs`, `test/doctor.test.mjs`, `test/uninstall.test.mjs`.

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
- **PUSH-010** — JSON mode preserves Git's pre-push positional arguments, keeps subprocess output off stdout, and reports advisory, clean, and blocking outcomes. Fixture: `test/json-output.test.mjs`.
- **PUSH-011** — the first push of a based branch uses its closest safe remote merge base; orphan histories fall back to the empty tree, and multiple pushed refs are evaluated independently. Fixture: `test/prepush.test.mjs`.
- **PUSH-012** — same-basename sources in separate packages select only their own package-relative tests; a root basename fallback cannot steal the match. Fixture: `test/prepush.test.mjs`.
- **PUSH-013** — pushed test selection passes leading/trailing whitespace, tabs, newlines, and Unicode pathnames exactly. Fixture: `test/prepush.test.mjs`.
- **PUSH-014** — missing remotes fail safely, one remote can be inferred, and multiple remotes are never guessed when selecting a first-push base. Unit: `test/push-base.test.mjs`.

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
- **LIB-004** — package-aware test discovery and strict NUL-delimited Git-path helpers: `findTestFile(s)`, `collectTestsForFiles`, `parseNulPaths`, `parseLsFilesStage`, `parseNameStatusPaths`, and `shortFileList`. Unit: `test/lib-files.test.mjs`.
- **LIB-005** — shared box rendering colors the whole border, honors `NO_COLOR`/disabled color in captured CI output, wraps long and Unicode content to the reported width, and recovers from malformed or impossibly narrow `COLUMNS` values. Unit/subprocess: `test/ui.test.mjs`.
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
- **SEC-007** — every runtime Git pathname list uses a structured NUL-delimited format; parsers never trim or newline-split pathnames. Source/fixtures: `scripts/precommit.mjs`, `scripts/fix-staged.mjs`, `scripts/commit-fix.mjs`, `scripts/prepush.mjs`, `test/lib-files.test.mjs`.
- **SEC-008** — accidentally staged `node_modules` files are skipped by pre-commit checks. Fixture: `test/precommit-dependency-ignore.test.mjs`.
- **SEC-009** — pre-push diff uses NUL-delimited name/status output, so deletions, renames/copies, Unicode, whitespace, tabs, and newlines remain unambiguous for associated-test discovery. Unit/subprocess: `test/lib-files.test.mjs`, `test/prepush.test.mjs`.
- **SEC-010** — staged-secret parsing distinguishes file headers from added hunk content, including source lines beginning with `++ `. Unit/subprocess: `test/secret-scan.test.mjs`, `test/secret-scan-integration.test.mjs`.
- **SEC-011** — missing ESLint/Prettier peers return an advisory and package-manager install hint without invoking `npx`; explicitly configured `npx` test commands remain verbatim. Unit/subprocess: `test/process.test.mjs`, `test/precommit.test.mjs`.
- **SEC-012** — opt-in secret enforcement fails closed when the staged-diff process fails, exits nonzero, or returns malformed patch structure; advisory mode warns and continues, and JSON preserves the distinction. Unit/subprocess: `test/secret-scan.test.mjs`, `test/secret-scan-integration.test.mjs`, `test/json-output.test.mjs`.
- **SEC-013** — Git C-style quoted staged-patch paths preserve tabs, newlines, quotes, backticks, dollar signs, semicolons, spaces, and Unicode; binary, rename, deletion, missing-final-newline, malformed, and large patch shapes remain structurally distinguished. Unit/subprocess: `test/secret-scan.test.mjs`, `test/secret-scan-integration.test.mjs`.
- **SEC-014** — discovered Node test paths beginning with `-` are positional files rather than runner options at commit and push time. Unit/subprocess: `test/process.test.mjs`, `test/precommit.test.mjs`, `test/prepush.test.mjs`.
- **SEC-015** — hook repair does not follow hook-file, dangling, or hook-directory symbolic links. Unit/subprocess: `test/hooks.test.mjs`, `test/doctor.test.mjs`.
- **SEC-016** — pre-push Node reporter output uses a randomized private temporary directory and does not reuse or delete a predictable colliding path. Subprocess: `test/prepush.test.mjs`.
- **SEC-017** — hook-launched test commands and temporary-repository helpers remove Git's repository-local environment routing; representative `GIT_DIR`, work-tree, index, and counted-config variables cannot redirect fixture initialization into the caller. Unit/subprocess: `test/process.test.mjs`, `test/repository-shapes.test.mjs`, pre-push hook reproduction.

### Performance

- **PERF-001** — timeout is enforced and reported separately from signals/spawn failures. Fixture: precommit / prepush / process tests.
- **PERF-002** — timeout cleanup terminates an attached grandchild on supported platforms. Fixture: `test/process.test.mjs`; CI matrix: Ubuntu, macOS, Windows.

### User lifecycle

- **LIFE-001** — user installs and immediately commits in a fresh external repo. CI lifecycle integration: `.github/workflows/ci.yml` (`check` and `pm-lifecycle`); runner: `scripts/run-lifecycle-test.mjs`; fixture: `test/integration/lifecycle-manager.test.mjs`.
- **LIFE-002** — user installs and immediately pushes to a bare remote from a fresh external repo. CI lifecycle integration: `.github/workflows/ci.yml` (`check` and `pm-lifecycle`); runner: `scripts/run-lifecycle-test.mjs`; fixture: `test/integration/lifecycle-manager.test.mjs`.
- **LIFE-003** — advisory-only forever. Fixture/docs: README + prepush tests.
- **LIFE-004** — blocking on push. Fixture/docs: README + prepush tests.
- **LIFE-006** — a project-owned `prepare` survives init; after commit/push, a fresh clone's normal install runs the composed repair and recreates both local hooks. CI lifecycle matrix: `.github/workflows/ci.yml`; runner: `scripts/run-lifecycle-test.mjs`; fixture: `test/integration/lifecycle-manager.test.mjs`.

### Package managers

- **PM-001** — package-manager detection (npm/pnpm/yarn/bun) via `npm_config_user_agent` and lockfiles, plus package-manager-aware command hints in advisory, `fix:staged`, and `doctor` output. Unit: `test/package-manager.test.mjs`. Subprocess: `test/fix-staged.test.mjs`.
- **PM-002** — uninstall prints a package-removal command for the detected manager. Unit: `test/package-manager.test.mjs`. Fixture: `test/uninstall.test.mjs`.
- **PM-003** — pnpm 10 end-to-end lifecycle integration (pack → install → init → commit → push → repair → uninstall → dependency removal) on Ubuntu, macOS, and Windows at Node 24, plus the exact Node 22.11.0 floor on Ubuntu. CI: `.github/workflows/ci.yml` (`pm-lifecycle` matrix); runner: `scripts/run-lifecycle-test.mjs`.
- **PM-004** — Yarn Classic 1.22.22 runs the same manager-native lifecycle and platform matrix without an npm-runner fallback. CI: `.github/workflows/ci.yml` (`pm-lifecycle` matrix); runner: `scripts/run-lifecycle-test.mjs`.
- **PM-005** — Bun 1.3.14 runs the same lifecycle and platform matrix through `bunx --no-install`. CI: `.github/workflows/ci.yml` (`pm-lifecycle` matrix); runner: `scripts/run-lifecycle-test.mjs`.
- **PM-007** — installs with lifecycle scripts disabled leave clone-local hooks absent but keep the local CLI available; explicit `doctor` repair and a later scripts-enabled reinstall both restore exact generated hooks. CI lifecycle matrix: `.github/workflows/ci.yml`; runner: `scripts/ci-lifecycle-smoke.mjs`.
- **PM-008** — package-manager guidance is workspace-aware, the lifecycle strips the outer npm user agent, and pre-commit/uninstall output must name the selected manager. Unit: `test/package-manager.test.mjs`; CI lifecycle matrix: `.github/workflows/ci.yml`.

### Monorepos and workspaces

- **MONO-001** — workspace-root behavior across npm, pnpm, Yarn, and Bun. The real packed package is installed at the root, each manager's workspace selector runs both package test scripts, root config owns staged checks, and root-native hooks run for commits and pushes. CI lifecycle matrix: `.github/workflows/ci.yml`; script: `scripts/ci-lifecycle-smoke.mjs`.
- **MONO-002** — shallow and nested workspace packages are checked together, including when `git commit` starts in the nested package. Package-local `precommitChecks` values remain untouched and do not override the root. CI lifecycle matrix: `.github/workflows/ci.yml`; guide: [Monorepo & workspaces](monorepo.md).
- **MONO-003** — linked Git worktrees share hooks through Git's common directory, repair safely during a worktree-local install, and run the root checks from a nested package. CI lifecycle matrix: `.github/workflows/ci.yml`.

### CI/CD and repository automation

- **CI-001** — every tracked workflow has read-only defaults, an explicit
  concurrency policy, bounded runnable jobs, non-persisted checkout credentials,
  and an allowlisted job-permission surface. Unit: `test/ci-policy.test.mjs`;
  semantic validation: actionlint in `.github/workflows/ci.yml`.
- **CI-002** — the sole branch-protection context fails unless DCO, static
  quality, dependency audit, every supported runtime/lifecycle lane, and CodeQL
  each report exact success. Unit: `test/ci-policy.test.mjs` and
  `test/test-quality.test.mjs`; CI: `.github/workflows/ci.yml`.
- **CI-003** — CodeQL is reusable by required CI while retaining scheduled and
  manual analysis. Unit: `test/ci-policy.test.mjs`; workflow:
  `.github/workflows/codeql.yml`.
- **CI-004** — release tags serialize through GitHub's maximum 100-run pending
  queue without cancelling in-flight or already-pending publications, generated
  artifact names cross into shell through quoted environment variables, and
  every ordinary action reference is immutable. Unit: `test/ci-policy.test.mjs`
  and `test/release-integrity.test.mjs`.
- **CI-005** — routine npm and Actions releases age for seven days, security
  updates remain immediate, and both required CI and weekly health fail on
  high-severity advisories. Unit: `test/ci-policy.test.mjs`; automation:
  `.github/dependabot.yml` and `.github/workflows/repo-health.yml`.

Explicit non-goals are per-package configuration/tool versions, build-system dependency-graph scheduling, and an exhaustive speculative matrix of custom hoisting layouts. The tested defaults form the support contract; reproducible gaps should add focused fixtures and issues.

## Deferred

- **PM-006** — Yarn Berry support. The `node-modules` mode is provisional pending dedicated issue #100 evidence; Plug'n'Play is unsupported because the runtime requires `node_modules/.bin`. Yarn Classic is covered by PM-004. A dedicated [Yarn Berry guide](yarn-berry.md) documents both boundaries.
- **PERF-003** — many-files performance. Add only after the behavior matrix is stable.

## Manual and production validation

- **PKG-008** — the published npm package installs and exposes the CLI bin.
  Recheck in a clean project before launch with
  `npm install -D commitment-issues@latest` and
  `npx --no-install commitment-issues --help`.
- **LIFE-005** — the complete clean-registry launch path (`init`, advisory
  commit warning, `commit:fix`, and related push-time tests) remains a launch
  gate in issue #78.
- **REL-001** — the production v3.3.2 tag workflow published the exact npm
  tarball and both immutable GitHub Release assets. The npm/GitHub tarballs and
  SLSA subject share one SHA-256; independent npm signature and
  `slsa-verifier` checks passed. See the
  [release-verification baseline](release-verification.md#validated-release-baseline).
- **REL-002** — live history anchors the recovery states without creating a
  test publication: v3.3.0 is an npm-published but immutable zero-asset GitHub
  Release that cannot resume, v3.3.1 failed before npm but required a workflow
  edit, and v3.3.2 is complete. Evidence:
  [release audit](audits/release-packaging-and-upgrades.md#historical-release-and-tag-evidence).

## Not covered yet

### Release and lifecycle

- Registry-installed upgrade and downgrade behavior across published versions.
- Corporate locked-down environment behavior.
- Dedicated shell and GUI-client launch coverage tracked in
  [#83](https://github.com/RoryGlenn/commitment-issues/issues/83).

## Next batches

### Post-launch support boundaries

- Yarn Berry Plug'n'Play.
- Custom no-hoist or non-`node_modules` workspace layouts outside the tested
  package-manager defaults.
- Registry-installed upgrade/downgrade fixtures.
- The cross-shell and Git-client matrix in #83, coordinated with the proposed
  v4 contract in #84.
