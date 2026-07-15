# Audit 7: Release, Packaging, and Upgrades

> Status: **in progress**. This report records the first release-integrity
> repairs and known findings. It is not a release-readiness sign-off.

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

| Control                                                                                          | Baseline gap                                                                                                                                                                        | Repair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence and disposition                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed-mainline origin ([#94](https://github.com/RoryGlenn/commitment-issues/issues/94))       | A matching version tag could reach npm without proving its commit belonged to `main`.                                                                                               | Full history is fetched and the tested ancestry helper fails before dependency installation, packing, or publication when the tag commit is outside canonical `origin/main`. Positive, negative, diagnostic, and ordering invariants are covered. Live [`release-tag-authority`](https://github.com/RoryGlenn/commitment-issues/rules/18965736) and [`immutable-release-tags`](https://github.com/RoryGlenn/commitment-issues/rules/18965738) rules restrict `v*` creation to repository admins and block updates/deletions with no bypass.                                               | Merged in [#188](https://github.com/RoryGlenn/commitment-issues/pull/188); the hosted pull-request matrix passed [22/22 jobs](https://github.com/RoryGlenn/commitment-issues/actions/runs/29387301292).                                              |
| Exact release artifact ([#182](https://github.com/RoryGlenn/commitment-issues/issues/182))       | Lifecycle integration packed a disposable tarball, then the workflow created a second tarball for publication.                                                                      | The workflow packs once, tests and hashes those bytes in a read-only candidate job, then verifies the hash after artifact handoff before npm publish and GitHub Release. Every required npm CI matrix lane also packs once outside the lifecycle test and supplies that exact path; direct/default lifecycle invocation still self-packs.                                                                                                                                                                                                                                                 | Merged in #188; the hosted Linux, macOS, Windows, npm, Yarn, pnpm, and Bun lifecycle lanes passed.                                                                                                                                                   |
| Packed executable contract                                                                       | The lifecycle proved the bin launched but did not explicitly record every packed mode or compare the CLI version to the packed manifest.                                            | POSIX and release-producer tarball metadata must contain only `scripts/cli.mjs` at `0755`; every other regular file must be `0644`. Every platform requires the installed bin mapping, exact Node shebang, `--version`, installability, and unchanged digest to match the package. Windows does not claim authoritative POSIX mode metadata.                                                                                                                                                                                                                                              | Merged in #188; local exact-tarball checks and the cross-platform hosted matrix passed.                                                                                                                                                              |
| Partial-publication recovery ([#183](https://github.com/RoryGlenn/commitment-issues/issues/183)) | A full rerun after npm succeeded attempted duplicate publication, while fix-forward guidance did not distinguish a resumable exact downstream failure from an inconsistent release. | Recovery classifies `before-npm`, `after-npm`, and `complete`; inconsistent or unknown state fails closed. Before-npm requires no draft or release. Incomplete recovery requires `latest` to remain on the candidate. The final job cryptographically verifies local SLSA provenance, and every draft asset must be byte-identical to it; a draft containing provenance can resume only through a failed-job rerun that retains the original bundle. Published partial releases cannot resume. Dist-tag changes and deprecation remain manual owner actions, and unpublish is prohibited. | Mocked positive, negative, mismatch, provenance-continuity, dist-tag, and idempotence fixtures exercise the decision without publishing a real package. Close #183 after this repair passes review and merges.                                       |
| Cross-version migration ([#96](https://github.com/RoryGlenn/commitment-issues/issues/96))        | Fresh installs could not prove that released Husky wiring, stale native hook bodies, project-owned lifecycle commands, custom hooks, or lockfile state survived an upgrade safely.  | Immutable v2.5.1, v3.2.0, and v3.3.2 release artifacts are pinned by digest and upgraded to the exact candidate tarball. The migration must refresh or remove only exact generated state, preserve custom hooks and project-owned `prepare` logic, and execute the resulting hooks during a real commit and push. Automatic in-place downgrade is unsupported; rollback is current-version cleanup followed by a pinned target/lockfile/peer restore and target `init`/`doctor`.                                                                                                          | npm on Ubuntu/Node 24 is required for pull requests; publish reuses the exact release tarball; weekly health extends the migration to pnpm, Yarn Classic, and Bun. Historical fixtures with a `>=22.22.1` floor do not run in the Node 22.11.0 lane. |

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
  validated exact-tarball/provenance baseline.

## Tracked findings

| Issue                                                             | Disposition                                                                                                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#96](https://github.com/RoryGlenn/commitment-issues/issues/96)   | Addressed by pinned forward-upgrade fixtures, ownership-preservation assertions, real Git behavior, and an explicit unsupported in-place-downgrade/manual-rollback contract. |
| [#175](https://github.com/RoryGlenn/commitment-issues/issues/175) | Refactor the monolithic lifecycle harness into named integration phases without weakening real package-manager evidence.                                                     |
| [#183](https://github.com/RoryGlenn/commitment-issues/issues/183) | Addressed by the current partial-publication recovery batch; close after merge.                                                                                              |
| [#184](https://github.com/RoryGlenn/commitment-issues/issues/184) | Enforce version, changelog, tag, and release-note consistency.                                                                                                               |
| [#185](https://github.com/RoryGlenn/commitment-issues/issues/185) | Exclude maintainer-only scripts from the npm tarball.                                                                                                                        |
| [#186](https://github.com/RoryGlenn/commitment-issues/issues/186) | Validate relative Markdown links inside the packed tarball.                                                                                                                  |
| [#187](https://github.com/RoryGlenn/commitment-issues/issues/187) | Reconcile write collaborators with the sensitive-access record and release authority.                                                                                        |

Pinned forward-upgrade evidence and the downgrade support boundary are now
defined. Changelog/release-note and fresh registry-install evidence are still
incomplete. Release retry, rollback, and duplicate-publication behavior have a
fail-closed state model and mocked positive/negative evidence. Audit #136 must
stay open until the remaining scenarios are executed or separately dispositioned
and the final release-readiness verdict replaces this in-progress status.

The npm trusted-publisher configuration could not be re-read in this pass: the
local npm CLI is unauthenticated and no signed-in browser session was
available. Its workflow/repository identity and any GitHub Environment binding
remain an explicit manual settings check before final sign-off.

## Verification log

| Command or evidence                                                                          | Result                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline comparison                                                                          | The new ancestry, ordering, exact-artifact forwarding, and argument-validation invariants were absent at `7a85048`; the repaired branch now exercises each positive and negative path.                                        |
| `node --test test/release-integrity.test.mjs test/ci-policy.test.mjs test/metadata.test.mjs` | Passed, 53/53, including exact ancestry, decorated version-output, near-match rejection, and platform-boundary fixtures.                                                                                                      |
| `node tools/run-prebuilt-lifecycle-test.mjs`                                                 | Passed the full npm workspace, hook, clone, linked-worktree, repair, uninstall, mode, shebang, bin, version, supplied-artifact digest handshake, and unchanged-digest lifecycle.                                              |
| `npm exec --yes --package yarn@1.22.22 -- npm run test:lifecycle:yarn`                       | Passed the full Yarn Classic lifecycle with manager-decorated CLI output.                                                                                                                                                     |
| Immutable migration fixture inventory                                                        | v2.5.1, v3.2.0, and v3.3.2 GitHub Releases are immutable; their asset SHA-256 values are pinned above and verified before local installation.                                                                                 |
| Cross-version lifecycle policy                                                               | npm/Ubuntu/Node 24 gates pull requests, publish consumes its exact candidate tarball, and pnpm/Yarn/Bun run weekly; in-place downgrade remains explicitly unsupported.                                                        |
| Historical recovery evidence                                                                 | `v3.3.0` classified as a non-resumable published partial release, `v3.3.1` as a pre-npm failure requiring a workflow edit, and `v3.3.2` as complete.                                                                          |
| `node --test test/release-recovery.test.mjs`                                                 | Exact before-npm and downstream retries, complete no-op, draft subsets, local/draft provenance continuity, `latest`, unavailable state, and source/digest/publication mismatches are mocked without a real registry mutation. |
| `npm test`                                                                                   | Passed, 741/741.                                                                                                                                                                                                              |
| `npm run coverage:check`                                                                     | Passed with 100% line, branch, and function coverage; the README badge is current.                                                                                                                                            |
| `npm run lint`                                                                               | Passed.                                                                                                                                                                                                                       |
| `npm run format:check`; `git diff --check`                                                   | Passed after formatting the repaired files.                                                                                                                                                                                   |
