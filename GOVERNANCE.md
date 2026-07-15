# Governance

This document describes how `commitment-issues` makes project decisions, who has authority to make those decisions, and how changes are reviewed and released.

## Project model

`commitment-issues` is a maintainer-led open source project. The project welcomes issues, pull requests, documentation improvements, tests, and feature proposals from contributors, but final decisions are made by project maintainers.

The current maintainer roster and sensitive-resource access list are documented in [Project roles](docs/project-roles.md).

## Decision-making principles

Project decisions should prioritize:

1. Safety of user working trees and Git history.
2. Advisory-first behavior by default.
3. Clear opt-in enforcement for stricter behavior.
4. Cross-platform compatibility on Linux, macOS, and Windows.
5. Small, reviewable changes with tests and documentation.
6. Minimal runtime dependencies and predictable local behavior.

## Maintainer authority

Maintainers may:

- triage and close issues;
- review, approve, and merge pull requests;
- reject changes that do not match the project goals or safety model;
- publish npm releases;
- create GitHub releases and version tags;
- update CI/CD, repository settings, branch protection, and security settings;
- respond to vulnerability reports;
- update project documentation and policies.

Maintainers must follow the project's Code of Conduct, security policy, contribution requirements, and release process.

### Release manager

The release manager selects release contents from reviewed changes, confirms
the version and changelog, verifies required checks, publishes through the
documented workflow, and makes provenance and verification evidence available.

### Security contact

The security contact monitors private reports, coordinates fixes and advisories,
credits reporters unless anonymity is requested, and updates the public
vulnerability history after coordinated disclosure.

## Contributor role

Contributors may:

- open issues and discussions;
- submit pull requests;
- propose roadmap items;
- review pull requests when requested;
- report vulnerabilities privately through the documented security process.

Contributors must follow the contribution guide, sign off commits with the Developer Certificate of Origin, and include tests for major new functionality.

Designated contributors may receive time-bounded write access only when they
are listed in [Project roles](docs/project-roles.md) with an active assignment
and review deadline. Because a personal-account collaborator's technical write
permission also permits merge-affecting reviews, pull-request merges, and
GitHub Release management, that grant is broader than the approved contributor
role. Unless separately promoted to maintainer, a designated contributor may
push only assigned topic branches, maintain the assigned issue, open pull
requests, and provide requested reviews. They may not merge, create or edit
Releases, create version tags, or act for the project on npm, repository
administration, or private security reports. Remove the grant when the
assignment ends; use an organization with narrower custom roles if ongoing
direct access becomes necessary.

## Change process

The normal change process is:

1. Open an issue for substantial behavior, security, release, or governance changes.
2. Open a pull request against `main`.
3. Include automated tests for major new functionality and regression tests for practical bug fixes.
4. Update documentation and the changelog for user-visible behavior.
5. Pass CI.
6. Receive maintainer review and approval.
7. Merge through the GitHub pull request workflow.

Small documentation corrections, typo fixes, and low-risk maintenance changes may be proposed directly as pull requests without a prior issue.

## Prospective enforcement baseline

DCO and review enforcement was adopted prospectively on **2026-07-10** at
commit
[`81a9e412bc347f01300df62505ee378284646d15`](https://github.com/RoryGlenn/commitment-issues/commit/81a9e412bc347f01300df62505ee378284646d15).
Published history is not rewritten.

Commit
[`265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5`](https://github.com/RoryGlenn/commitment-issues/commit/265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5)
was a direct roadmap-only update on **2026-07-12** that omitted its sign-off.
An audit found it was the sole unsigned commit among the 33 commits after the
adoption baseline through that update. Rewriting published `main` history would
be more disruptive than recording the narrow exception, so
[issue #160](https://github.com/RoryGlenn/commitment-issues/issues/160) resets
the operational audit baseline to that commit. Every commit after the
operational baseline must carry a valid `Signed-off-by` trailer, including
commits that reach `main` through an authorized bypass.

The DCO job inside `CI Success` checks pull-request commits and audits all
commits on `main` after the operational baseline. It is the single workflow
owner for DCO enforcement; a second identical report would add no evidence. The
operational baseline must not be advanced again to hide a failure; any future
exception requires its own public governance record.
Before a squash merge, the merger must ensure the generated commit message
retains a valid sign-off; checking signed head commits cannot predict the final
server-generated squash message.

## Review and merge policy

Normal changes to `main` must use a pull request. The live `main` ruleset
requires:

- one approving review;
- dismissal of approvals when new commits make them stale;
- approval of the most recent push by someone other than the pusher;
- resolution of all review threads;
- strict success of the aggregate `CI Success` status, which includes DCO,
  the OS/Node test matrix, and package-manager lifecycle integration; and
- linear history with squash or rebase merges only.

Pull requests are reviewed against the standards in the contributing guide.
Maintainers may request changes, ask for additional tests, or reject changes
that are too broad or outside the roadmap.

### Temporary single-maintainer exception

The project currently has one trusted maintainer, so a second eligible approver
is not always available. Until a second trusted reviewer or maintainer is
listed in [Project roles](docs/project-roles.md), the sole maintainer may use
the repository-admin bypass only to merge an otherwise review-ready pull
request when independent approval cannot be obtained. DCO and `CI Success`
must still pass, review threads must be resolved, and the pull request must
record that the temporary exception was used and why. Self-approval is not
treated as independent review.

The continuity plan is to recruit and onboard a second trusted reviewer who
has the repository permission needed to satisfy the live approval rule, follow
the recurring access-review cadence in
[Project roles](docs/project-roles.md#recurring-access-review), and remove this
exception once two-person review is sustainable.

### Emergency bypass

A direct push or bypass of a failing required check is limited to an active
security, release-integrity, or repository-availability incident where the
normal pull-request path cannot safely be used. The maintainer must:

1. sign off every commit;
2. preserve linear history and never force-push or move a consumed tag;
3. record the reason, affected commit, validation performed, and any skipped
   control in an issue or pull request as soon as the repository is usable; and
4. run the skipped checks and obtain retrospective review when another trusted
   reviewer is available.

Convenience, a red test caused by the proposed change, or lack of time is not
an emergency. Release preparation changes follow the normal pull-request path;
pushing an immutable release tag after those changes merge is an authorized
release operation, not a direct change to `main`.

## Release process

Releases are maintainer-controlled. A maintainer may publish a release when:

- the relevant changes are merged to `main`;
- CI is passing;
- the changelog describes functional and security-relevant changes;
- the package version is unique and appropriate for the change;
- release provenance/signing steps are followed as documented in [Release verification](docs/release-verification.md).

## Security decisions

Security reports are handled under the private vulnerability reporting process in [.github/SECURITY.md](.github/SECURITY.md). Maintainers may temporarily withhold vulnerability details until a fix is available and affected users can be notified responsibly.

Security fixes may be prioritized ahead of roadmap items.

## Governance changes

Changes to this governance model require a pull request and maintainer approval. The pull request should explain why the governance change is needed and what project responsibilities or permissions are affected.
