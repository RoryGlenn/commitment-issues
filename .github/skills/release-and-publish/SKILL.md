---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version, publishing through the trusted-publishing workflow, updating CHANGELOG for a release, or debugging a failed publish. Covers the automated OIDC flow (release PR -> immutable merged commit -> tag push -> exact npm tarball + SLSA assets), collision preflight, fix-forward recovery, the CI Success gate, and post-release verification."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any release-mutating step (`npm version`, `git push origin vX.Y.Z`, or a manual `npm publish`), confirm intent with the user, state the exact target version, and run the preflight below.

- **Pushing a `vX.Y.Z` tag is the publish trigger.** With trusted publishing enabled, pushing that tag starts an npm publish from CI — treat the tag push itself as "publish now."
- **Never move or reuse a pushed or consumed release tag.** A retry may resume
  the same immutable release only when the tagged source and rebuilt artifact
  match the state already published. Any source, workflow, provenance, or
  digest mismatch requires a new patch version and tag. The only deletion
  exception is a tag proven unconsumed by any workflow or public artifact. The
  historical `v3.1.0` reuse is a frozen baseline exception, not a precedent.
- Prefer to let the user run the tag push, or run it only after explicit
  confirmation of the exact tag and merged commit.

## Trusted publishing status

Automated publishing uses **npm Trusted Publishing** (OIDC), so CI publishes
without an npm token. The publisher is registered and was validated end to end
by v3.3.2. Its expected npm configuration is:

- On npmjs.com → package `commitment-issues` → **Settings → Trusted Publishing** → add a GitHub Actions publisher: user `RoryGlenn`, repository `commitment-issues`, workflow `publish.yml` (leave environment blank unless one is added).

The workflow ([`publish.yml`](../../workflows/publish.yml)) triggers on `v*`
tags, fetches complete `main` history, and rejects any tag whose commit is not
reachable from the canonical `origin/main` before release-capable work begins.
It then sets `id-token: write`, verifies the bundled npm supports trusted
publishing, validates the package and lockfile versions, tag, unique changelog
section, and reviewed release notes, runs the suite, packs once, and passes that
exact tarball through lifecycle integration, hashing, artifact upload, and npm
publication. The SLSA generator retains its signed output as a workflow
artifact, and one final release action stages both files and publishes the
reviewed changelog section as the immutable GitHub Release body.

## Release flow (in order)

1. **Clean tree + green suite.** Ensure `git status` is clean and:
   ```bash
   npm test
   npm run lint
   npm run format:check
   npm run test:lifecycle:npm  # end-to-end npm packaging lifecycle
   ```
2. **Choose and preflight the exact version.** Decide whether the user-visible
   impact is patch, minor, or major; automation cannot make that semantic
   judgment. The preflight is read-only and fails if
   the version or tag already exists locally, on the remote, in GitHub
   Releases, or on npm:
   ```bash
   npm run release:preflight -- <version>
   ```
3. **Update and review the release notes.** Move items under `## [Unreleased]`
   in [`CHANGELOG.md`](../../../CHANGELOG.md) to one new
   `## [X.Y.Z] - YYYY-MM-DD` heading. Keep an empty `## [Unreleased]` at the
   top. A human must confirm that the section accurately describes functional,
   breaking, and security-relevant changes; the validator proves consistency,
   not editorial completeness.
4. **Bump to that exact version on a release branch without creating a tag yet.** This
   updates `package.json` and `package-lock.json`; the normal PR/DCO/review path
   still applies to release preparation:
   ```bash
   npm version <version> --no-git-tag-version
   npm run release:validate -- --tag vX.Y.Z
   git commit -s -am "chore: release vX.Y.Z"
   ```
   Open a pull request, pass `CI Success`, obtain approval (or record the
   temporary single-maintainer exception), and merge it.
5. **From the exact merged `main` commit, create and push only the immutable
   release tag — this publishes:**
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   Pushing the `vX.Y.Z` tag triggers [`publish.yml`](../../workflows/publish.yml),
   which first proves that the tagged commit belongs to `origin/main`, validates
   the same release metadata again, then publishes to npm via OIDC trusted
   publishing with automatic provenance and the reviewed changelog section as
   the GitHub Release notes. No `npm login`, no token. Before pushing, confirm
   the live `v*` tag rules still restrict release-tag creation to the release
   authority and prevent updates or deletion.
6. **Verify** the exact version is live, confirm the npm provenance/signature
   surfaces, confirm the GitHub Release contains both `.tgz` and
   `.intoto.jsonl`, compare the npm and GitHub tarballs, and run the independent
   SLSA verifier. Follow [`docs/release-verification.md`](../../../docs/release-verification.md),
   starting with:
   ```bash
   VERSION=X.Y.Z
   npm view "commitment-issues@$VERSION" version dist.integrity dist.signatures
   ```

`main` is protected (strict CI, DCO, review, linear history; squash/rebase
merges only). Version and changelog changes go through a PR. Pushing the tag
after that PR merges is the release operation and does not change `main`.

## Partial-publication recovery

Do not race the tag workflow with a manual `npm publish`. The current automated
path is the supported release path and is responsible for npm provenance, the
signed SLSA bundle, and the complete immutable GitHub Release.

If trusted publishing is unavailable before a tag is pushed, stop and restore
the npm publisher or workflow before releasing. If a tagged run fails, do not
immediately rerun it. First record the version, run ID, tag commit, workflow job
results, npm state, npm dist-tags, and GitHub Release state. Classify the
failure at the external boundaries below:

| Observed state                                                                                                                                                                                                                              | Recovery                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before npm: the exact version is absent from npm and no GitHub Release, including a draft, exists                                                                                                                                           | Retry the same run only when the failure is transient and the tagged source and workflow need no edits. Otherwise fix through a normal pull request and release a new patch.                                      |
| After npm: npm contains the exact expected artifact and provenance, `latest` still names this version, and the GitHub Release is absent or remains an unpublished draft with the exact reviewed title/body and no assets or an exact subset | Prefer rerunning only failed jobs. A full rerun is allowed only when the tagged workflow needs no edits, rebuilt source and bytes match, and any draft does not already contain provenance from the original run. |
| Complete: npm and the immutable GitHub Release contain the exact tarball and matching provenance, validated `vX.Y.Z` title, and reviewed changelog body                                                                                     | Do nothing. Verification is idempotent; publication is complete.                                                                                                                                                  |
| Inconsistent: a lookup is unavailable, source or digest differs, an unexpected asset exists, or a published release is empty or partial outside the fixed historical ledger                                                                 | Fail closed. Preserve every public identifier, record the incident, and fix forward with a new patch.                                                                                                             |

GitHub recommends creating a draft, attaching every asset, and only then
publishing it. The final job cryptographically verifies its local SLSA bundle
before inspecting or publishing the draft. The draft title and body must match
the validated tag and reviewed changelog section, and every existing draft asset
must be byte-identical to that locally verified artifact. An empty draft or
exact tarball-only subset may resume through an exact full rerun. If the draft
already contains provenance, only a failed-job rerun retaining that original
provenance artifact may resume; a full rerun produces a new signed bundle and
must stop in favor of a new patch. A published release is immutable in this
repository; an empty or partial published release cannot be repaired by adding,
deleting, or replacing assets. The only empty-body exceptions are the fixed
v3.3.0 and v3.3.2 observations in `.github/release-history.json`.

### Recovery checks and retry

Use read-only checks before authorizing a retry. The workflow run must be a
`push` for `v$VERSION`, its head SHA must equal the tag's peeled commit, and npm
provenance must name the expected repository, workflow, tag, and commit.

```bash
VERSION=X.Y.Z
RUN_ID=<failed-run-id>

gh run view "$RUN_ID" --json event,headBranch,headSha,jobs,url
git ls-remote --tags origin \
  "refs/tags/v$VERSION" "refs/tags/v$VERSION^{}"
npm view "commitment-issues@$VERSION" \
  version dist.integrity dist.attestations deprecated
npm dist-tag ls commitment-issues
gh release view "v$VERSION" \
  --json name,body,isDraft,isImmutable,targetCommitish,assets,url
```

An npm `E404` means the npm boundary was not crossed; any other failed or
malformed lookup is unknown state and must fail closed. An incomplete or draft
release may resume automatically only while npm's `latest` dist-tag still names
the candidate version. A rollback or newer `latest` is an operator decision and
blocks automatic resume; do not move the pointer merely to make the gate pass.
npm's integrity and attestation subject use SHA-512, while the workflow's
generic SLSA subject uses SHA-256. Download the exact registry tarball and hash
its bytes before comparing it with the rebuilt or retained workflow artifact;
do not compare the encoded integrity strings across algorithms.

When every check matches, prefer rerunning only failed jobs so a successful npm
job remains untouched:

```bash
gh run rerun "$RUN_ID" --failed
```

A full rerun (`gh run rerun "$RUN_ID"`) is acceptable only when the tagged
workflow needs no change and its `tools/release-recovery.mjs` gate classifies
the existing npm artifact as the exact rebuilt artifact from the exact tagged
source. `latest` must still name the candidate, and a draft must not already
contain provenance from the original attempt. The gate must set npm publication
to a no-op; publishing an existing `package@version` again is never a recovery
action. If the original signed provenance is required, use a failed-job rerun
that retains it. If neither a retained artifact nor a byte-identical rebuild is
available, the rebuild does not match, or a code/workflow change is required,
create a new patch release instead.

### npm dist-tags and incomplete versions

Moving `latest` back to a verified complete version and deprecating an
incomplete version are manual owner decisions. They are never automated by the
recovery workflow or an agent. After verifying `LAST_GOOD` independently, the
owner may explicitly authorize:

```bash
npm dist-tag add "commitment-issues@$LAST_GOOD" latest
npm deprecate "commitment-issues@$VERSION" \
  "Incomplete release; use $LAST_GOOD or a later fixed version."
```

Never use `npm unpublish` for recovery. Registry publication is permanent for
the purposes of release identity, and an unpublished version cannot be reused.
A manual npm publish requires the separately approved incident procedure below;
it is not a routine fallback.

### Explicitly approved manual incident publication

Use this only when the owner explicitly authorizes an npm-only incident
publication and accepts that it cannot satisfy the normal GitHub Release/SLSA
invariant. Do not push the matching tag while the current workflow would race
or retry the same npm version. Record the incomplete publication, restore the
automated path, and resume complete releases with a new patch version.

The user must authenticate interactively with npm and verify the expected
account. Publishing a tarball does not run this root package's
`prepublishOnly`, so run the suite, pack once, and exercise that exact artifact
before publishing it:

```bash
VERSION=X.Y.Z
npm login
npm whoami
npm run release:validate -- --tag "v$VERSION"
npm test
tarball="$(npm pack --silent | tail -n1)"
npm run test:lifecycle:npm -- --tarball "$tarball"
npm publish "./$tarball" --access public
```

The agent must not perform `npm login`, handle credentials, or present this
npm-only path as a complete signed release.

## Gotchas

- **Trusted publishing needs all release metadata to agree.** `publish.yml`
  fails fast unless the package and lockfile versions, pushed `vX.Y.Z` tag,
  unique dated changelog section, and reviewed notes match. Always bump with
  `npm version`, review the changelog, and run `release:validate` before
  creating the tag.
- **Release tags must belong to reviewed mainline history.** The workflow fetches
  complete history and fails before dependency installation, packing, or
  publication unless the tagged commit is an ancestor of canonical
  `origin/main`. Live tag rules are the external authority boundary: keep `v*`
  creation restricted to the release manager and keep consumed tags
  non-updatable and non-deletable.
- **Trusted publishing requires npm ≥ 11.5.1 and `id-token: write`.** `publish.yml` verifies the bundled npm version and sets the permission; it does not self-update npm during a release. If a publish job errors with an OIDC/authentication message, confirm the trusted publisher is registered on npm for repo `RoryGlenn/commitment-issues` + workflow `publish.yml`.
- **Never recover by moving a tag or republishing an npm version.** An exact
  same-run retry may finish work that has not crossed an external boundary, or
  may resume downstream work after the recovery gate treats an exact existing
  npm artifact as a no-op. Any mismatch requires a new patch. A local or remote
  tag may be deleted only if no workflow has consumed it and no GitHub Release
  or npm version exists.
- **Immutable release assets must be uploaded together before publication.**
  Keep the SLSA generator's `upload-assets` input disabled, download its signed
  provenance artifact beside the packed tarball, and let one Node 24 release
  action upload both files before it finalizes the draft. A later job cannot
  add or replace assets on the published release. The SLSA caller must still
  grant `contents: write`: its reusable workflow declares a nested upload job,
  and GitHub validates that permission contract even when the input skips the
  job. Changes to `publish.yml` or its ancestry helper run the harmless
  pull-request validation job so GitHub checks this external contract before
  merge.
- **Publishing a tarball does not run this root package's `prepublishOnly`.** The
  automated and manual flows run `npm test`, pack once, and then pass that exact
  `.tgz` to `npm run test:lifecycle:npm -- --tarball ...` before hashing or
  publishing it. Keep both gates; `prepublishOnly` remains defense in depth for
  a direct root-directory publish.
- **`prepublishOnly` failing** blocks a direct root-directory publish by design
  — it validates release metadata, runs the full test suite, and exercises the
  packaging lifecycle. Fix the failure; do not bypass it.
- **What ships:** `package.json` `files` explicitly allowlists the installed CLI,
  command, and runtime-helper modules plus selected `assets/*.svg`, `docs/`,
  `README.md`, `CHANGELOG.md`, and `LICENSE`. Lifecycle/coverage maintenance
  modules under `scripts/` stay repository-only. Promotional raster/video media
  stays in the source repository and is referenced by GitHub-hosted URLs.
  Everything in `.github/` (governance files, these skills) and `test/` is
  intentionally excluded from the tarball. Relative links in shipped Markdown
  must resolve within that exact manifest; use canonical GitHub URLs when a
  shipped guide references repository-only evidence. Verify with
  `npm pack --dry-run` before publishing if the file list changed.

## CI / required checks

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`needs: [dco, quality, check, pm-lifecycle, codeql]`, `if: always()`), which fails unless DCO, static workflow/dependency quality, every OS/Node matrix leg, every package-manager lifecycle integration, and CodeQL report success. Skipped or otherwise incomplete required jobs fail closed too. This keeps the required-check list stable across matrix changes — don't rename it without updating the ruleset.
- Dependabot groups minor/patch bumps; **major** dependency bumps arrive as individual PRs and some (e.g. eslint 9→10) are expected to fail CI until the breaking change is handled — that's the `CI Success` gate doing its job, not a regression to force-merge.

## Post-release

- Confirm the exact version is live:
  `npm view "commitment-issues@X.Y.Z" version`.
- Confirm every release job completed as intended. If recovery was necessary,
  link the original run, the retry, the state classification, and the matching
  source/digest evidence.
- Verify npm registry signatures/attestations, byte-identical npm/GitHub
  tarballs, and the SLSA source/tag/commit using the release-verification guide.
- Confirm the GitHub Release is immutable and contains exactly the expected
  `.tgz` and `.intoto.jsonl` assets.
- The npm version/downloads badges in `README.md` update automatically.
