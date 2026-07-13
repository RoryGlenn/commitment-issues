# Maintainer operations

This repository-only guide covers routine maintenance, dependency policy,
package contents, and release housekeeping. User installation and configuration
belong in the [README](../README.md) and
[configuration reference](configuration.md).

## Dependencies

### Sources and selection

Dependencies come from the npm ecosystem and are declared in `package.json` and
locked in `package-lock.json`. The project does not vendor convenience copies of
third-party source code.

Add a dependency only when it provides clear value beyond a small project-local
implementation. Review:

- maintenance activity and license compatibility;
- transitive footprint and supported Node.js versions;
- runtime network or execution behavior;
- whether built-in Node.js APIs can provide the same result; and
- whether the dependency materially improves safety, portability, or
  maintainability.

GitHub Actions are dependencies too. Keep third-party actions pinned to immutable
commits and let Dependabot propose reviewed updates.

### Installation and tracking

Developers use `npm install` when intentionally changing dependencies. CI uses
`npm ci` so resolution matches the committed lockfile. Review `package.json`,
`package-lock.json`, and `.github/dependabot.yml` like source code.

Dependency update pull requests should identify the change, preserve the
lockfile, pass CI, review unexpected transitive changes, and update documentation
when installation, runtime behavior, or platform support changes.

For a reported vulnerability, determine whether the dependency and vulnerable
path are reachable, update or remove it when practical, document material
residual risk, and release a fix when users may be affected.

## Automated repository health

Dependabot checks npm dependencies and GitHub Actions each Monday in the
`America/New_York` time zone. Low-risk minor and patch updates are grouped to
reduce pull request noise; grouped updates still require normal review.

The weekly and manually dispatchable `Repository Health` workflow runs:

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run test:lifecycle:npm
npm pack --dry-run
npm audit --audit-level=high
```

The audit step is report-first. For a high-severity advisory, review production
reachability, whether the finding affects runtime or development tooling, and
whether a safe update exists.

The workflow reports branches that have not changed in 90 days but does not
delete them. Before deleting a branch, confirm that it has no open pull request
and is merged or no longer needed. Prefer GitHub's **Automatically delete head
branches** setting for merged pull requests.

## Demo asset verification

The `Render demo` workflow regenerates `assets/demo.gif` and preserves the
unmodified artifact for review. Its metadata gate allows at most two frames or
0.10 seconds of timing drift. Its visual gate uses a `0.997` SSIM minimum and
masks only the four documented volatile runtime regions.

The gate is intended to reject changed messages, layout or color shifts,
clipping, and missing scenes. Update the committed GIF only after reviewing the
artifact; do not lower the threshold to accept an unexplained mismatch.

## npm package contents

Use this command to inspect the exact release manifest:

```sh
npm pack --dry-run --json --ignore-scripts
```

The package boundary is explicit:

| Class                         | Included in npm? | Contents                                                                      |
| ----------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| Runtime                       | Yes              | `scripts/`, `package.json`, and npm-installed dependencies                    |
| User documentation            | Yes              | Explicit guides in `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` |
| README assets                 | Yes              | Only SVGs referenced by the installed README                                  |
| Maintainer and audit evidence | No               | Repository-only planning, galleries, reviews, and operational records         |
| Promotional media             | No               | `assets/commitment-issues.png` and `assets/demo.gif`                          |

The README loads the hero PNG and demo GIF from stable GitHub URLs so npm can
render them without adding roughly 1.4 MB of promotional media to every package.

The tarball must remain at or below **350 KiB compressed** and **750 KiB
unpacked**. Tests fail when the budget is exceeded, required runtime or
user-documentation files are missing, internal evidence enters the tarball, or
promotional media is included. Do not raise the limits merely to accommodate
documentation or media growth.

## Release and housekeeping checklist

- Review open Dependabot pull requests and unexpected lockfile changes.
- Confirm CI, DCO, CodeQL, and OpenSSF Scorecard are passing.
- Review the weekly repository-health output.
- Delete stale branches only after confirming they are safe to remove.
- Run `npm pack --dry-run --json --ignore-scripts` and review the exact files
  and sizes.
- Run the release collision preflight before versioning.
- Follow the [release-verification guide](release-verification.md) after
  publishing.
- Review sensitive access and continuity coverage at each release.
