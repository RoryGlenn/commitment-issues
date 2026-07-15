---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version, publishing through the trusted-publishing workflow, updating CHANGELOG for a release, or debugging a failed publish. Covers the automated OIDC flow (release PR -> immutable merged commit -> tag push -> exact npm tarball + SLSA assets), collision preflight, fix-forward recovery, the CI Success gate, and post-release verification."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any release-mutating step (`npm version`, `git push origin vX.Y.Z`, or a manual `npm publish`), confirm intent with the user, state the exact target version, and run the preflight below.

- **Pushing a `vX.Y.Z` tag is the publish trigger.** With trusted publishing enabled, pushing that tag starts an npm publish from CI — treat the tag push itself as "publish now."
- **Never move or reuse a pushed or consumed release tag.** If a publish fails
  after the tag is pushed, fix forward with a new patch version and tag. The
  only deletion exception is a tag proven unconsumed by any workflow or public
  artifact. The historical `v3.1.0` reuse is a frozen baseline exception, not
  a precedent.
- Prefer to let the user run the tag push, or run it only after explicit
  confirmation of the exact tag and merged commit.

## Trusted publishing status

Automated publishing uses **npm Trusted Publishing** (OIDC), so CI publishes
without an npm token. The publisher is registered and was validated end to end
by v3.3.2. Its expected npm configuration is:

- On npmjs.com → package `commitment-issues` → **Settings → Trusted Publishing** → add a GitHub Actions publisher: user `RoryGlenn`, repository `commitment-issues`, workflow `publish.yml` (leave environment blank unless one is added).

The workflow ([`publish.yml`](../../workflows/publish.yml)) triggers on `v*`
tags, sets `id-token: write`, verifies the bundled npm supports trusted
publishing, checks the tag against `package.json`, runs the suite and npm
lifecycle smoke, packs once, and publishes that exact tarball. The SLSA
generator retains its signed output as a workflow artifact, and one final
release action stages both files before publishing the immutable GitHub
Release.

## Release flow (in order)

1. **Clean tree + green suite.** Ensure `git status` is clean and:
   ```bash
   npm test
   npm run lint
   npm run format:check
   npm run test:lifecycle:npm  # end-to-end npm packaging lifecycle
   ```
2. **Choose and preflight the exact version.** This is read-only and fails if
   the version or tag already exists locally, on the remote, in GitHub
   Releases, or on npm:
   ```bash
   npm run release:preflight -- <version>
   ```
3. **Update the changelog.** Move items under `## [Unreleased]` in [`CHANGELOG.md`](../../../CHANGELOG.md) to a new `## [X.Y.Z] - YYYY-MM-DD` heading. Keep an empty `## [Unreleased]` at the top and commit it together with the version files in the next step.
4. **Bump to that exact version on a release branch without creating a tag yet.** This
   updates `package.json` and `package-lock.json`; the normal PR/DCO/review path
   still applies to release preparation:
   ```bash
   npm version <version> --no-git-tag-version
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
   Pushing the `vX.Y.Z` tag triggers [`publish.yml`](../../workflows/publish.yml), which publishes to npm via OIDC trusted publishing with automatic provenance. No `npm login`, no token.
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

## Trusted-publishing outage or failure

Do not race the tag workflow with a manual `npm publish`. The current automated
path is the supported release path and is responsible for npm provenance, the
signed SLSA bundle, and the complete immutable GitHub Release.

If trusted publishing is unavailable before a tag is pushed, stop and restore
the npm publisher or workflow before releasing. If a tag has already been
consumed, keep it immutable, fix the cause through a normal pull request, bump
to a new patch version, rerun `release:preflight`, and push the new tag. A
manual npm publish requires the separately approved incident procedure below;
it is not a routine fallback.

### Explicitly approved manual incident publication

Use this only when the owner explicitly authorizes an npm-only incident
publication and accepts that it cannot satisfy the normal GitHub Release/SLSA
invariant. Do not push the matching tag while the current workflow would race
or retry the same npm version. Record the incomplete publication, restore the
automated path, and resume complete releases with a new patch version.

The user must authenticate interactively with npm and verify the expected
account. Publishing a tarball does not run this root package's
`prepublishOnly`, so the gates must run immediately before packing:

```bash
npm login
npm whoami
npm test
npm run test:lifecycle:npm
tarball="$(npm pack --silent | tail -n1)"
npm publish "./$tarball" --access public
```

The agent must not perform `npm login`, handle credentials, or present this
npm-only path as a complete signed release.

## Gotchas

- **Trusted publishing needs the tag to match `package.json`.** `publish.yml` fails fast if the pushed tag (e.g. `v2.4.0`) doesn't equal `v$(package.json version)`. Always bump with `npm version` so the tag and manifest agree.
- **Trusted publishing requires npm ≥ 11.5.1 and `id-token: write`.** `publish.yml` verifies the bundled npm version and sets the permission; it does not self-update npm during a release. If a publish job errors with an OIDC/authentication message, confirm the trusted publisher is registered on npm for repo `RoryGlenn/commitment-issues` + workflow `publish.yml`.
- **Never retry a failed publish by moving its tag.** Fix the cause, bump to a
  new patch version, rerun the preflight, and push the new tag. A local or
  remote tag may be deleted only if no workflow has consumed it and no GitHub
  Release or npm version exists.
- **Immutable release assets must be uploaded together before publication.**
  Keep the SLSA generator's `upload-assets` input disabled, download its signed
  provenance artifact beside the packed tarball, and let one Node 24 release
  action upload both files before it finalizes the draft. A later job cannot
  add or replace assets on the published release. The SLSA caller must still
  grant `contents: write`: its reusable workflow declares a nested upload job,
  and GitHub validates that permission contract even when the input skips the
  job. Changes to `publish.yml` run its harmless pull-request validation job so
  GitHub checks this external contract before merge.
- **Publishing a tarball does not run this root package's `prepublishOnly`.** The automated and manual exact-tarball flows explicitly run `npm test` and `npm run test:lifecycle:npm` before packing. Keep both gates; `prepublishOnly` remains defense in depth for a direct root-directory publish.
- **`prepublishOnly` failing** blocks a direct root-directory publish by design — it runs the full test suite and the packaging smoke. Fix the failure; do not bypass it.
- **What ships:** `package.json` `files` allowlists only `scripts/`, `assets/*.svg`, `docs/`, `README.md`, `CHANGELOG.md`, and `LICENSE`. Promotional raster/video media stays in the source repository and is referenced by GitHub-hosted URLs. Everything in `.github/` (governance files, these skills) and `test/` is intentionally excluded from the tarball. Verify with `npm pack --dry-run` before publishing if the file list changed.

## CI / required checks

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`needs: [dco, quality, check, pm-lifecycle, codeql]`, `if: always()`), which fails unless DCO, static workflow/dependency quality, every OS/Node matrix leg, every package-manager lifecycle integration, and CodeQL report success. Skipped or otherwise incomplete required jobs fail closed too. This keeps the required-check list stable across matrix changes — don't rename it without updating the ruleset.
- Dependabot groups minor/patch bumps; **major** dependency bumps arrive as individual PRs and some (e.g. eslint 9→10) are expected to fail CI until the breaking change is handled — that's the `CI Success` gate doing its job, not a regression to force-merge.

## Post-release

- Confirm the exact version is live:
  `npm view "commitment-issues@X.Y.Z" version`.
- Confirm the publish workflow succeeded on its first attempt and every release
  job completed as intended.
- Verify npm registry signatures/attestations, byte-identical npm/GitHub
  tarballs, and the SLSA source/tag/commit using the release-verification guide.
- Confirm the GitHub Release is immutable and contains exactly the expected
  `.tgz` and `.intoto.jsonl` assets.
- The npm version/downloads badges in `README.md` update automatically.
