# Security Policy

## Supported versions

`commitment-issues` follows [Semantic Versioning](https://semver.org/). Security
fixes are released against the latest published version on npm. We recommend
always running the most recent `2.x` release.

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately through GitHub's
[private vulnerability reporting](https://github.com/RoryGlenn/commitment-issues/security/advisories/new):

1. Go to the **Security** tab of the repository.
2. Click **Report a vulnerability**.
3. Provide a clear description of the issue, the affected version, and steps to
   reproduce.

If you are unable to use private reporting, you may contact the maintainer,
[@RoryGlenn](https://github.com/RoryGlenn), directly.

### What to include

- A description of the vulnerability and its potential impact.
- The version of `commitment-issues` affected.
- Step-by-step instructions to reproduce the issue.
- Any proof-of-concept code, logs, or configuration that helps us understand the
  problem.

### What to expect

- We will acknowledge your report as soon as we are able.
- We will investigate, keep you informed of progress, and credit you in the
  release notes if you wish.
- Once a fix is available, we will publish a new release and, where appropriate,
  a GitHub Security Advisory.

## Scope

This project runs local Git hooks and shells out to `eslint`, `prettier`, and
your configured test runner. Reports that are especially relevant include:

- Command or argument injection via file names, config values, or crafted diffs.
- Unsafe handling of the working tree that could destroy or leak unstaged work.
- Privilege or path-traversal issues in the hook or `init`/`doctor` flows.

Thank you for helping keep `commitment-issues` and its users safe.
