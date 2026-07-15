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
reduce pull request noise; grouped updates still require normal review. Routine
version releases must be at least seven days old before Dependabot proposes
them. Security updates bypass that cooldown.

The required CI `quality` job runs lint, formatting, actionlint 1.7.12, and
`npm audit --audit-level=high` once on Ubuntu/Node 24. The actionlint archive is
version-pinned and checksum-verified; it checks workflow syntax, expressions,
action inputs, inline shell, and common injection hazards before `CI Success`
can pass. Dependabot updates action references, but not this downloaded binary;
update the actionlint version and its official Linux AMD64 checksum together
during a deliberate automation-maintenance change. The exact `concurrency.queue`
diagnostic is temporarily ignored because GitHub supports the property while
actionlint 1.7.12's bundled schema does not; remove that suppression once the
pinned validator understands `queue`.

The weekly and manually dispatchable `Repository Health` workflow runs:

```sh
npm ci
npm test
npm run test:lifecycle:npm
npm audit --audit-level=high
```

The weekly run retains tests and the packed npm lifecycle to catch Node, runner,
registry, and other time-dependent drift while avoiding duplicate static checks
and package inspection. A high-severity advisory fails both required CI and the
weekly workflow visibly. Review production reachability, whether the finding
affects runtime or development tooling, and whether a safe update exists; do not
silence the gate without a documented disposition.

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

| Class                          | Included in npm? | Contents                                                                      |
| ------------------------------ | ---------------- | ----------------------------------------------------------------------------- |
| Runtime                        | Yes              | Explicit CLI, command, and transitive helper paths in `package.json`          |
| User documentation             | Yes              | Explicit guides in `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` |
| README assets                  | Yes              | Only SVGs referenced by the installed README                                  |
| Lifecycle and coverage tooling | No               | The six repository-only modules classified in `branch-coverage.md`            |
| Maintainer and audit evidence  | No               | Repository-only planning, galleries, reviews, and operational records         |
| Promotional media              | No               | `assets/commitment-issues.png` and `assets/demo.gif`                          |

The runtime script allowlist is intentionally file-by-file. The
[coverage policy](branch-coverage.md#source-scope) records the complementary
maintenance-only set. Package tests compare those classifications with the
actual `npm pack` manifest, require the public bin target, and follow every
relative runtime import so a helper cannot be omitted accidentally. New scripts
remain out of npm until a maintainer deliberately classifies them.

The README loads the hero PNG and demo GIF from stable GitHub URLs so npm can
render them without adding roughly 1.4 MB of promotional media to every package.

Relative links in shipped Markdown must resolve within the exact `npm pack`
manifest, not merely within the source checkout. Package tests validate that
boundary directly, and the package-manager lifecycle validates it again from a
clean installed copy. When shipped documentation needs repository-only policy,
planning, or audit evidence, use its canonical GitHub URL rather than expanding
the npm package solely to make the link resolve.

The tarball must remain at or below **350 KiB compressed** and **750 KiB
unpacked**. Tests fail when the budget is exceeded, required runtime or
user-documentation files are missing, maintenance tooling or internal evidence
enters the tarball, or promotional media is included. Do not raise the limits
merely to accommodate documentation or media growth.

## Partial release incidents

Do not rerun a failed tag workflow until the release state is known. Record the
exact version, tag, peeled tag commit, workflow run ID and head SHA, job
conclusions, npm version/provenance/dist-tags, and GitHub Release draft,
immutability, and asset state. A failed or malformed lookup is unknown state,
not evidence that an artifact is absent.

Use the state table and byte-verification procedure in the
[release-verification guide](release-verification.md#partial-publication-and-recovery):

- Before npm, the same tagged run may be retried only when the exact npm version
  is absent, no GitHub draft or release exists, the failure is transient, and
  neither its source nor workflow needs an edit.
- After npm, an exact artifact may resume only when the tag, run, npm
  provenance, source commit, rebuilt or retained tarball bytes, and npm
  `dist-tags.latest` all name the same candidate. A moved, rolled-back, or newer
  `latest` blocks automatic resume and requires an owner decision and new patch.
  Prefer rerunning failed jobs so the successful npm job remains untouched.
- The final release job cryptographically verifies its local SLSA bundle.
  Existing draft assets must be byte-identical to those locally verified
  artifacts. An empty or exact tarball-only draft may survive a full rerun, but
  a draft that already contains provenance can resume only through a failed-job
  rerun retaining the original provenance bytes. A full rerun must stop and use
  a new patch instead.
- An empty or partial published release cannot be repaired because published
  releases and assets are immutable. Preserve it and release a new patch.
- A complete matching npm version and immutable GitHub Release require no
  action.

Never move or reuse a consumed tag, republish an existing npm version, delete
or replace a published release asset, or use `npm unpublish`. If an incomplete
version points `latest`, first verify a known-complete exact version. Moving the
dist-tag and deprecating the incomplete version are explicit npm-owner actions,
never automated recovery steps. Record the authorization, commands, results,
and replacement version in the incident issue.

## Release and housekeeping checklist

- Review open Dependabot pull requests and unexpected lockfile changes.
- Confirm CI, DCO, CodeQL, and OpenSSF Scorecard are passing.
- Review the weekly repository-health output.
- Delete stale branches only after confirming they are safe to remove.
- Run `npm pack --dry-run --json --ignore-scripts` and review the exact files
  and sizes.
- Run the release collision preflight before versioning.
- Classify any failed tag workflow before authorizing a retry or registry
  metadata change.
- Follow the [release-verification guide](release-verification.md) after
  publishing.
- Review sensitive access and continuity coverage at each release.
