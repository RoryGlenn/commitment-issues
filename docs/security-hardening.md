# Security Hardening and Dynamic Analysis

This document summarizes the hardening mechanisms used by
`commitment-issues` and the dynamic analysis performed before releases.

## Hardening mechanisms

1. Safer process spawning
   - Commands are executed with argument vectors (no shell interpolation for
     file paths), reducing command-injection risk from path content.
   - Built-in ESLint and Prettier execution resolves only project-local package
     bins. Missing peers return a structured result and never trigger an
     implicit `npx` registry lookup or install.
   - Process results distinguish spawn failure, timeout, external signal,
     normal nonzero exit, and success. Prettier uses its documented exit status
     rather than matching human-readable `[error]` output.
   - Timed commands are isolated into POSIX process groups on Ubuntu/macOS and
     terminated as Windows process trees with `taskkill /t /f`, with a
     direct-child fallback. Deliberately detached/daemonized descendants remain
     outside this portable cleanup boundary.
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
   - npm trusted publishing publishes the exact tarball packed and hashed by the
     release job.
   - The current release workflow attaches that tarball and its matching signed
     SLSA provenance before publishing one immutable GitHub Release; v3.3.2
     validated the flow end to end.
   - Changes to the publish workflow trigger a non-publishing pull-request job
     so GitHub validates reusable-workflow permission contracts before a tag is
     consumed.

## Dynamic analysis performed before release

Before publishing, the project runs automated tests that execute production code
paths in subprocess and fixture repositories:

1. Test invocation across pull-request/main CI and the tag workflow:
   - `npm test`
   - `npm run test:coverage`
2. Dynamic behavior exercised:
   - Hook entrypoint execution and subprocess flows in temporary git repos.
   - Property-based tests (`fast-check`) over path and parser helpers.
   - Run-time assertions (`node:assert/strict`) across the test suite.
3. Release gating:
   - The tag-based publish workflow executes tests and the npm lifecycle smoke
     before packing and publishing the exact tarball.
   - `main` branch uses the `CI Success` required status gate.

## Assertion usage

The suite uses `node:assert/strict` broadly in unit and subprocess tests,
including property-based tests in `test/property.test.js`, to enforce run-time
invariants during dynamic analysis.
