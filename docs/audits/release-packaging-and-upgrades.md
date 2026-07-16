# Audit 7: Release, Packaging, and Upgrades

> Status: **complete** as of 2026-07-16. The repository-controlled candidate
> satisfies Audit 7, and the owner-authenticated npm control in
> [#195](https://github.com/RoryGlenn/commitment-issues/issues/195) is verified.
> Publication remains blocked by the unfinished final-verification gates in
> [#138](https://github.com/RoryGlenn/commitment-issues/issues/138).

## Baseline

- Tracker: [#136](https://github.com/RoryGlenn/commitment-issues/issues/136)
- Audit baseline: `7a8504863eb798bed1b687a3f06f61b21780af3b`
- Package baseline: `commitment-issues@3.3.2`
- Release workflow: `.github/workflows/publish.yml`
- Recovery classifier: `tools/release-recovery.mjs`
- Lifecycle integration: `scripts/run-lifecycle-test.mjs` →
  `test/integration/lifecycle-manager.test.mjs` →
  `scripts/ci-lifecycle-smoke.mjs`
- Cross-version migration integration:
  `test/integration/lifecycle-migration.test.mjs`

## Repair batches

| Control                                                                                          | Baseline gap                                                                                                                                                                                              | Repair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence and disposition                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewed-mainline origin ([#94](https://github.com/RoryGlenn/commitment-issues/issues/94))       | A matching version tag could reach npm without proving its commit belonged to `main`.                                                                                                                     | Full history is fetched and the tested ancestry helper fails before dependency installation, packing, or publication when the tag commit is outside canonical `origin/main`. Positive, negative, diagnostic, and ordering invariants are covered. Live [`release-tag-authority`](https://github.com/RoryGlenn/commitment-issues/rules/18965736) and [`immutable-release-tags`](https://github.com/RoryGlenn/commitment-issues/rules/18965738) rules restrict `v*` creation to repository admins and block updates/deletions with no bypass.                                               | Merged in [#188](https://github.com/RoryGlenn/commitment-issues/pull/188); the hosted pull-request matrix passed [22/22 jobs](https://github.com/RoryGlenn/commitment-issues/actions/runs/29387301292).                                          |
| Exact release artifact ([#182](https://github.com/RoryGlenn/commitment-issues/issues/182))       | Lifecycle integration packed a disposable tarball, then the workflow created a second tarball for publication.                                                                                            | The workflow packs once, tests and hashes those bytes in a read-only candidate job, then verifies the hash after artifact handoff before npm publish and GitHub Release. Every required npm CI matrix lane also packs once outside the lifecycle test and supplies that exact path; direct/default lifecycle invocation still self-packs.                                                                                                                                                                                                                                                 | Merged in #188; the hosted Linux, macOS, Windows, npm, Yarn, pnpm, and Bun lifecycle lanes passed.                                                                                                                                               |
| Packed executable contract                                                                       | The lifecycle proved the bin launched but did not explicitly record every packed mode or compare the CLI version to the packed manifest.                                                                  | POSIX and release-producer tarball metadata must contain only `scripts/cli.mjs` at `0755`; every other regular file must be `0644`. Every platform requires the installed bin mapping, exact Node shebang, `--version`, installability, and unchanged digest to match the package. Windows does not claim authoritative POSIX mode metadata.                                                                                                                                                                                                                                              | Merged in #188; local exact-tarball checks and the cross-platform hosted matrix passed.                                                                                                                                                          |
| Partial-publication recovery ([#183](https://github.com/RoryGlenn/commitment-issues/issues/183)) | A full rerun after npm succeeded attempted duplicate publication, while fix-forward guidance did not distinguish a resumable exact downstream failure from an inconsistent release.                       | Recovery classifies `before-npm`, `after-npm`, and `complete`; inconsistent or unknown state fails closed. Before-npm requires no draft or release. Incomplete recovery requires `latest` to remain on the candidate. The final job cryptographically verifies local SLSA provenance, and every draft asset must be byte-identical to it; a draft containing provenance can resume only through a failed-job rerun that retains the original bundle. Published partial releases cannot resume. Dist-tag changes and deprecation remain manual owner actions, and unpublish is prohibited. | Merged in [#189](https://github.com/RoryGlenn/commitment-issues/pull/189); mocked positive, negative, mismatch, provenance-continuity, dist-tag, and idempotence fixtures exercise the decision without publishing a real package.               |
| Cross-version migration ([#96](https://github.com/RoryGlenn/commitment-issues/issues/96))        | Fresh installs could not prove that released Husky wiring, stale native hook bodies, project-owned lifecycle commands, custom hooks, or lockfile state survived an upgrade safely.                        | Immutable v2.5.1, v3.2.0, and v3.3.2 release artifacts are pinned by digest and upgraded to the exact candidate tarball. The migration must refresh or remove only exact generated state, preserve custom hooks and project-owned `prepare` logic, and execute the resulting hooks during a real commit and push. Automatic in-place downgrade is unsupported; rollback is current-version cleanup followed by a pinned target/lockfile/peer restore and target `init`/`doctor`.                                                                                                          | Merged in [#190](https://github.com/RoryGlenn/commitment-issues/pull/190); npm on Ubuntu/Node 24 gates pull requests, publish reuses the exact release tarball, and weekly health extends the migration to pnpm, Yarn Classic, and Bun.          |
| Release metadata consistency ([#184](https://github.com/RoryGlenn/commitment-issues/issues/184)) | Package, lockfile, tag, changelog, Release title, and Release body could drift independently; the immutable v3.3.0 and v3.3.2 Releases already have empty bodies.                                         | One dependency-free validator now requires the manifest, both lockfile root records, exact tag, one canonical dated changelog section, and substantive reviewed notes to agree. Pull requests and tags run it before release-capable work; the final action uses its deterministic `vX.Y.Z` title and extracted notes. Recovery rejects mismatched published metadata except for the fixed legacy empty-note boundary recorded through v3.3.2.                                                                                                                                            | Merged in [#191](https://github.com/RoryGlenn/commitment-issues/pull/191); positive and negative metadata fixtures, workflow invariants, recovery checks, and the historical ledger supply repeatable evidence without rewriting public history. |
| Published script surface ([#185](https://github.com/RoryGlenn/commitment-issues/issues/185))     | The directory-wide package allowlist shipped six lifecycle and coverage maintenance modules that installed consumers never execute.                                                                       | `package.json` now names each of the 28 runtime modules explicitly. The existing coverage classification supplies the complementary six-file repository-only set, and package tests require every script to be classified exactly once, preserve the bin and relative-import closure, and reject maintenance files in the real pack manifest.                                                                                                                                                                                                                                             | Merged in [#192](https://github.com/RoryGlenn/commitment-issues/pull/192); the hosted package-manager matrix and package inspection passed.                                                                                                      |
| Packed Markdown links ([#186](https://github.com/RoryGlenn/commitment-issues/issues/186))        | Seven links from shipped Markdown resolved only in the source checkout, so they broke on npm and after installation.                                                                                      | A reusable validator derives its file boundary from the exact `npm pack` manifest, covers inline, reference, image, and HTML links, and runs again against the clean installed package in every lifecycle lane. Repository-only policy, planning, coverage, and audit targets now use canonical GitHub URLs rather than expanding the tarball.                                                                                                                                                                                                                                            | Merged in [#193](https://github.com/RoryGlenn/commitment-issues/pull/193); positive/negative fixtures, the hosted matrix, and installed-package validation passed.                                                                               |
| Collaborator authority ([#187](https://github.com/RoryGlenn/commitment-issues/issues/187))       | Two active issue contributors had direct write access but were absent from the membership and sensitive-authority record. Personal-repository write also permits PR merges and GitHub Release management. | Both grants are now recorded as time-bounded access for assigned issues #141 and #142, not maintainer or release authority. The authority matrix distinguishes technical capability from approved scope across repository administration, `main`, version tags, Actions, Releases, npm, private reports, and integrations. A monthly/pre-release checklist records dated, privacy-bounded evidence and removes access when the assignment ends.                                                                                                                                           | Merged in [#194](https://github.com/RoryGlenn/commitment-issues/pull/194); recheck the grants by issue closure or 2026-08-15 and complete the npm UI-only verification in #195 before publication.                                               |

The repository-controlled ancestry step is necessary but not the complete trust
boundary. GitHub executes the workflow version at the pushed tag, so live tag
rules must prevent a non-release writer from supplying a tag whose workflow
omits the check. Do not test those settings with a disposable `v*` tag because
every matching tag triggers publication.

## Pinned upgrade fixtures

The migration lifecycle downloads fixed GitHub Release asset URLs and verifies
their SHA-256 values before installing the files locally. Each source Release is
immutable, so the historical `commitment-issues` bytes never come from a moving
npm dist-tag or mutable registry lookup. Supporting peer tools still install at
explicit versions from npm; registry availability is not used to choose the
historical package fixture.

| Fixture | Boundary                                                                  | Immutable asset                                                                                                                      | SHA-256                                                            |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| v2.5.1  | Last pre-3.0 Husky/lint-staged release                                    | [`commitment-issues-2.5.1.tgz`](https://github.com/RoryGlenn/commitment-issues/releases/download/v2.5.1/commitment-issues-2.5.1.tgz) | `8e05556ce9cc4952596636eb46bb6f739253d70174ff70c27bda274eb014ad4f` |
| v3.2.0  | Previous minor and older pre-push body without forwarded remote arguments | [`commitment-issues-3.2.0.tgz`](https://github.com/RoryGlenn/commitment-issues/releases/download/v3.2.0/commitment-issues-3.2.0.tgz) | `51ca6491be160098c7a152c6e6a8c76dcdd01f7bbcead06c938f06e513fa4134` |
| v3.3.2  | Latest published baseline and exact PATH-fallback native hook bodies      | [`commitment-issues-3.3.2.tgz`](https://github.com/RoryGlenn/commitment-issues/releases/download/v3.3.2/commitment-issues-3.3.2.tgz) | `01cbf76a27b0bc82d4334021a067fcd34ad7a62aa0ec9c6044efe78c5932551e` |

Historical peer tools are selected explicitly by the migration setup, and the
candidate is always supplied as a local tarball. v3.3.0 has the same
migration-relevant runtime files as v3.3.2, while v3.3.1 never became a package,
so neither adds a distinct upgrade boundary.

The required pull-request job runs all three npm upgrades on Ubuntu/Node 24.
The publish workflow's read-only candidate job supplies the already-packed
tarball to the same npm migration rather than repacking it. Only after the tests
pass does an artifact-and-hash handoff enter the OIDC-enabled publish job, which
does not install registry dependencies. Weekly repository health runs the
equivalent pnpm, Yarn Classic, and Bun paths. Node 24 is intentional because the
v2.5.1 and v3.2.0 fixtures require Node `>=22.22.1`.

## Historical release and tag evidence

- All 18 current remote version tags resolve to commits in current `main`.
- npm versions `1.1.1`, `2.0.0`, `2.1.1`, and `2.5.0` have no current remote
  tag; these are historical state to document, not authorization to recreate
  tags.
- `v3.1.0` was historically moved between two mainline commits and remains the
  frozen exception documented in the release guide.
- `v3.3.0` reached npm with registry provenance, but its GitHub Release is
  published, immutable, and contains no assets. It is a non-resumable published
  partial release; `latest` now points to the complete v3.3.2 replacement.
- `v3.3.1` is a consumed failed tag with no npm version or GitHub Release; it
  failed before jobs started, required a workflow fix, and must remain
  immutable.
- The ten current GitHub Releases report immutable, and v3.3.2 remains the
  validated exact-tarball/provenance baseline even though its Release body is a
  legacy empty-note exception.
- `.github/release-history.json` records the exact v3.3.0, v3.3.1, and v3.3.2
  publication/note states as machine-readable historical evidence. The ledger
  cannot exempt releases after v3.3.2 from reviewed notes.

## Published registry baseline

The exact `commitment-issues@3.3.2` version was downloaded from npm again on
2026-07-15 without relying on the moving `latest` tag. Its tarball SHA-256 was
`01cbf76a27b0bc82d4334021a067fcd34ad7a62aa0ec9c6044efe78c5932551e`, matching
the immutable GitHub Release asset and pinned migration fixture above.

A clean disposable Git repository installed that exact registry version and
exercised `--version`, `--help`, `init --dry-run`, initial and repeated `init`,
`doctor`, the optional `commit-msg` hook, a real commit through `pre-commit`, a
real push through `pre-push`, `uninstall --dry-run`, uninstall, and dependency
removal. `npm audit signatures` verified `commitment-issues@3.3.2` with both npm
publish and SLSA provenance attestations.

The current candidate's stricter lifecycle integration stops at the historical
v3.3.2 package's packed relative Markdown links repaired by #186. That is a
verified historical boundary, not an unresolved candidate defect: the exact
candidate now passes the same installed-package link check in the hosted npm,
pnpm, Yarn, and Bun lanes. The separate clean registry lifecycle above records
the published baseline's runtime behavior without pretending that v3.3.2
satisfies the prospective link invariant.

## Tracked findings

| Issue                                                             | Final disposition                                                                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#96](https://github.com/RoryGlenn/commitment-issues/issues/96)   | Closed by #190: pinned forward-upgrade fixtures, ownership-preservation assertions, real Git behavior, and an explicit unsupported in-place-downgrade/manual-rollback contract.                                 |
| [#175](https://github.com/RoryGlenn/commitment-issues/issues/175) | Accepted and deferred as non-blocking maintenance. The real stateful lifecycle remains required and passing; named phases improve diagnostics and ownership but do not fill a release-integrity or support gap. |
| [#183](https://github.com/RoryGlenn/commitment-issues/issues/183) | Closed by #189: fail-closed partial-publication classification, exact provenance continuity, immutable draft rules, and fix-forward recovery.                                                                   |
| [#184](https://github.com/RoryGlenn/commitment-issues/issues/184) | Closed by #191: release metadata validation, reviewed changelog extraction, exact Release title/body inputs, recovery checks, and a fixed historical exceptions ledger.                                         |
| [#185](https://github.com/RoryGlenn/commitment-issues/issues/185) | Closed by #192: explicit runtime allowlist, package-import closure, and hosted package-manager evidence exclude maintainer-only scripts.                                                                        |
| [#186](https://github.com/RoryGlenn/commitment-issues/issues/186) | Closed by #193: exact-manifest and clean-install link validation plus canonical GitHub URLs for repository-only targets.                                                                                        |
| [#187](https://github.com/RoryGlenn/commitment-issues/issues/187) | Closed by #194: time-bounded contributor grants, an effective authority matrix, and a recurring dated access review.                                                                                            |
| [#195](https://github.com/RoryGlenn/commitment-issues/issues/195) | Control completed 2026-07-16: owner authentication verified this repository, `publish.yml`, no Environment claim, publish permission, `mfa=publish`, `auth-and-writes` 2FA, and zero tokens.                    |

## Release-readiness verdict

Audit 7 is complete. The repository-controlled release candidate has no open
Critical or High release-integrity finding: exact-artifact publication,
reviewed-main ancestry, tag immutability, package contents and permissions,
metadata, provenance, retry/fix-forward behavior, upgrades, rollback guidance,
and clean installation are covered by tests or recorded evidence. This
completion unblocks the documentation and governance review in #137.

The Audit 7 npm publication control is complete. On 2026-07-16, the
owner-authenticated review confirmed the trusted publisher's repository,
`publish.yml` workflow, absent Environment claim, and publication permission.
Package publishing was set to `mfa=publish`, the account uses
`auth-and-writes` 2FA, and the privacy-bounded token inventory returned zero
account tokens. The matching 3.4.0 release preflight passed without changing a
version, tag, Release, registry entry, or package publication.

This Audit 7 result does not authorize an immediate publish. Final release
readiness remains blocked by the external-fork, OpenSSF, exact-candidate, and
GUI-client evidence owned by #138.

Issue #175 remains scheduled maintenance rather than a release blocker because
the current lifecycle already exercises the real artifact and Git/package-manager
behavior; the refactor changes test structure and diagnostics, not product or
release correctness. Final launch readiness still requires independent
verification in #138.

## Verification log

| Command or evidence                                                                          | Result                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline comparison                                                                          | The new ancestry, ordering, exact-artifact forwarding, and argument-validation invariants were absent at `7a85048`; the repaired branch now exercises each positive and negative path.                            |
| `node --test test/release-integrity.test.mjs test/ci-policy.test.mjs test/metadata.test.mjs` | Passed, 53/53, including exact ancestry, decorated version-output, near-match rejection, and platform-boundary fixtures.                                                                                          |
| `node tools/run-prebuilt-lifecycle-test.mjs`                                                 | Passed the full npm workspace, hook, clone, linked-worktree, repair, uninstall, mode, shebang, bin, version, supplied-artifact digest handshake, and unchanged-digest lifecycle.                                  |
| `node --test test/packed-markdown-links.test.mjs`                                            | Passed, 3/3. Valid packaged targets are accepted; omitted, escaping, and malformed targets fail; an installed-directory fixture detects a removed target.                                                         |
| `npm run test:lifecycle:npm`                                                                 | Passed the full clean-install npm lifecycle, including installed-package Markdown link validation.                                                                                                                |
| Pinned pnpm 10, Yarn 1.22.22, and Bun 1.3.14 lifecycle commands                              | Passed all three full clean-install lifecycles, including installed-package Markdown link validation through each manager's node_modules layout.                                                                  |
| Immutable migration fixture inventory                                                        | v2.5.1, v3.2.0, and v3.3.2 GitHub Releases are immutable; their asset SHA-256 values are pinned above and verified before local installation.                                                                     |
| Cross-version lifecycle policy                                                               | npm/Ubuntu/Node 24 gates pull requests, publish consumes its exact candidate tarball, and pnpm/Yarn/Bun run weekly; in-place downgrade remains explicitly unsupported.                                            |
| Historical recovery evidence                                                                 | `v3.3.0` classified as a non-resumable published partial release, `v3.3.1` as a pre-npm failure requiring a workflow edit, and `v3.3.2` as complete.                                                              |
| 2026-07-15 sensitive-authority snapshot                                                      | Live collaborator, ruleset, Actions, environment, secret, integration, security, GitHub Release, npm-owner, and issue-assignment evidence was reconciled into the privacy-bounded authority record.               |
| `npm pack commitment-issues@3.3.2`                                                           | Downloaded the exact registry version; SHA-256 matched the immutable GitHub Release asset and pinned fixture: `01cbf76a27b0bc82d4334021a067fcd34ad7a62aa0ec9c6044efe78c5932551e`.                                 |
| Clean registry-install lifecycle                                                             | Exact v3.3.2 passed version/help, dry-run and repeated init, doctor, optional commit-message wiring, real commit/push hooks, uninstall preview, uninstall, and dependency removal in a disposable repository.     |
| `npm audit signatures`                                                                       | Verified `commitment-issues@3.3.2` with npm publish and SLSA provenance attestations; no invalid or missing package signature was reported.                                                                       |
| Current lifecycle against registry v3.3.2                                                    | Stopped at the historical packed Markdown links fixed by #186; the candidate's installed-package link invariant passes across the hosted package-manager matrix.                                                  |
| `node --test test/release-metadata.test.mjs test/release-recovery.test.mjs`                  | Passed, 59/59. Future release metadata, fixed legacy exceptions, exact title/body recovery, retry states, provenance continuity, and source/digest/publication mismatches are mocked without a registry mutation. |
| `npm run release:validate`                                                                   | Package and lockfile roots, derived tag, unique dated changelog section, reviewed notes, and fixed historical classifications agree; negative fixtures reject structural drift with field-specific diagnostics.   |
| `npm test`                                                                                   | Passed, 798/798, including the sensitive-authority record, recurring review cadence, time-bounded access, privacy guard, and conditional Audit 7 closeout contract.                                               |
| `npm run coverage:check`                                                                     | Passed with 100% line, branch, and function coverage; the README badge is current.                                                                                                                                |
| `npm pack --dry-run --json --ignore-scripts`                                                 | Passed with 53 reviewed package entries; `scripts/cli.mjs` is executable and every other packed file is non-executable.                                                                                           |
| `npm audit --audit-level=high`                                                               | Passed with zero vulnerabilities.                                                                                                                                                                                 |
| `npm run lint`                                                                               | Passed.                                                                                                                                                                                                           |
| `npm run format:check`; `git diff --check`                                                   | Passed after formatting the repaired files.                                                                                                                                                                       |
