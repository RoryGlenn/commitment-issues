# Project Roles and Sensitive Access

This document is the current membership and sensitive-access record. Role
authority and responsibilities are defined once in
[Governance](../GOVERNANCE.md).

## Current project members

| Member     | GitHub                                     | Role(s)                                       | Sensitive resource access                                                                                                                                                   |
| ---------- | ------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rory Glenn | [@RoryGlenn](https://github.com/RoryGlenn) | Maintainer, release manager, security contact | GitHub repository administration, branch protection, GitHub Actions, GitHub security advisories, npm package publishing, release creation, dependency and security settings |

## Sensitive resources

Sensitive project resources include:

- GitHub repository administration;
- branch protection and repository rules;
- GitHub Actions workflow administration;
- GitHub Actions secrets and environment settings;
- GitHub Security Advisories and private vulnerability reports;
- npm package publishing access;
- release creation and version tags;
- CODEOWNERS and policy files;
- dependency management settings, including Dependabot configuration.

## Access review

Sensitive access should be reviewed when:

- a new maintainer is added;
- a maintainer leaves the project;
- release or security processes change;
- repository, npm, or GitHub Actions permissions are changed;
- a security incident or suspected credential exposure occurs.

This document should be updated whenever project membership or sensitive-resource access changes.

## Review continuity and temporary exception

The project currently has one trusted maintainer and no separately listed
backup for repository administration, npm publishing, or private security
reports. This is a documented continuity risk, not evidence of two-person
coverage.

Prospective enforcement was adopted on **2026-07-10** at commit
[`81a9e412bc347f01300df62505ee378284646d15`](https://github.com/RoryGlenn/commitment-issues/commit/81a9e412bc347f01300df62505ee378284646d15).
After the documented one-time exception in
[issue #160](https://github.com/RoryGlenn/commitment-issues/issues/160), the
operational audit baseline is **2026-07-12**, commit
[`265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5`](https://github.com/RoryGlenn/commitment-issues/commit/265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5).
Normal changes use pull requests and the live ruleset's independent approval
requirement. Until a second trusted reviewer or maintainer is added, Rory Glenn
may use the admin bypass for an otherwise green pull request only under the
temporary exception in [Governance](../GOVERNANCE.md). The pull request must
record the exception; DCO, `CI Success`, and resolved-thread requirements still
apply.

Continuity actions:

- recruit and onboard a second trusted reviewer or maintainer without naming a
  person before they accept the role;
- grant only the minimum access needed for that person's responsibilities,
  including the repository permission needed for their approval to satisfy the
  live ruleset;
- review GitHub, npm, Actions, release, and security-report coverage at every
  release and whenever membership or permissions change; and
- update this roster immediately when backup coverage exists, then retire the
  single-maintainer exception.
