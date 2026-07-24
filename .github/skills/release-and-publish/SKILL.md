---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version, publishing through the staged trusted-publishing workflow, updating CHANGELOG for a release, or debugging a failed publish. Covers the OIDC stage flow (release PR -> immutable merged commit -> tag push -> exact staged tarball + complete draft -> maintainer 2FA approval -> explicit GitHub finalizer), collision preflight, fix-forward recovery, the CI Success gate, and post-release verification."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any
release-mutating step (`npm version`, `git push origin vX.Y.Z`,
`npm stage approve`, or a manual `npm publish`), confirm intent with the user,
state the exact target version, and run the preflight below.

- **Pushing a `vX.Y.Z` tag consumes the release identity and creates the npm
  stage.** It does not make the package public. Treat it as irreversible because
  staged and published versions share npm's unique version index.
- **Only maintainer 2FA approval makes the staged npm package public.** Review
  the stage ID, exact tarball digest, staged download, signed provenance, and
  complete GitHub draft before running `npm stage approve <stage-id>`.
- **The explicit finalizer publishes only the already-complete GitHub draft.**
  It has no npm OIDC permission, registry authentication, or npm stage/publish
  command.
- **Never move or reuse a pushed or consumed release tag.** A retry may resume
  the same immutable release only when the tagged source and rebuilt artifact
  match the state already published. Any source, workflow, provenance, or
  digest mismatch requires a new patch version and tag. The only deletion
  exception is a tag proven unconsumed by any workflow or public artifact. The
  historical `v3.1.0` reuse is a frozen baseline exception, not a precedent.
- Prefer to let the user run the tag push, or run it only after explicit
  confirmation of the exact tag and merged commit.

## Trusted publishing status

Automated staging uses **npm Trusted Publishing** (OIDC), so CI does not need an
npm token. The publisher was validated end to end by v3.4.0. Before the first
staged release, its expected npm configuration is:

- On npmjs.com → package `commitment-issues` → **Settings → Trusted
  Publishing**: GitHub Actions publisher user `RoryGlenn`, repository
  `commitment-issues`, workflow `publish.yml`, environment blank, with
  **stage publish allowed and direct publish disallowed**.
- Under package publishing access, require 2FA and disallow traditional tokens.
  The workflow must not contain or receive a long-lived npm token.

The workflow ([`publish.yml`](../../workflows/publish.yml)) triggers on `v*`
tags, fetches complete `main` history, and rejects any tag whose commit is not
reachable from the canonical `origin/main` before release-capable work begins.
It validates Node >= 22.14.0 and npm >= 11.15.0, package and lockfile versions,
tag, unique changelog section, and reviewed release notes; runs the suite; packs
once; and passes that exact tarball through lifecycle integration, hashing, and
artifact upload. The only OIDC-capable npm job runs `npm stage publish` and
writes a deterministic record containing the stage ID, package/version/tag,
SHA-1, SHA-256, source commit, source workflow run/attempt, and exact Node/npm
versions. The SLSA generator retains its signed output, and the tag run prepares
a complete GitHub Release draft with both exact assets before showing approval
instructions.

After a maintainer reviews/downloads the staged package and approves it with
2FA, manually dispatch `Publish Package` with the exact release tag, successful
source run ID, and stage ID. That finalizer validates npm provenance, the source
run, stage record, draft, and assets, then publishes only the existing GitHub
draft.

For the normal release path, the single hosted pack accepted by the recovery
and publication gates is the authoritative byte-level candidate. The candidate
job records each run's filename, SHA-256, release tag, source commit, runner
OS/image, and exact Node/npm versions together without declaring a rejected
rebuild authoritative. A local pre-tag pack qualifies contents and behavior
only; never promise that its digest predicts the hosted digest unless both
archives were produced with the same pinned toolchain and then proved
byte-identical. See the separate archive and extracted-tree comparisons in
[`docs/release-verification.md`](../../../docs/release-verification.md).

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
   release tag — this stages the package and prepares the draft:**
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   Pushing the `vX.Y.Z` tag triggers [`publish.yml`](../../workflows/publish.yml),
   which proves that the tagged commit belongs to `origin/main`, validates the
   metadata, builds and tests one hosted archive, stages those exact bytes
   through OIDC, records the stage identity, and prepares a complete GitHub
   Release draft. No `npm login`, no token. Before pushing, confirm the live
   `v*` tag rules still restrict creation and prevent updates or deletion.
   Retain the successful run ID, stage ID, run-summary digest, runner, and
   Node/npm toolchain evidence.
6. **Review and approve npm with maintainer 2FA.** Do not approve from a failed
   tag run. Confirm the source run succeeded and the draft contains the exact
   `.tgz` and `.intoto.jsonl`, then inspect the recorded stage:
   ```bash
   npm stage view <stage-id>
   npm stage download <stage-id>
   npm stage approve <stage-id>
   ```
   Compare the downloaded tarball's SHA-1/SHA-256 with the durable stage record
   before approval. npm prompts for 2FA and makes the exact staged version
   public.
7. **Dispatch the GitHub-only finalizer.** In the `Publish Package` workflow,
   choose **Run workflow** and supply the exact `release_tag`, successful tag
   `source_run_id`, and approved `stage_id`. The finalizer has no npm
   publication authority. It proves npm now contains the expected bytes and
   provenance, then publishes the already-complete GitHub draft.
8. **Verify** the exact version is live, confirm the npm provenance/signature
   surfaces, confirm the GitHub Release contains both `.tgz` and
   `.intoto.jsonl`, compare the npm and GitHub tarballs, and run the independent
   SLSA verifier. Follow [`docs/release-verification.md`](../../../docs/release-verification.md),
   starting with:
   ```bash
   VERSION=X.Y.Z
   npm view "commitment-issues@$VERSION" version dist.integrity dist.signatures
   ```

`main` is protected (strict CI, DCO, review, linear history; squash/rebase
merges only). Version and changelog changes go through a PR. Pushing the tag,
approving the npm stage, and dispatching the finalizer do not change `main`.

## Partial-publication recovery

Do not race the tag workflow with a manual `npm publish`. The current automated
path is the supported release path and is responsible for npm provenance, the
signed SLSA bundle, and the complete immutable GitHub Release.

If trusted publishing is unavailable before a tag is pushed, stop and restore
the npm publisher or workflow before releasing. If a tagged run fails, do not
immediately rerun it. First record the version, run ID, tag commit, workflow job
results, npm state, npm dist-tags, and GitHub Release state. Classify the
failure at the external boundaries below:

| Observed state | Required evidence                                                                                                                                                                     | Recovery                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before stage   | The exact npm version is absent, there is no stage record, and no GitHub Release or draft exists.                                                                                     | A failed-job retry is allowed only for a transient failure before `npm stage publish`. If the workflow needs edits, fix forward with a new patch.                                                |
| Staged         | The exact immutable stage record exists; npm is not public; the complete draft may be absent while the tag run is still running or must contain the exact two assets before approval. | Resume only the failed downstream job in the same source run. Never fully rerun the stage job or create a second stage. Review the successful source run and complete draft before 2FA approval. |
| After npm      | npm contains the exact staged bytes and provenance, `latest` names the candidate, and one complete exact GitHub draft exists.                                                         | Run or rerun the explicit finalizer with the exact source run and stage IDs. It treats npm as read-only and publishes only the draft.                                                            |
| Complete       | npm and the immutable GitHub Release contain the exact tarball and matching provenance, validated title, and reviewed changelog body.                                                 | Do nothing. Verification and the finalizer are idempotent.                                                                                                                                       |
| Inconsistent   | A lookup is unavailable; source, run, stage ID, digest, provenance, tag, notes, or assets differ; or a published release is partial.                                                  | Fail closed. Preserve every identity, record the incident, and fix forward with a new patch.                                                                                                     |

The complete draft is a precondition for human npm approval, not downstream
cleanup. Its title and body must match the validated tag and reviewed changelog
section, and both assets must be byte-identical to the retained candidate and
signed provenance. The successful tag run uploads those three immutable
finalizer inputs (tarball, provenance, and stage record) together. The
finalizer downloads them only from the recorded successful `push` run and
verifies that run's tag, commit, workflow path, attempt, repository, and
conclusion before it inspects npm or publishes the draft.

Do not fully rerun a tag workflow after `npm stage publish` succeeds: npm stages
share the version uniqueness boundary with public releases. Prefer a failed-job
rerun that retains the original stage record and provenance. If staging
succeeded but the durable record cannot be recovered, stop and inspect the npm
stage with the owner account; reject or otherwise resolve it explicitly, then
fix forward. Never guess a stage ID or stage the same version again.

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

Before staging, an exact-version npm `E404` proves only that the version is not
public; the absence of a durable stage record and any draft is also required
for the `before-stage` state. After 2FA approval, the finalizer's
`--require-npm` confirmation allows only exact-version and exact-attestation
HTTP 404 responses to propagate:
it retries with 1, 2, 4, 8, 15, and 15 second backoffs inside a hard 60-second
deadline. Every successful response is still checked against the retained
tarball, package identity, `latest`, repository, workflow, tag, and commit.
Unexpected statuses, request failures, malformed data, and any mismatch stop
immediately; exhausting the retry budget or deadline fails closed. An incomplete or draft
release may resume automatically only while npm's `latest` dist-tag still names
the candidate version. A rollback or newer `latest` is an operator decision and
blocks automatic resume; do not move the pointer merely to make the gate pass.
npm's integrity and attestation subject use SHA-512, while the workflow's
generic SLSA subject uses SHA-256. Download the exact registry tarball and hash
its bytes before comparing it with the rebuilt or retained workflow artifact;
do not compare the encoded integrity strings across algorithms.

Before the stage boundary, or for a downstream failure that retains the
original stage record and provenance, rerun only failed jobs:

```bash
gh run rerun "$RUN_ID" --failed
```

Do not use a full rerun after the stage command succeeds. The stage ID and
signed artifacts belong to the original tag run, and rerunning the stage job
would attempt to consume the same npm version again. After npm approval, rerun
the separate `workflow_dispatch` finalizer with the exact original source run
and stage IDs; it cannot stage or publish npm. If the retained inputs are
unavailable, differ, or require a workflow change, preserve the consumed tag
and version and create a new patch instead.

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
- **Staged trusted publishing requires Node ≥ 22.14.0, npm ≥ 11.15.0,
  and `id-token: write`.** `publish.yml` pins Node 24.18.0 (npm 11.16.0),
  verifies both floors, and grants OIDC only to the stage job. If staging fails
  with an OIDC/authentication message, confirm the trusted publisher is
  registered for repo `RoryGlenn/commitment-issues` + workflow `publish.yml`
  and allows stage publish but disallows direct publish.
- **Never recover by moving a tag or republishing an npm version.** An exact
  same-run retry may finish work that has not crossed an external boundary, or
  may resume downstream work after the recovery gate treats an exact existing
  npm artifact as a no-op. Any mismatch requires a new patch. A local or remote
  tag may be deleted only if no workflow has consumed it and no GitHub Release
  or npm version exists.
- **Immutable release assets must be uploaded together before npm approval.**
  Keep the SLSA generator's `upload-assets` input disabled, download its signed
  provenance artifact beside the packed tarball, and let one Node 24 action
  create the complete draft. The GitHub-only finalizer publishes that existing
  draft without adding or replacing assets. The SLSA caller must still grant
  `contents: write`: its reusable workflow declares a nested upload job, and
  GitHub validates that permission contract even when the input skips the job.
  Changes to `publish.yml` or its release helpers run the harmless pull-request
  validation job so GitHub checks this external contract before merge.
- **Publishing a tarball does not run this root package's `prepublishOnly`.** The
  automated and manual flows run `npm test`, pack once, and then pass that exact
  `.tgz` to `npm run test:lifecycle:npm -- --tarball ...` before hashing or
  publishing it. Keep both gates; `prepublishOnly` remains defense in depth for
  a direct root-directory publish.
- **Equal package trees do not prove equal tarball bytes.** npm and its archive
  dependencies may encode or compress the same manifest differently across
  toolchain versions. The normal hosted candidate becomes authoritative only
  after the release/recovery gates accept it; record its SHA-256 beside the
  runner and exact Node/npm versions. Treat local pre-tag digests as
  environment-scoped qualification evidence unless the archive hashes actually
  match.
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

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`if: always()`), which fails unless DCO, static workflow/dependency quality, every OS/Node and packed shell matrix leg, every package-manager and migration lifecycle integration, and CodeQL report success. Skipped or otherwise incomplete required jobs fail closed too. This keeps the required-check list stable across matrix changes — don't rename it without updating the ruleset.
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
