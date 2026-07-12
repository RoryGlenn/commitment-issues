# Maintenance and repository housekeeping

This project uses light-weight automation to keep routine maintenance visible without allowing bots to make destructive changes automatically.

## Dependabot

Dependabot checks for updates every Monday in the `America/New_York` time zone.

It monitors:

- npm dependencies in the root package
- GitHub Actions used by workflows

Low-risk minor and patch dependency updates are grouped to reduce pull request noise. Maintainers should still review the changelog, confirm CI passes, and use normal release judgment before merging dependency updates.

## Weekly repository health

The `Repository Health` workflow runs weekly and can also be started manually from the Actions tab.

It runs:

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run test:lifecycle:npm
npm pack --dry-run
npm audit --audit-level=high
```

The audit step is report-first and non-blocking. If it reports a high-severity advisory, review whether the vulnerable package is reachable in normal use, whether it affects production dependencies or development tooling only, and whether an upgrade is available.

## Stale branch report

The health workflow prints branches that have not changed in the last 90 days.

The workflow does not delete branches. Branch deletion should remain a maintainer decision because old branches can contain unreleased work, investigation notes, or historical context.

Safe cleanup process:

1. Confirm the branch has no open pull request.
2. Confirm the branch is merged or no longer needed.
3. Delete it manually.

Example:

```sh
git push origin --delete branch-name
```

## Merged pull request branches

Prefer GitHub's built-in branch cleanup for merged pull request branches:

1. Open repository **Settings**.
2. Go to **General**.
3. Find **Pull Requests**.
4. Enable **Automatically delete head branches**.

This is safer than writing a custom workflow that deletes branches.

## Maintainer checklist

Use this checklist during routine maintenance:

- Review open Dependabot pull requests.
- Confirm CI, DCO, CodeQL, and OpenSSF Scorecard are passing.
- Review the weekly health workflow output.
- Clean stale branches only after confirming they are safe to remove.
- Confirm `npm pack --dry-run` includes the expected package files before releases.
- Run the collision preflight before versioning and follow the
  [release-verification guide](release-verification.md) after publishing.
- Avoid automatic dependency fixes that rewrite lockfiles without review.
