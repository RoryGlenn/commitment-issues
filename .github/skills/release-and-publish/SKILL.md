---
name: release-and-publish
description: "Cut and publish a new commitment-issues release to npm (public registry, package 'commitment-issues', vX.Y.Z tags). USE WHEN: cutting a release, bumping the version, running npm version/npm publish, updating CHANGELOG for a release, or debugging a failed publish. Covers the exact order (green tests -> npm version -> user-run npm login -> npm publish -> push tags), the E404-means-auth gotcha, the CI Success required-status gate, and which steps the user must run themselves."
---

# Release & Publish

Package: **`commitment-issues`**, npm owner **`roryglenn`**, **public** registry. Version tags use npm's default **`vX.Y.Z`** form. Semver: `patch` for fixes, `minor` for backward-compatible features, `major` for breaking changes.

## Operational safety — read first

Publishing and tagging are **hard to reverse**. Before running any release-mutating step (`npm version`, `npm publish`, `git push --follow-tags`), confirm intent with the user and state the target version.

- **The agent cannot run `npm login`** — it needs credentials and browser 2FA. Always have the **user** log in, then verify with `npm whoami`.
- Prefer to let the user run `npm publish` and the tag push, or run them only on explicit confirmation.

## Release flow (in order)

1. **Clean tree + green suite.** Ensure `git status` is clean and:
   ```bash
   npm test
   npm run lint
   npm run format:check
   npm run test:smoke      # end-to-end packaging lifecycle
   ```
2. **Update the changelog.** Move items under `## [Unreleased]` in [`CHANGELOG.md`](../../../CHANGELOG.md) to a new `## [X.Y.Z] - YYYY-MM-DD` heading. Keep an empty `## [Unreleased]` at the top. Commit this (or let `npm version` include it — see next step).
3. **Bump the version.** This edits `package.json`, creates a commit, and creates the `vX.Y.Z` tag:
   ```bash
   npm version <patch|minor|major>
   ```
4. **User logs in to npm** (credentials + 2FA — agent cannot do this):
   ```bash
   npm login
   npm whoami        # verify: should print roryglenn
   ```
5. **Publish.** `prepublishOnly` runs `npm test && npm run test:smoke` automatically as a gate:
   ```bash
   npm publish
   ```
6. **Push the commit and tag:**
   ```bash
   git push --follow-tags
   ```

`main` is protected (linear history; squash/rebase merges only). Release commits/tags are pushed by the owner, who can bypass the ruleset; regular changes still go through a PR.

## Gotchas

- **`npm publish` → `E404 Not Found - PUT ... or you do not have permission`** is almost always an **auth** problem, not a bad package name — npm masks 403/permission errors as 404. Check `npm whoami` (an `E401` there means not logged in). Fix by logging in as `roryglenn`; do **not** rename the package or fabricate a scope.
- **`prepublishOnly` failing** blocks publish by design — it runs the full test suite and the packaging smoke. Fix the failure; do not bypass it.
- **What ships:** `package.json` `files` allowlists only `scripts/`, `assets/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`. Everything in `.github/` (governance files, these skills) and `test/` is intentionally excluded from the tarball. Verify with `npm pack --dry-run` before publishing if the file list changed.

## CI / required checks

- The required status check is the aggregate job **`CI Success`** in `.github/workflows/ci.yml` (`needs: [check, pm-smoke]`, `if: always()`), which fails if any matrix leg failed. This keeps the required-check list stable across matrix changes — don't rename it without updating the branch-protection ruleset.
- Dependabot groups minor/patch bumps; **major** dependency bumps arrive as individual PRs and some (e.g. eslint 9→10) are expected to fail CI until the breaking change is handled — that's the `CI Success` gate doing its job, not a regression to force-merge.

## Post-release

- Confirm the version is live: `npm view commitment-issues version`.
- The npm version/downloads badges in `README.md` update automatically.
