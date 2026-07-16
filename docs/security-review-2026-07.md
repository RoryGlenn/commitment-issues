# Security Review - 2026-07 refresh

Date: 2026-07-16

Implementation evidence commit:
[`e7d096d70a297da19fe6d8b7e78f1c83a767b21d`](https://github.com/RoryGlenn/commitment-issues/commit/e7d096d70a297da19fe6d8b7e78f1c83a767b21d)

Reviewers and roles:

- Codex assisted the source, workflow, test, and live-control inspection.
- Rory Glenn is the repository owner and maintainer; final approval is recorded
  by review and merge of the pull request that lands this refresh.

This review supersedes the current-attestation status of the 2026-07-11
snapshot at
[`81a9e412bc347f01300df62505ee378284646d15`](https://github.com/RoryGlenn/commitment-issues/commit/81a9e412bc347f01300df62505ee378284646d15).
That earlier document remains available through Git history. This is a review
of the integrated commit above, not independently green pull-request heads, and
is not an external security certification.

## Conclusion

No confirmed Critical or High vulnerability remains in the reviewed source and
workflow scope at the evidence commit. The review found that the major
post-snapshot hook, configuration, filesystem, terminal, CI, and release changes
are covered by merged fixes and regression evidence. External account controls
and lower-severity or future hardening work are listed explicitly under
[Residual risks and external controls](#residual-risks-and-external-controls).

## Scope

The review covers:

- every shipped command entrypoint: `cli`, `init`, `uninstall`, `doctor`,
  `precommit`, `prepush`, `commit-msg`, `commit-fix`, `fix-staged`, and `vows`;
- package and standalone configuration parsing, validation, shallow precedence,
  diagnostics, and hook-selection behavior;
- native hook installation, classification, repair, legacy-Husky migration,
  linked-worktree behavior, clone repair, and ownership-bounded removal;
- subprocess creation, argv construction, option boundaries, executable
  resolution, environment inheritance/removal, cwd, timeouts, signals, and
  process-tree cleanup;
- Git pathname/status/patch/remote parsing, push-base selection, malformed or
  failed Git output, and staged-secret inspection;
- human terminal rendering, structured JSON output, captured diagnostics, and
  repository-controlled control characters;
- CI, DCO, CodeQL, Scorecard, dependency automation, fork execution, release
  ancestry, exact-artifact publication, provenance, and recovery workflows.

Maintainer-only coverage, migration, performance, and release tools were
reviewed where they cross a security or publication boundary; they are not
represented as shipped runtime surface.

## Method

1. Read the named commit's public entrypoints and shared helpers, following data
   from repository/configuration/Git/process inputs to filesystem mutation,
   process execution, JSON serialization, and human output.
2. Inventoried process APIs and inspected argv, shell use, cwd, environment,
   timeout, signal, and cleanup behavior at every call site.
3. Traced `package.json` and `.commitmentrc.json` through raw loading,
   validation, standalone-over-package precedence, sanitization, diagnostics,
   hook selection, and command execution.
4. Reviewed hook-path classification and every write/removal preflight,
   including links, non-regular files, replacement races, exact filesystem
   identity, permissions, foreign hooks, and custom `core.hooksPath`.
5. Reviewed NUL-delimited pathname parsing, unified-diff validation, remote/ref
   selection, malformed-output behavior, and fail-open/fail-closed decisions.
6. Reviewed workflow triggers, permissions, credential persistence, fork-secret
   boundaries, action pins, required aggregation, release authority, immutable
   artifacts, trusted publishing, and provenance continuity.
7. Reconciled focused adversarial regressions, the complete runtime-coverage
   gate, packed lifecycle evidence, hosted OS/Node/package-manager/shell lanes,
   live security-alert APIs, and prior audit findings.

## Security boundaries reviewed

- **Repository and configuration:** project files, Git data, filenames, branch
  state, `package.json`, and `.commitmentrc.json` are potentially untrusted when
  the tool runs in an unfamiliar repository. Configuration is JSON-only,
  allowlisted by key and value, and never discovered by executing project code.
- **Filesystem mutation:** setup, repair, and removal classify existing paths
  with `lstat`, reject links and non-regular mutable project files, revalidate
  exact filesystem identities through open descriptors, and use exclusive
  creation for missing files.
- **Processes and shells:** built-in tools resolve from the project and use argv
  rather than shell interpolation. Explicit repository-configured commands are
  trusted by that repository owner. Hook children remove Git's repository-local
  routing variables; timeouts clean attached process trees within the documented
  platform limits.
- **Git and parser inputs:** pathname lists use NUL delimiters, diff structure is
  validated before enforced secret scanning can pass, option-like paths are
  separated from command options, and malformed or failed Git output follows an
  explicit advisory or blocking policy.
- **Human and machine output:** repository-controlled controls and ANSI
  sequences are escaped at the human presentation boundary. JSON preserves the
  semantic values using JSON escaping and complete synchronous writes.
- **CI and release:** pull-request code receives read-only repository access
  without persisted checkout credentials or secrets; the isolated CodeQL job
  additionally receives `actions: read` for workflow metadata and
  `security-events: write` for SARIF upload. `CI Success` requires DCO, static
  quality, coverage, the compatibility matrix, packed lifecycles, migrations,
  and CodeQL. Publication separately requires reviewed-main ancestry, an exact
  immutable candidate, OIDC, provenance, and immutable-release continuity.

## Findings and dispositions

- [PR #198](https://github.com/RoryGlenn/commitment-issues/pull/198) fixed the
  repository-controlled polynomial hooks-path expression reported in #197.
- [PR #202](https://github.com/RoryGlenn/commitment-issues/pull/202) moved Yarn
  Classic bootstrap into the integrity-locked dependency graph for #201.
- [PR #205](https://github.com/RoryGlenn/commitment-issues/pull/205) preserves
  linked, replaced, or uninspectable legacy `.husky` paths for #203.
- [PR #208](https://github.com/RoryGlenn/commitment-issues/pull/208) refuses
  linked or non-regular mutable project files and binds final writes/removals to
  the verified filesystem object, including replacement and inode-reuse
  regressions for #206.
- [PR #209](https://github.com/RoryGlenn/commitment-issues/pull/209) escapes
  repository-supplied C0/C1 controls and CSI/OSC sequences at the human
  presentation boundary while preserving semantic filesystem and JSON values
  for #207.
- PRs [#188](https://github.com/RoryGlenn/commitment-issues/pull/188) through
  [#194](https://github.com/RoryGlenn/commitment-issues/pull/194) provide
  reviewed-main ancestry, exact candidate continuity, immutable
  release/recovery behavior, package allowlisting, documentation-link
  integrity, and access-authority evidence.
- [PR #217](https://github.com/RoryGlenn/commitment-issues/pull/217) records the
  live CodeQL merge-protection thresholds. Clean PR #217 passed both analysis
  and the alert gate; disposable [PR #216](https://github.com/RoryGlenn/commitment-issues/pull/216)
  was blocked by an Error/Critical command-injection alert.

Live API read-back on 2026-07-16 found:

- zero open CodeQL alerts;
- zero open Dependabot alerts;
- zero open secret-scanning alerts; and
- one Low OpenSSF Scorecard `CI-Tests` alert (#11), reporting that 27 of 28
  recent merged pull requests had a detected successful CI test. Current
  protection requires the fail-closed `CI Success` context and the latest
  integrated `main` run passed. The historical rolling-window signal is
  retained for surveillance; it is not a confirmed product vulnerability.

## Regression and operational evidence

Evidence on the named commit and its integration path includes:

- `node scripts/run-branch-coverage.mjs`: 860 tests passed with 100% line,
  branch, and function coverage;
- `node --test test/metadata.test.mjs test/ci-policy.test.mjs`: 44 focused
  governance, workflow, package, and documentation tests passed;
- `npm run lint` and `npm run format:check`: passed;
- `npm audit --audit-level=high`: zero vulnerabilities;
- `npm pack --dry-run --json --ignore-scripts`: 54 files, 147,040-byte archive,
  532,007 bytes unpacked;
- `npm run release:validate`: v3.3.2 metadata and reviewed notes are consistent;
- [integrated `main` CI](https://github.com/RoryGlenn/commitment-issues/actions/runs/29508993199):
  passed the full Linux/macOS/Windows Node matrix, 100% coverage gates, packed
  shell lanes, npm/pnpm/Yarn Classic/Yarn Berry/Bun lifecycles, migration,
  CodeQL, DCO, static policy, and aggregate `CI Success`; and
- [integrated Scorecard run](https://github.com/RoryGlenn/commitment-issues/actions/runs/29508992945):
  completed successfully and uploaded its findings for the evidence commit.

Focused regression ownership includes `test/config.test.mjs`,
`test/hooks.test.mjs`, `test/process.test.mjs`, `test/files.test.mjs`,
`test/secret-scan.test.mjs`, `test/secret-scan-integration.test.mjs`,
`test/terminal.test.mjs`, `test/json-output.test.mjs`,
`test/commit-guards-integration.test.mjs`, `test/ci-policy.test.mjs`, and the
entrypoint-specific integration suites.

## Residual risks and external controls

- Explicit repository-configured test commands and project-local tools are
  trusted by the repository owner and may execute arbitrary project code.
- A compromised developer machine, Git, Node.js, npm, GitHub, or explicitly
  trusted dependency remains outside the package's enforceable boundary.
- Deliberately detached subprocess descendants remain outside portable
  process-tree cleanup guarantees.
- Repository administration, npm ownership, release publication, and private
  vulnerability coordination remain concentrated in one maintainer under the
  documented temporary governance exception.
- [Issue #180](https://github.com/RoryGlenn/commitment-issues/issues/180) owns
  the final naturally triggered current-graph external-fork proof. Existing
  evidence confirms read-only permissions, no secrets, successful CodeQL and
  compatibility work, and fail-closed DCO/aggregate behavior; the newly added
  Yarn Berry and packed-shell lanes await a legitimate external update.
- [Issue #195](https://github.com/RoryGlenn/commitment-issues/issues/195)
  records the completed 2026-07-16 npm trusted-publisher, access, 2FA, and
  zero-token evidence.
- [Issue #199](https://github.com/RoryGlenn/commitment-issues/issues/199)
  records the completed 2026-07-16 OpenSSF native-hook description correction;
  the public badge remains Passing.
- [Issue #138](https://github.com/RoryGlenn/commitment-issues/issues/138) owns
  independent integrated launch verification after the remaining external-fork
  control and exact-candidate checks are complete.
- Non-milestone [issue #212](https://github.com/RoryGlenn/commitment-issues/issues/212)
  owns Windows-specific very-large argv batching; current bounded workloads are
  measured and the limitation is documented.
- Non-milestone [issue #122](https://github.com/RoryGlenn/commitment-issues/issues/122)
  is a future enhancement to block sensitive files before transactional
  staging, not a bypass in the current staged-addition scanner contract.

## Reconciliation

- [`docs/security/assurance-case.md`](security/assurance-case.md) describes the
  same repository/configuration, filesystem, process, Git, presentation, CI,
  release, and vulnerability-report boundaries reviewed here.
- [`.github/SECURITY.md`](../.github/SECURITY.md) retains private-reporting,
  maintainer-authentication, review-cadence, and current-review guidance.
- [`docs/vulnerability-history.md`](vulnerability-history.md) continues to
  report no public disclosures; internal audit hardening is not mislabeled as a
  public vulnerability.
- Audit 2, Audit 6, Audit 7, and Audit 8 evidence and every open
  security/release issue were reconciled with the findings and residual
  controls above.

Review this document again at least annually and after a major architecture,
process, configuration, guard, secret-scanner, filesystem-mutation, or release
change.
