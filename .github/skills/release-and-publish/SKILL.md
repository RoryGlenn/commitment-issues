---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version, publishing via the trusted-publishing workflow or a manual npm publish, updating CHANGELOG for a release, or debugging a failed publish. Covers the automated OIDC trusted-publishing flow (npm version -> push tag -> publish.yml publishes with provenance), the manual npm login -> npm publish fallback, the E404-means-auth gotcha, the CI Success required-status gate, and which steps the user must run themselves."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any release-mutating step (`npm version`, `git push origin vX.Y.Z`, or a manual `npm publish`), confirm intent with the user and state the target version.

- **Pushing a `vX.Y.Z` tag is the publish trigger.** With trusted publishing enabled, pushing that tag starts an npm publish from CI — treat the tag push itself as "publish now."
- **The agent cannot run `npm login`** — it needs credentials and browser 2FA. For the manual fallback, always have the **user** log in, then verify with `npm whoami`.
- Prefer to let the user run the tag push (or a manual `npm publish`), or run them only on explicit confirmation.

## One-time setup — trusted publishing

Automated publishing uses **npm Trusted Publishing** (OIDC), so CI publishes without any npm token. This must be registered once, by the package owner, before the automated flow works:

- On npmjs.com → package `commitment-issues` → **Settings → Trusted Publishing** → add a GitHub Actions publisher: user `RoryGlenn`, repository `commitment-issues`, workflow `publish.yml` (leave environment blank unless one is added).

The workflow ([`publish.yml`](../../workflows/publish.yml)) is already wired for it: it triggers on `v*` tags, sets `permissions: id-token: write`, verifies the npm bundled with Node supports trusted publishing, checks the tag matches `package.json`, packs the package for its SLSA subject, and runs `npm publish` (npm provenance is generated automatically). Until the trusted publisher is registered, use the **manual fallback** below.

## Release flow (in order)

1. **Clean tree + green suite.** Ensure `git status` is clean and:
   ```bash
   npm test
   npm run lint
   npm run format:check
   npm run test:lifecycle:npm  # end-to-end npm packaging lifecycle
   ```
2. **Update the changelog.** Move items under `## [Unreleased]` in [`CHANGELOG.md`](../../../CHANGELOG.md) to a new `## [X.Y.Z] - YYYY-MM-DD` heading. Keep an empty `## [Unreleased]` at the top and commit it together with the version files in the next step.
3. **Bump the version on a release branch without creating a tag yet.** This
   updates `package.json` and `package-lock.json`; the normal PR/DCO/review path
   still applies to release preparation:
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   git commit -s -am "chore: release vX.Y.Z"
   ```
   Open a pull request, pass `CI Success`, obtain approval (or record the
   temporary single-maintainer exception), and merge it.
4. **From the exact merged `main` commit, create and push only the immutable
   release tag — this publishes:**
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   Pushing the `vX.Y.Z` tag triggers [`publish.yml`](../../workflows/publish.yml), which publishes to npm via OIDC trusted publishing with automatic provenance. No `npm login`, no token.
5. **Verify** the version is live: `npm view commitment-issues version`, and confirm the provenance badge on the npm page.

`main` is protected (strict CI, DCO, review, linear history; squash/rebase
merges only). Version and changelog changes go through a PR. Pushing the tag
after that PR merges is the release operation and does not change `main`.

## Manual publish (fallback)

Use this only before trusted publishing is registered. Registering the trusted
publisher first is strongly preferred: the current tag-triggered workflow has
no per-release skip switch, so a manual release cannot produce a completely
green tag workflow. Once trusted publishing is active, repair the automated
workflow and fix forward with a new version instead of creating a
manual/automated duplicate-publish race. Prepare and merge the release PR in
steps 1–3 above, then:

4. **User logs in to npm** (credentials + 2FA — agent cannot do this):
   ```bash
   npm login
   npm whoami        # verify: should print roryglenn
   ```
5. **Publish.** `prepublishOnly` runs `npm test && npm run test:lifecycle:npm` automatically as a gate:
   ```bash
   npm publish
   ```
6. **Create and push the release tag from the same merged commit:**
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   This tag still starts `publish.yml`. With no trusted publisher, or because
   the version was just published manually, its publish job is expected to
   fail rather than publish a second copy; record that expected failure and do
   not retry the same version. The failed workflow also cannot create its SLSA
   attestation. Register trusted publishing before the next release so future
   tags use the green automated path.

## Gotchas

- **Trusted publishing needs the tag to match `package.json`.** `publish.yml` fails fast if the pushed tag (e.g. `v2.4.0`) doesn't equal `v$(package.json version)`. Always bump with `npm version` so the tag and manifest agree.
- **Trusted publishing requires npm ≥ 11.5.1 and `id-token: write`.** `publish.yml` verifies the bundled npm version and sets the permission; it does not self-update npm during a release. If a publish job errors with an OIDC/authentication message, confirm the trusted publisher is registered on npm for repo `RoryGlenn/commitment-issues` + workflow `publish.yml`.
- **Manual `npm publish` → `E404 Not Found - PUT ... or you do not have permission`** is almost always an **auth** problem, not a bad package name — npm masks 403/permission errors as 404. Check `npm whoami` (an `E401` there means not logged in). Fix by logging in as `roryglenn`; do **not** rename the package or fabricate a scope.
- **`prepublishOnly` failing** blocks publish by design — it runs the full test suite and the npm package lifecycle integration. Fix the failure; do not bypass it.
- **What ships:** `package.json` `files` allowlists only `scripts/`, `assets/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`. Everything in `.github/` (governance files, these skills) and `test/` is intentionally excluded from the tarball. Verify with `npm pack --dry-run` before publishing if the file list changed.

## CI / required checks

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`needs: [dco, check, pm-lifecycle]`, `if: always()`), which fails if DCO, any OS/Node matrix leg, or any package-manager lifecycle integration fails. This keeps the required-check list stable across matrix changes — don't rename it without updating the ruleset.
- Dependabot groups minor/patch bumps; **major** dependency bumps arrive as individual PRs and some (e.g. eslint 9→10) are expected to fail CI until the breaking change is handled — that's the `CI Success` gate doing its job, not a regression to force-merge.

## Post-release

- Confirm the version is live: `npm view commitment-issues version`.
- The npm version/downloads badges in `README.md` update automatically.
