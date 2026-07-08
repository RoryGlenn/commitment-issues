# Security Hardening and Dynamic Analysis

This document summarizes the hardening mechanisms used by
`commitment-issues` and the dynamic analysis performed before releases.

## Hardening mechanisms

1. Safer process spawning
   - Commands are executed with argument vectors (no shell interpolation for
     file paths), reducing command-injection risk from path content.
2. Defensive working-tree guards
   - `fix:staged` refuses partially staged files to avoid data loss.
   - `commit:fix` refuses to amend pushed commits or dirty tracked worktrees.
3. Cross-platform path normalization
   - Path normalization and matching are covered for POSIX and Windows-style
     separators.
4. Security automation
   - CodeQL static analysis runs on pushes, pull requests, and schedule.
   - OpenSSF Scorecard runs regularly and publishes findings.
   - Dependabot alerts and automated security updates are enabled.
5. Supply-chain integrity
   - GitHub Actions are pinned to immutable SHAs.
   - npm trusted publishing and SLSA provenance are enabled for releases.

## Dynamic analysis performed before release

Before publishing, the project runs automated tests that execute production code
paths in subprocess and fixture repositories:

1. Test invocation:
   - `npm test`
   - `npm run test:coverage`
2. Dynamic behavior exercised:
   - Hook entrypoint execution and subprocess flows in temporary git repos.
   - Property-based tests (`fast-check`) over path and parser helpers.
   - Run-time assertions (`node:assert/strict`) across the test suite.
3. Release gating:
   - Tag-based publish workflow executes tests before `npm publish`.
   - `main` branch uses the `CI Success` required status gate.

## Assertion usage

The suite uses `node:assert/strict` broadly in unit and subprocess tests,
including property-based tests in `test/property.test.js`, to enforce run-time
invariants during dynamic analysis.
