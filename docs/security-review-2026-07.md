# Security Review - 2026-07

Date: 2026-07-08

Reviewers: project maintainer

Scope:

- CLI entrypoints in `scripts/*.mjs`
- Shared helpers in `scripts/lib/*.mjs`
- Git hook wiring (`init`, `doctor`, generated `.git/hooks`)
- Pre-commit and pre-push execution paths
- Release and CI workflows in `.github/workflows/*.yml`

Security boundary:

- `commitment-issues` runs locally in user repositories.
- It shells out to user-installed tools (`eslint`, `prettier`, test command).
- It reads local git state and local files.
- It does not expose a network service and does not transmit repository content.

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
3. Working-tree safety
   - Verified `fix:staged` refuses partially staged files.
   - Verified `commit:fix` refuses dirty tracked worktrees and pushed commits.
4. Dependency and release chain
   - Verified pinned GitHub Actions SHAs in workflows.
   - Verified npm trusted publishing and SLSA provenance workflow.
5. Continuous security analysis
   - Verified CodeQL and Scorecard workflows are enabled.

Findings:

- No high-severity vulnerabilities were identified in the reviewed scope.
- Residual risk remains where third-party tools or user-specified test commands
  are executed; this is expected by design and documented.

Follow-ups:

- Continue annual review cadence (or earlier for major architecture changes).
- Keep path-safety regression tests in place when command plumbing changes.
- Keep workflow action pins current via Dependabot.
