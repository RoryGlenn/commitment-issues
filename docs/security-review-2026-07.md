# Security Review - 2026-07

Date: 2026-07-11

Implementation evidence snapshot:
[`81a9e412bc347f01300df62505ee378284646d15`](https://github.com/RoryGlenn/commitment-issues/commit/81a9e412bc347f01300df62505ee378284646d15)

> **Historical snapshot:** This review describes only the implementation named
> above and is not a current attestation for later code. Current security,
> subprocess, path, and workflow evidence is recorded in the
> [Audit 2 completion report](audits/security-secrets-paths-subprocesses.md).
> [Issue #99](https://github.com/RoryGlenn/commitment-issues/issues/99) remains
> open until the core, security, and release findings have settled.

Review evidence: source/workflow inspection plus automated regression tests.
The pull request that lands this review records the process/workflow diff,
review and merge evidence, and any documented single-maintainer exception.

Scope:

- CLI entrypoints in `scripts/*.mjs`
- Shared helpers in `scripts/lib/*.mjs`
- Git hook wiring (`init`, `doctor`, generated `.git/hooks`)
- Pre-commit and pre-push execution paths
- Configuration validation, commit guards, and staged-secret parsing
- Release and CI workflows in `.github/workflows/*.yml`

Security boundary:

- `commitment-issues` runs locally in user repositories.
- It spawns project tools (`eslint`, `prettier`, and configured test commands).
- It reads local git state and local files.
- The package itself does not expose a network service, add telemetry, or
  transmit repository content. A command explicitly configured by a repository
  remains inside that repository's trust boundary and may have its own network
  behavior.

Method:

- Manual source review of command execution, path handling, and hook installation
  behavior.
- Review of automated tests for path safety, shell-escaping, and refusal paths.
- Review of CI security automation (CodeQL, Scorecard, Dependabot, trusted
  publishing).

Key checks performed:

1. Command execution safety
   - Verified subprocesses are invoked with argument arrays, not shell-string
     concatenation, for file paths and command tokens.
   - Verified shell-sensitive filenames are covered by tests.
2. Path and quoting safety
   - Verified git path reads use `core.quotePath=false` for consistent path
     decoding.
   - Verified cross-platform path normalization tests exist.
   - Verified staged-secret diff parsing distinguishes file metadata from added
     hunk content, including added lines beginning with `++ `.
3. Configuration and guard safety
   - Verified `precommitChecks` is allowlisted by key and validated by value;
     unknown and invalid options are ignored with advisory diagnostics.
   - Verified protected-branch blocking covers deletion-only and unborn-branch
     commits, and other branch/size/generated-file guards remain advisory by
     default.
   - Verified secret blocking is explicit opt-in and the scanner examines only
     added staged lines plus relevant dotenv paths.
4. Working-tree safety
   - Verified `fix:staged` refuses partially staged files.
   - Verified `commit:fix` refuses dirty tracked worktrees and pushed commits.
5. Dependency and release chain
   - Verified pinned GitHub Actions SHAs in workflows.
   - Verified npm trusted publishing and SLSA provenance workflow.
6. Continuous security analysis
   - Verified CodeQL and Scorecard workflows are enabled.
   - Verified DCO is included in the aggregate required CI gate and prospective
     `main` history is audited from the documented baseline.

Findings:

- No high-severity vulnerabilities were identified in the reviewed scope.
- Residual risk remains where third-party tools or user-specified test commands
  are executed; this is expected by design and documented.
- Repository administration, release, and private-report continuity remain
  concentrated in one maintainer; the temporary exception and continuity plan
  are documented in `GOVERNANCE.md` and `docs/project-roles.md`.

Follow-ups:

- Continue annual review cadence (or earlier for major architecture, process,
  guard, secret-scanner, or release changes).
- Keep path-safety regression tests in place when command plumbing changes.
- Keep workflow action pins current via Dependabot.
