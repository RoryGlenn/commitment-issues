# Security Assurance Case

This assurance case explains why the security requirements for `commitment-issues` are expected to be met.

## Scope

`commitment-issues` is local Git-hook tooling for JavaScript and TypeScript projects. It reads local Git state and project files, runs local tools such as ESLint, Prettier, optional consumer-provided commitlint, and test runners, and prints advisory or blocking terminal output depending on configuration.

The project does not provide a network service, store user credentials, transmit repository contents, or manage cryptographic keys for users.

## Assets

The assets the project is intended to protect include:

- user working trees and staged changes;
- Git history and commit integrity;
- local repository contents;
- developer trust in advisory and blocking output;
- release integrity for the published npm package;
- private vulnerability reports.

## Threat model

Relevant attackers or failure modes include:

- a malicious or compromised dependency;
- a malicious repository configuration value in `package.json`;
- file paths containing spaces, shell metacharacters, or unusual Unicode;
- generated or malformed Git output;
- a compromised GitHub Action or release workflow dependency;
- accidental maintainer mistakes during releases;
- accidental mutation of staged or unstaged work;
- public disclosure of vulnerability details before a fix is ready.

Out of scope:

- compromise of the user's local machine;
- compromise of Git itself, Node.js itself, npm itself, or GitHub itself;
- malicious project-local tools intentionally configured by the repository owner and executed by the developer;
- enforcing organization-specific policy outside the local Git hooks.

## Trust boundaries

Important trust boundaries are:

1. **User repository boundary** — project files, `package.json`, staged files, branch state, and test files are controlled by the repository and may be untrusted when running in an unfamiliar project.
2. **Configuration boundary** — `precommitChecks` in `package.json` is user-controlled input and must be validated before use.
3. **Git boundary** — Git output is external process output and must be parsed defensively.
4. **Process boundary** — ESLint, Prettier, optional project-local commitlint, test runners, and package-manager commands are spawned as external tools.
5. **Shell boundary** — file paths and command arguments must not be interpolated into a shell command.
6. **CI/CD boundary** — GitHub Actions workflows operate on repository contents and pull request metadata.
7. **Release boundary** — npm releases and GitHub release workflows must preserve package integrity and provenance.
8. **Vulnerability-report boundary** — vulnerability reports may contain sensitive details and must be handled privately until disclosure is appropriate.

## Security requirements

The project security requirements are:

- do not transmit repository contents or telemetry;
- do not expose a network service;
- do not store or process authentication credentials as runtime data;
- avoid shell injection when spawning tools;
- validate user-controlled configuration;
- preserve user working-tree safety;
- fail safely when inspecting Git state is not possible;
- keep dependency and release-chain risk visible and manageable;
- handle vulnerability reports privately and responsibly.

## Secure design argument

### Least privilege

The tool runs locally with the developer's existing user permissions and does not require elevated privileges. GitHub Actions workflows use explicit least-privilege permissions where practical.

### Economy of mechanism

The package is pure ESM JavaScript with no build step, no native binaries, no network service, and no telemetry. This reduces the number of security-sensitive moving parts.

### Complete mediation

Git state and configuration are checked at the point of hook execution. Configuration values are validated before being used by the hooks and process helpers.

### Fail-safe defaults

Default commit-time behavior is advisory rather than destructive. Push-time and commit-message blocking are separate opt-ins. If the tool cannot safely inspect staged files, it warns rather than mutating work unexpectedly. Blocking pre-push mode fails closed when pushed files cannot be inspected; blocking commit-message mode likewise fails closed when its explicitly configured local tool or rules cannot run.

### Least astonishment

The tool prints explicit messages about what it checked, what it refused to do, and how users can proceed safely. Blocking behavior is only enabled through explicit configuration.

### Defense in depth

The project combines local validation, tests, linting, formatting, CI on multiple platforms, CodeQL, OpenSSF Scorecard, Dependabot, pinned GitHub Actions, and npm provenance.

## Common implementation weakness mitigations

### Command injection

The project avoids shell interpolation for tool execution. Commands are spawned with argument vectors through Node.js process APIs and `cross-spawn`, so file paths are passed as arguments rather than shell code. The generated commit-msg hook quotes Git's `$1`, and the entrypoint resolves it to one absolute argv value before invoking commitlint.

### Path handling and path traversal

The project treats Git file lists as data, normalizes paths where needed, and includes cross-platform path tests for spaces, Windows-style separators, and unusual path cases.

### Unsafe working-tree mutation

Automatic fixes are guarded. The tool refuses risky mutation when staged and unstaged changes overlap, and `commit:fix` only amends when the working tree is safe enough to do so.

### Malformed or untrusted configuration

The `precommitChecks` object is allowlisted by key and value. Unknown keys are reported as likely typos. Invalid values are rejected by omission so the rest of the tool receives only validated configuration.

### Dependency vulnerabilities

Dependencies are declared in `package.json`, locked in `package-lock.json`, and monitored with Dependabot. Dependency changes are reviewed through pull requests and CI.

Optional commit-message linting does not add commitlint to this dependency
graph. It resolves only the consumer project's `node_modules/.bin/commitlint`
and has no npx, global, or network fallback; the consumer explicitly owns and
trusts both the tool and its executable configuration.

### CI/CD risks

Workflows use explicit permissions and pinned actions where practical. CI runs linting, formatting, tests, coverage, package lifecycle smoke tests, and package-manager smoke tests.

### Release integrity risks

Releases use unique version identifiers, changelog entries, npm trusted publishing/provenance where available, and documented verification guidance.

### Vulnerability disclosure risks

The security policy directs reporters to private vulnerability reporting. Public vulnerability history is maintained separately so disclosure can be coordinated.

## Evidence

Relevant evidence includes:

- [Security review](../security-review-2026-07.md)
- [Security hardening](../security-hardening.md)
- [Configuration reference](../configuration.md)
- [Dependency management](../dependency-management.md)
- [Release verification](../release-verification.md)
- [Vulnerability history](../vulnerability-history.md)
- [CI workflow](../../.github/workflows/ci.yml)
- [CodeQL workflow](../../.github/workflows/codeql.yml)
- [Dependabot configuration](../../.github/dependabot.yml)

## Maintenance

This assurance case should be reviewed when:

- the project adds new runtime behavior;
- the project adds network communication;
- the project changes release tooling;
- the project changes how commands are spawned;
- the project changes configuration parsing;
- a vulnerability is reported or fixed.
