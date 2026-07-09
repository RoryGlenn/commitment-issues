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

## Contributor role

Contributors may:

- open issues and discussions;
- submit pull requests;
- propose roadmap items;
- review pull requests when requested;
- report vulnerabilities privately through the documented security process.

Contributors must follow the contribution guide, sign off commits with the Developer Certificate of Origin, and include tests for major new functionality.

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

## Review and merge policy

Pull requests are reviewed against the standards in the contributing guide. Maintainers may request changes, ask for additional tests, or reject changes that are too broad or outside the roadmap.

The project prefers review by someone other than the author when practical. Direct maintainer commits to `main` are reserved for urgent maintenance where a pull request is not practical.

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
