# Project Roles and Sensitive Access

This document lists the project roles, responsibilities, and current members with access to sensitive project resources.

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

## Roles and responsibilities

### Maintainer

Maintainers are responsible for:

- project direction and roadmap decisions;
- triaging issues and pull requests;
- reviewing and merging changes;
- maintaining coding, testing, and documentation standards;
- ensuring major new functionality includes automated tests;
- updating documentation and changelog entries for user-visible behavior;
- maintaining CI/CD workflows and repository settings;
- managing sensitive project resources;
- coordinating security fixes and vulnerability disclosure;
- approving and publishing releases.

### Release manager

The release manager is responsible for:

- selecting release contents from merged changes;
- ensuring the version identifier is unique;
- confirming CI is passing before release;
- preparing changelog and release notes;
- publishing the npm package through the documented release process;
- ensuring provenance/signing verification information is available to users.

### Security contact

The security contact is responsible for:

- monitoring private vulnerability reports;
- acknowledging and triaging security reports;
- coordinating fixes for confirmed vulnerabilities;
- preparing security advisories when appropriate;
- crediting reporters unless they request anonymity;
- updating the public vulnerability history.

### Contributor

Contributors are responsible for:

- following the Code of Conduct;
- signing off commits under the Developer Certificate of Origin;
- keeping pull requests focused;
- adding tests for major new functionality;
- adding regression tests for bug fixes when practical;
- updating documentation and changelog entries for user-visible behavior;
- reporting vulnerabilities through the private security process instead of public issues.

## Access review

Sensitive access should be reviewed when:

- a new maintainer is added;
- a maintainer leaves the project;
- release or security processes change;
- repository, npm, or GitHub Actions permissions are changed;
- a security incident or suspected credential exposure occurs.

This document should be updated whenever project membership or sensitive-resource access changes.
