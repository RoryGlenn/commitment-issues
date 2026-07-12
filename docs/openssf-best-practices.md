# OpenSSF Best Practices Evidence Map

This page maps OpenSSF Best Practices criteria to concrete evidence URLs for
`commitment-issues`.

Project badge page:

- <https://www.bestpractices.dev/projects/13528>

The public badge currently reports **Passing**. Silver- and Gold-level entries
below are an evidence-preparation map, not a claim that those higher levels have
already been awarded.

## Gold prerequisite

- `achieve_silver`:
  - Questionnaire status in bestpractices.dev project 13528

## Project oversight

- `bus_factor`:
  - [CODEOWNERS](../.github/CODEOWNERS)
  - [Contributing guide](../.github/CONTRIBUTING.md)
- `contributors_unassociated`:
  - [Contributors graph](https://github.com/RoryGlenn/commitment-issues/graphs/contributors)

## Other

- `copyright_per_file`:
  - Source files contain project copyright headers and SPDX identifiers
- `license_per_file`:
  - Source files contain `SPDX-License-Identifier: MIT`

## Change control

- `repo_distributed`:
  - [Repository](https://github.com/RoryGlenn/commitment-issues)
  - Uses GitHub git hosting (distributed VCS)

## Quality

- `small_tasks`:
  - [good first issue](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  - [help wanted](https://github.com/RoryGlenn/commitment-issues/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
  - [Contributing guide question/start-here section](../.github/CONTRIBUTING.md#questions)
- `require_2FA`:
  - GitHub platform-level 2FA requirement (March 2023+)
- `secure_2FA`:
  - [Maintainer authentication policy](../.github/SECURITY.md#maintainer-authentication-policy)
- `code_review_standards`:
  - [Code review standards](../.github/CONTRIBUTING.md#code-review-standards)
  - [Pull request template](../.github/PULL_REQUEST_TEMPLATE.md)
- `two_person_review`:
  - [Review and branch-protection policy](../.github/CONTRIBUTING.md#review-and-branch-protection-policy)
  - [Temporary single-maintainer exception](../GOVERNANCE.md#temporary-single-maintainer-exception)
  - [Pull requests list](https://github.com/RoryGlenn/commitment-issues/pulls?q=is%3Apr)
- `build_reproducible`:
  - N/A for this package: no compiled build output, source `.mjs` files execute directly
- `test_invocation`:
  - [Contributing test commands](../.github/CONTRIBUTING.md#testing)
  - [package.json test script](../package.json)
- `test_continuous_integration`:
  - [CI workflow](../.github/workflows/ci.yml)
- `test_statement_coverage90`:
  - [100% runtime coverage report and source scope](branch-coverage.md)
  - [Coverage script](../package.json)
  - [CI coverage run](../.github/workflows/ci.yml)
- `test_branch_coverage80`:
  - [100% branch threshold and source scope](branch-coverage.md)
  - [Gated coverage script](../package.json)
  - [CI threshold and badge-freshness run](../.github/workflows/ci.yml)

## Security

- `crypto_used_network`:
  - N/A: package does not provide network protocol services
- `crypto_tls12`:
  - N/A: package does not terminate or initiate TLS sessions as a network service
- `hardened_site`:
  - [Repository URL](https://github.com/RoryGlenn/commitment-issues)
  - [npm package URL](https://www.npmjs.com/package/commitment-issues)
- `security_review`:
  - [Security review report (2026-07)](security-review-2026-07.md)
  - [Security policy cadence](../.github/SECURITY.md#security-review-cadence)
- Release integrity:
  - [Release verification guide](release-verification.md)
  - [v3.3.2 immutable release with tarball and SLSA provenance](https://github.com/RoryGlenn/commitment-issues/releases/tag/v3.3.2)
  - [Trusted publishing workflow](../.github/workflows/publish.yml)

## Analysis

- `hardening`:
  - [Hardening mechanisms](security-hardening.md)
  - [CodeQL workflow](../.github/workflows/codeql.yml)
  - [Scorecard workflow](../.github/workflows/scorecard.yml)
- `dynamic_analysis`:
  - [CI workflow test execution](../.github/workflows/ci.yml)
  - [Property-based tests (fast-check)](../test/property.test.js)
- `dynamic_analysis_enable_assertions`:
  - [Test suites using node:assert/strict](../test)
  - [Property tests with assertions](../test/property.test.js)

## Passing / silver basics (retained evidence)

- `description_good`:
  - [README](../README.md) project description and quickstart
- `interact`:
  - [SUPPORT](../.github/SUPPORT.md)
  - [GitHub Issues](https://github.com/RoryGlenn/commitment-issues/issues)
- `contribution` / `contribution_requirements`:
  - [Contributing guide](../.github/CONTRIBUTING.md)
  - [Contribution requirements](../.github/CONTRIBUTING.md#contribution-requirements)
- `documentation_basics`:
  - [README](../README.md)
  - [FAQ](faq.md)
  - [Configuration and Behavior](configuration.md)
- `documentation_interface`:
  - [External interface reference](external-interface.md)
- `english`:
  - [README](../README.md#project-status-and-support)
- `maintained`:
  - [README maintained statement](../README.md#project-status-and-support)
  - [Changelog](../CHANGELOG.md)
  - [Releases](https://github.com/RoryGlenn/commitment-issues/releases)
- `discussion`:
  - [Issues](https://github.com/RoryGlenn/commitment-issues/issues)
  - [Pull requests](https://github.com/RoryGlenn/commitment-issues/pulls)
- `floss_license` / `license_location`:
  - [LICENSE](../LICENSE)

Additional change-control and security signals:

- [Pull request template](../.github/PULL_REQUEST_TEMPLATE.md)
- [Issue templates](../.github/ISSUE_TEMPLATE)
- [CI workflow](../.github/workflows/ci.yml)
- [CodeQL workflow](../.github/workflows/codeql.yml)
- [Scorecard workflow](../.github/workflows/scorecard.yml)
- [Scenario coverage tracker](scenario-coverage.md)
- [Security policy](../.github/SECURITY.md)
- [Dependabot config](../.github/dependabot.yml)
- [Trusted publishing workflow](../.github/workflows/publish.yml)
- [Code owners](../.github/CODEOWNERS)

## Maintainer notes

- If bestpractices.dev still shows `?`, copy the exact URL evidence from this
  page into the corresponding questionnaire field.
- Some criteria require platform settings or contributor count changes outside
  this repository; those cannot be fully satisfied with docs alone.
