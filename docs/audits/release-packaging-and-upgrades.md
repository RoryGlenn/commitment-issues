# Audit 7: Release, Packaging, and Upgrades

> Status: **in progress**. This report records the first release-integrity
> repairs and known findings. It is not a release-readiness sign-off.

## Baseline

- Tracker: [#136](https://github.com/RoryGlenn/commitment-issues/issues/136)
- Audit baseline: `7a8504863eb798bed1b687a3f06f61b21780af3b`
- Package baseline: `commitment-issues@3.3.2`
- Release workflow: `.github/workflows/publish.yml`
- Lifecycle integration: `scripts/run-lifecycle-test.mjs` →
  `test/integration/lifecycle-manager.test.mjs` →
  `scripts/ci-lifecycle-smoke.mjs`

## First repair batch

| Control                                                                                    | Baseline gap                                                                                                                             | Repair in this branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Remaining evidence                                                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Reviewed-mainline origin ([#94](https://github.com/RoryGlenn/commitment-issues/issues/94)) | A matching version tag could reach npm without proving its commit belonged to `main`.                                                    | Full history is fetched and the tested ancestry helper fails before dependency installation, packing, or publication when the tag commit is outside canonical `origin/main`. Positive, negative, diagnostic, and ordering invariants are covered. Live [`release-tag-authority`](https://github.com/RoryGlenn/commitment-issues/rules/18965736) and [`immutable-release-tags`](https://github.com/RoryGlenn/commitment-issues/rules/18965738) rules now restrict `v*` creation to repository admins and block updates/deletions with no bypass. | Merge the workflow gate and record hosted pull-request validation; do not trigger a release tag merely to test it. |
| Exact release artifact ([#182](https://github.com/RoryGlenn/commitment-issues/issues/182)) | Lifecycle integration packed a disposable tarball, then the workflow created a second tarball for publication.                           | The workflow packs once and passes the same path through lifecycle, hashing, upload, npm publish, and GitHub Release. Every required npm CI matrix lane also packs once outside the lifecycle test and supplies that exact path; direct/default lifecycle invocation still self-packs.                                                                                                                                                                                                                                                          | The prebuilt-tarball lifecycle passed locally; record the hosted matrix after the branch is published.             |
| Packed executable contract                                                                 | The lifecycle proved the bin launched but did not explicitly record every packed mode or compare the CLI version to the packed manifest. | POSIX and release-producer tarball metadata must contain only `scripts/cli.mjs` at `0755`; every other regular file must be `0644`. Every platform requires the installed bin mapping, exact Node shebang, `--version`, installability, and unchanged digest to match the package. Windows does not claim authoritative POSIX mode metadata.                                                                                                                                                                                                    | Local exact-tarball verification passed; record cross-platform hosted lifecycle results.                           |

The repository-controlled ancestry step is necessary but not the complete trust
boundary. GitHub executes the workflow version at the pushed tag, so live tag
rules must prevent a non-release writer from supplying a tag whose workflow
omits the check. Do not test those settings with a disposable `v*` tag because
every matching tag triggers publication.

## Historical release and tag evidence

- All 18 current remote version tags resolve to commits in current `main`.
- npm versions `1.1.1`, `2.0.0`, `2.1.1`, and `2.5.0` have no current remote
  tag; these are historical state to document, not authorization to recreate
  tags.
- `v3.1.0` was historically moved between two mainline commits and remains the
  frozen exception documented in the release guide.
- `v3.3.1` is a consumed failed tag with no npm version or GitHub Release; it
  must remain immutable.
- The ten current GitHub Releases report immutable, and v3.3.2 remains the
  validated exact-tarball/provenance baseline.

## Open findings

| Issue                                                             | Disposition                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [#96](https://github.com/RoryGlenn/commitment-issues/issues/96)   | Test and document upgrade/downgrade behavior, including Husky-era migration and stale generated hooks.                   |
| [#175](https://github.com/RoryGlenn/commitment-issues/issues/175) | Refactor the monolithic lifecycle harness into named integration phases without weakening real package-manager evidence. |
| [#183](https://github.com/RoryGlenn/commitment-issues/issues/183) | Define idempotent recovery after partial publication.                                                                    |
| [#184](https://github.com/RoryGlenn/commitment-issues/issues/184) | Enforce version, changelog, tag, and release-note consistency.                                                           |
| [#185](https://github.com/RoryGlenn/commitment-issues/issues/185) | Exclude maintainer-only scripts from the npm tarball.                                                                    |
| [#186](https://github.com/RoryGlenn/commitment-issues/issues/186) | Validate relative Markdown links inside the packed tarball.                                                              |
| [#187](https://github.com/RoryGlenn/commitment-issues/issues/187) | Reconcile write collaborators with the sensitive-access record and release authority.                                    |

Upgrade, downgrade, rollback, duplicate-publication, changelog/release-note,
and fresh registry-install evidence are still incomplete. Audit #136 must stay
open until those scenarios are executed or separately dispositioned and the
final release-readiness verdict replaces this in-progress status.

The npm trusted-publisher configuration could not be re-read in this pass: the
local npm CLI is unauthenticated and no signed-in browser session was
available. Its workflow/repository identity and any GitHub Environment binding
remain an explicit manual settings check before final sign-off.

## Verification log

| Command or evidence                                                                          | Result                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline comparison                                                                          | The new ancestry, ordering, exact-artifact forwarding, and argument-validation invariants were absent at `7a85048`; the repaired branch now exercises each positive and negative path. |
| `node --test test/release-integrity.test.mjs test/ci-policy.test.mjs test/metadata.test.mjs` | Passed, 53/53, including exact ancestry, decorated version-output, near-match rejection, and platform-boundary fixtures.                                                               |
| `node tools/run-prebuilt-lifecycle-test.mjs`                                                 | Passed the full npm workspace, hook, clone, linked-worktree, repair, uninstall, mode, shebang, bin, version, supplied-path, and unchanged-digest lifecycle.                            |
| `npm exec --yes --package yarn@1.22.22 -- npm run test:lifecycle:yarn`                       | Passed the full Yarn Classic lifecycle with manager-decorated CLI output.                                                                                                              |
| `npm test`                                                                                   | Passed, 725/725.                                                                                                                                                                       |
| `npm run coverage:check`                                                                     | Passed with 100% line, branch, and function coverage; the README badge is current.                                                                                                     |
| `npm run lint`                                                                               | Passed.                                                                                                                                                                                |
| `npm run format:check`; `git diff --check`                                                   | Passed after formatting the repaired files.                                                                                                                                            |
