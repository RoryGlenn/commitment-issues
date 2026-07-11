---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version, publishing via the trusted-publishing workflow or a manual npm publish, updating CHANGELOG for a release, or debugging a failed publish. Covers the automated OIDC trusted-publishing flow (npm version -> push tag -> publish.yml publishes with provenance), the manual npm login -> npm publish fallback, the E404-means-auth gotcha, the CI Success required-status gate, and which steps the user must run themselves."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any release-mutating step (`npm version`, `git push --follow-tags`, or a manual `npm publish`), confirm intent with the user, state the exact target version, and run the preflight below.

- **Pushing a `vX.Y.Z` tag is the publish trigger.** With trusted publishing enabled, `git push --follow-tags` starts an npm publish from CI — treat the tag push itself as "publish now."
- **Never move or reuse a pushed or consumed release tag.** If a publish fails
  after the tag is pushed, fix forward with a new patch version and tag. The
  only deletion exception is a tag proven unconsumed by any workflow or public
  artifact. The historical `v3.1.0` reuse is a frozen baseline exception, not
  a precedent.
- **The agent cannot run `npm login`** — it needs credentials and browser 2FA. For the manual fallback, always have the **user** log in, then verify with `npm whoami`.
- Prefer to let the user run the tag push (or a manual `npm publish`), or run them only on explicit confirmation.

## One-time setup — trusted publishing

Automated publishing uses **npm Trusted Publishing** (OIDC), so CI publishes without any npm token. This must be registered once, by the package owner, before the automated flow works:

- On npmjs.com → package `commitment-issues` → **Settings → Trusted Publishing** → add a GitHub Actions publisher: user `RoryGlenn`, repository `commitment-issues`, workflow `publish.yml` (leave environment blank unless one is added).

The workflow ([`publish.yml`](../../workflows/publish.yml)) is already wired for it: it triggers on `v*` tags, sets `permissions: id-token: write`, verifies the bundled npm supports trusted publishing, checks the tag matches `package.json`, packs once, and publishes that exact tarball (npm provenance is generated automatically). It also attaches the tarball and SLSA provenance to the GitHub Release. Until the trusted publisher is registered, use the **manual fallback** below.

## Release flow (in order)

1. **Clean tree + green suite.** Ensure `git status` is clean and:
   ```bash
   npm test
   npm run lint
   npm run format:check
   npm run test:smoke      # end-to-end packaging lifecycle
   ```
2. **Choose and preflight the exact version.** This is read-only and fails if
   the version or tag already exists locally, on the remote, in GitHub
   Releases, or on npm:
   ```bash
   npm run release:preflight -- <version>
   ```
3. **Update the changelog.** Move items under `## [Unreleased]` in [`CHANGELOG.md`](../../../CHANGELOG.md) to a new `## [X.Y.Z] - YYYY-MM-DD` heading. Keep an empty `## [Unreleased]` at the top. (Commit it now, or let `npm version` include it — see next step.)
4. **Bump to that exact version.** This edits `package.json`, creates a commit, and creates the matching `vX.Y.Z` tag:
   ```bash
   npm version <version>
   ```
5. **Push the commit and tag — this publishes:**
   ```bash
   git push --follow-tags
   ```
   Pushing the `vX.Y.Z` tag triggers [`publish.yml`](../../workflows/publish.yml), which publishes to npm via OIDC trusted publishing with automatic provenance. No `npm login`, no token.
6. **Verify** the exact version is live, confirm the npm provenance badge, and
   confirm the GitHub Release contains both `.tgz` and `.intoto.jsonl` assets:
   `npm view commitment-issues@<version> version dist.integrity`.

`main` is protected (linear history; squash/rebase merges only). Release commits/tags are pushed by the owner, who can bypass the ruleset; regular changes still go through a PR.

## Manual publish (fallback)

Use this only before trusted publishing is registered, or as break-glass if the workflow is unavailable. Do steps 1–4 above, then:

5. **User logs in to npm** (credentials + 2FA — agent cannot do this):
   ```bash
   npm login
   npm whoami        # verify: should print roryglenn
   ```
6. **Pack once, then publish that tarball.** `prepublishOnly` runs `npm test && npm run test:smoke` automatically as a gate:
   ```bash
   tarball="$(npm pack --silent | tail -n1)"
   npm publish "./$tarball"
   ```
7. **Push the commit and tag:**
   ```bash
   git push --follow-tags
   ```
   With trusted publishing registered, this tag push also triggers the workflow — use either the automated flow or the manual flow, not both, to avoid a duplicate-version publish.

## Gotchas

- **Trusted publishing needs the tag to match `package.json`.** `publish.yml` fails fast if the pushed tag (e.g. `v2.4.0`) doesn't equal `v$(package.json version)`. Always bump with `npm version` so the tag and manifest agree.
- **Never retry a failed publish by moving its tag.** Fix the cause, bump to a
  new patch version, rerun the preflight, and push the new tag. A local or
  remote tag may be deleted only if no workflow has consumed it and no GitHub
  Release or npm version exists.
- **Trusted publishing requires npm ≥ 11.5.1 and `id-token: write`.** Both are handled in `publish.yml` (it upgrades npm and sets the permission). If a publish job errors with an OIDC/authentication message, confirm the trusted publisher is registered on npm for repo `RoryGlenn/commitment-issues` + workflow `publish.yml`.
- **Manual `npm publish` → `E404 Not Found - PUT ... or you do not have permission`** is almost always an **auth** problem, not a bad package name — npm masks 403/permission errors as 404. Check `npm whoami` (an `E401` there means not logged in). Fix by logging in as `roryglenn`; do **not** rename the package or fabricate a scope.
- **`prepublishOnly` failing** blocks publish by design — it runs the full test suite and the packaging smoke. Fix the failure; do not bypass it.
- **What ships:** `package.json` `files` allowlists only `scripts/`, `assets/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`. Everything in `.github/` (governance files, these skills) and `test/` is intentionally excluded from the tarball. Verify with `npm pack --dry-run` before publishing if the file list changed.

## CI / required checks

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`needs: [check, pm-smoke]`, `if: always()`), which fails if any matrix leg failed. This keeps the required-check list stable across matrix changes — don't rename it without updating the branch-protection ruleset.
- Dependabot groups minor/patch bumps; **major** dependency bumps arrive as individual PRs and some (e.g. eslint 9→10) are expected to fail CI until the breaking change is handled — that's the `CI Success` gate doing its job, not a regression to force-merge.

## Post-release

- Confirm the version is live: `npm view commitment-issues version`.
- The npm version/downloads badges in `README.md` update automatically.
