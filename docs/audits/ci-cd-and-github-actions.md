# CI/CD and GitHub Actions Audit

This is the implementation and completion-evidence report for
[audit workstream #135](https://github.com/RoryGlenn/commitment-issues/issues/135).
The audit began on the tree at `b882972`; that same tree reached `main` as
`ce8c9a3` through package-manager audit PR #176 while this work was in progress.
The audited implementation then reached `main` as `4d1a2a8` through
[PR #178](https://github.com/RoryGlenn/commitment-issues/pull/178).

## Status

The implementation, local static verification, and hosted validation are
complete. PR #178 passed the new required `quality` job, all six OS/Node lanes,
all twelve package-manager lanes, the reusable CodeQL analysis, and the revised
`CI Success` aggregate. Its path-specific release validation also proved that
GitHub accepts the `concurrency.queue` property and the reusable SLSA permission
contract. The resulting `main` push repeated the complete 22-job CI graph
successfully.

Fork evidence is now complete rather than composite. External PR #166 proves
the first-time-contributor approval policy and the original fork-safe
`pull_request` boundary. Maintainer-controlled external fork
[PR #227](https://github.com/RoryGlenn/commitment-issues/pull/227) then exercised
the current graph without mutating either contributor branch. Its unsigned
[run 29546132668](https://github.com/RoryGlenn/commitment-issues/actions/runs/29546132668)
passed 32 jobs while DCO and `CI Success` failed closed. Signed
[run 29546490643 attempt 2](https://github.com/RoryGlenn/commitment-issues/actions/runs/29546490643/attempts/2)
passed all 34 required jobs: six OS/Node, sixteen package-manager, seven packed
shell, migration, static policy, DCO, reusable CodeQL, and the aggregate. Logs
reported read-only contents and metadata with `Secret source: None`; CodeQL
uploaded successfully under the downgraded token. This completes the Medium
evidence gap tracked by
[#180](https://github.com/RoryGlenn/commitment-issues/issues/180).

No Critical or High finding owned by this workstream remains. The known High
release-authorization gap is deliberately retained under
[#94](https://github.com/RoryGlenn/commitment-issues/issues/94) for the following
release and supply-chain audit (#136): a matching `v*` tag is still not proven
to originate from reviewed `main`. That is an explicit downstream disposition,
not a claim that the release boundary is safe already.

The Medium CodeQL settings finding was resolved on 2026-07-16 under
[#177](https://github.com/RoryGlenn/commitment-issues/issues/177). Required CI
proves that CodeQL analysis completed; the separate live ruleset now blocks
CodeQL tool-severity Errors and High-or-Critical security alerts. Disposable
[PR #216](https://github.com/RoryGlenn/commitment-issues/pull/216) proved the
negative path; clean [PR #217](https://github.com/RoryGlenn/commitment-issues/pull/217)
passed both analysis and the ruleset alert check to prove the positive path.

## Audited inventory

The baseline contained 243 tracked files, seven tracked workflows, one
Dependabot configuration, the live `main` ruleset, repository Actions/security
settings, and settings-owned automation. Every workflow and automation path was
classified; the duplicate standalone DCO workflow was removed, leaving six
tracked workflows.

| Surface                   | Baseline and resulting inventory                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Required CI               | `ci.yml`: DCO; one static `quality` lane; six npm OS/Node lanes; twelve non-npm lifecycle lanes; reusable CodeQL; fail-closed `CI Success` |
| Security analysis         | `codeql.yml`: reusable for required PR/main CI, plus direct weekly and manual analysis; `scorecard.yml`: main/settings/weekly/manual SARIF |
| Release                   | `publish.yml`: separate PR validation, a bounded non-cancelling tag queue, SLSA provenance, and one immutable GitHub Release uploader      |
| Visual evidence           | `render-demo.yml`: relevant-path/manual deterministic render, retained artifact, metadata gate, and SSIM gate                              |
| Scheduled health          | `repo-health.yml`: locked install, tests, packed npm lifecycle, high-severity advisory gate, and non-destructive stale-branch report       |
| Dependency updates        | `dependabot.yml`: npm and GitHub Actions, weekly grouping/limits, and seven-day routine-version cooldown                                   |
| Settings-owned automation | Copilot reviewer, Copilot cloud agent, Dependabot Updates, Snyk PR status, secret scanning, and push protection                            |

Historical audit reports that name the removed `dco.yml` remain accurate for
their recorded snapshots. Current governance and tests name `ci.yml` as the
single DCO workflow owner.

## Required-check architecture

Live ruleset `18531369` protects the default branch with strict up-to-date
checks, one approval, last-push approval by someone else, resolved review
threads, linear history, and the single required context `CI Success`. The
admin-role bypass is documented in `GOVERNANCE.md`; this audit did not mutate
shared repository settings.

The stable required context now fails unless every dependency reports exactly
`success`:

```text
DCO ───────────────┐
static quality ────┤
OS / Node tests ───┼─> CI Success
PM lifecycles ─────┤
CodeQL ────────────┘
```

This folds CodeQL execution into the existing gate without adding another
required status context. A skipped, cancelled, timed-out, or failed analysis
fails closed. The separate live code-scanning rule evaluates the completed
scan's alerts and blocks Errors plus High/Critical security findings.
Render-demo, publish-workflow validation, Scorecard, Snyk, lower-severity alert
findings, and GitHub-managed scanners remain supplemental for the reasons
recorded below.

## Workflow and evidence matrix

| Workflow / job                | Trigger                                               | Distinct evidence                                                                                                                                               | Required or disposition                                                                                                       |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci` / `dco`                  | PR, `main` push, manual                               | PR-unique commits from the true merge base; complete post-baseline `main` range; Node 24 is explicit                                                            | Required through `CI Success`; sole DCO owner                                                                                 |
| `ci` / `quality`              | PR, `main` push, manual                               | Checksum-verified actionlint 1.7.12, high-severity dependency audit, ESLint, and Prettier on Ubuntu/Node 24                                                     | Required; static work runs once                                                                                               |
| `ci` / `check`                | PR, `main` push, manual                               | Ubuntu, macOS, Windows × Node 22.11.0 and 24; locked install; unit/subprocess/CLI/hook tests; real packed npm lifecycle                                         | Required; all six lanes support public compatibility claims                                                                   |
| `ci` / coverage and states    | Same                                                  | Both Node lines execute the complete suite under 100% runtime coverage on Ubuntu; Node 24 checks badge freshness and message-state invariants                   | Required inside the relevant matrix lanes                                                                                     |
| `ci` / `pm-lifecycle`         | Same                                                  | pnpm 10, Yarn Classic 1.22.22, Yarn Berry 4.17.0 `node-modules`, and Bun 1.3.14 on all three OSes at Node 24, plus each manager at exact Node 22.11.0 on Ubuntu | Required; all sixteen combinations carry distinct support evidence                                                            |
| `ci` / `codeql`               | Same                                                  | Calls the reusable JS/TS CodeQL analysis with explicit SARIF permissions                                                                                        | Required through `CI Success`                                                                                                 |
| `codeql` / `analyze`          | Weekly, manual, or called by CI                       | CodeQL initialization, analysis, and code-scanning upload                                                                                                       | Required when called; scheduled/manual drift surveillance otherwise                                                           |
| `ci` / `ci-success`           | PR, `main` push, manual                               | Stable, fail-closed branch-protection context                                                                                                                   | Sole live required status context                                                                                             |
| `publish` / `validate`        | PRs changing `publish.yml`                            | GitHub parses the workflow and validates the reusable SLSA permission contract                                                                                  | Supplemental and path-specific; actionlint is the always-required static gate                                                 |
| `publish` / `publish`         | `v*` tag                                              | Version/tag match, OIDC-capable npm, locked install, tests, packed lifecycle, exact final tarball hash/artifact/publish                                         | Critical release path; up to 100 pending tags queue without replacement, preventing concurrent dist-tag writes                |
| `publish` / `provenance`      | After npm publish                                     | SLSA3 provenance for the final tarball hash                                                                                                                     | Critical; upstream reusable workflow owns its internal timeout                                                                |
| `publish` / `publish-release` | After publish and provenance                          | Same-run tarball and attestation uploaded together before immutable release publication                                                                         | Critical; artifact mismatch fails visibly                                                                                     |
| `render-demo` / `render`      | Relevant PR paths, manual                             | Real deterministic rendering, seven-day artifact, metadata/timing and visual similarity                                                                         | Supplemental because an always-required path-filtered context would block unrelated PRs; reviewer-visible failure is accepted |
| `repo-health` / `health`      | Weekly, manual                                        | Node/runner/registry drift, tests, packed npm lifecycle, current advisory state, stale branches                                                                 | Scheduled detection; audit failure is visible, while the same audit is also required on PRs                                   |
| `scorecard` / `scorecard`     | Branch-protection change, `main` push, weekly, manual | OpenSSF posture and SARIF                                                                                                                                       | Supplemental security posture, not product correctness                                                                        |
| Dependabot                    | Weekly                                                | npm and Actions version proposals; security updates remain immediate                                                                                            | Settings-owned update automation; every PR still passes required CI/review                                                    |

There is no TypeScript compiler, build artifact, native add-on, transpilation
step, deployment, or documentation generator, so separate typecheck, build,
deploy, and generated-doc lanes are not applicable. Internal Markdown-link
validation remains the explicit, bounded work in
[#141](https://github.com/RoryGlenn/commitment-issues/issues/141); external-link
availability is intentionally not a network-dependent merge gate.

The environment contract follows the completed
[package-manager and cross-platform audit](package-managers-and-cross-platform.md).
The later #83 follow-up adds a required exact-package matrix for Linux
`/bin/sh`, Bash, and Fish; macOS `/bin/sh` and Zsh; and Windows PowerShell and
Command Prompt. Those targets launch Git, while generated hooks remain POSIX
`sh` (Git's bundled shell on Windows). GUI clients are a separate manual
candidate gate in the
[Git-client release checklist](../git-client-release-checklist.md), not an
inference from the workflow step shell.

## Trust, permissions, and fork behavior

No workflow uses `pull_request_target`. Pull-request code runs only under
`pull_request`, with the repository default and every tracked workflow default
limited to `contents: read`. Every checkout sets
`persist-credentials: false`. No privileged tag, schedule, or SARIF workflow
downloads artifacts or caches produced by a pull request.

Job-level escalation is allowlisted and regression-tested:

| Job                  | Additional permission                                 | Reason                                                                         |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Called/direct CodeQL | `actions: read`, `security-events: write`             | Inspect workflow metadata and upload SARIF                                     |
| Scorecard            | `id-token: write`, `security-events: write`           | Publish signed Scorecard results and SARIF                                     |
| npm publish          | `id-token: write`                                     | npm trusted publishing and registry provenance                                 |
| SLSA caller          | `actions: read`, `id-token: write`, `contents: write` | Detect workflow, sign provenance, and satisfy the upstream nested-job contract |
| Final release        | `contents: write`                                     | Create the immutable GitHub Release and attach both assets                     |

GitHub currently allows all actions and does not enforce repository-wide SHA
pinning. Repo-local policy therefore checks every ordinary `uses:` reference
for a full commit SHA. The one exact exception is SLSA's documented
`@v2.1.0` reusable-workflow reference, whose identity design requires a
semantic tag; Dependabot monitors it. The public CI recipe now models full-SHA
pins, read-only permissions, a timeout, and non-persisted checkout credentials.

Live cross-repository PRs #129 and #166 prove that CI and CodeQL start under the
fork-safe event, and #166 proves the configured first-time-contributor approval
state. PR #227 completed the current-graph proof from a maintainer-controlled
fork. The unsigned head failed only DCO and the aggregate; the signed head
passed all required jobs after one coverage-only retry, with no source change.
Both stages reported read-only contents and metadata, no secret source,
non-persisted checkout credentials, and successful CodeQL upload. No fork
received release authority, and no unrelated contributor branch was mutated.

## Caches, artifacts, retention, and failure visibility

- npm caches are keyed by the lockfile through `setup-node` and are used only by
  read-only install/test jobs. The selected pnpm, Yarn, and Bun stores remain
  uncached so their lifecycle lanes prove clean installs. Publication disables
  the package-manager cache.
- Matrix `fail-fast: false` exposes every platform outcome. Every runnable job
  has an explicit timeout, and overlapping PR/scheduled jobs cancel where safe.
  Publication never cancels after it may cross an external boundary.
- Rendered demos are retained for seven days and uploaded before comparison, so
  a failed visual gate still leaves an inspectable artifact. The release
  tarball is retained for five days before becoming a permanent immutable
  release asset. The repository default for other logs/artifacts is 90 days.
- The lifecycle integration currently deletes its temporary fixture even on
  failure and reports one large phase. Named phases and better diagnostics are
  already owned by [#175](https://github.com/RoryGlenn/commitment-issues/issues/175).

## Settings-owned automation

The Actions API also reports dynamic Copilot reviewer, Copilot cloud-agent, and
Dependabot workflows. Copilot runs are GitHub-managed, can receive
`Deployments: write`, and identify `AgentSecrets` as their secret source. The
only live environment is `copilot`; it has no protection rules, and repository
and environment secret/variable inventories are empty. These paths are owner-
enabled privileged automation, not reproducible CI evidence from tracked YAML.

Dependabot dynamic runs use read-only repository/package metadata. Snyk adds a
supplemental external PR status. Secret scanning, push protection, Dependabot
security updates, and code-scanning storage are enabled platform services.
Their signals are useful, but tracked required CI remains authoritative because
external and settings-owned checks can change or become unavailable outside a
repository commit.

## Findings and dispositions

Runtime and policy defects received failing regressions before the workflow
fixes. Documentation-only corrections were checked by the final suite.

| Severity | File, commit, or live-setting evidence                                                                                                                                    | Finding and impact                                                                                                                            | Disposition                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Medium   | `b882972:.github/workflows/ci.yml:16-159`                                                                                                                                 | Workflow syntax and expression semantics depended only on GitHub accepting the file after push.                                               | Fixed: checksum-verified actionlint is part of required `quality`; local actionlint and zizmor runs supplement it.                         |
| Medium   | `b882972:.github/workflows/ci.yml:140-154`; `b882972:.github/workflows/codeql.yml:3-10`                                                                                   | CodeQL analysis ran separately, so successful completion was not a dependency of required `CI Success`.                                       | Fixed: reusable CodeQL analysis is now an exact-success dependency of the aggregate.                                                       |
| Medium   | `4d1a2a8:.github/workflows/codeql.yml:38-47`; `4d1a2a8:.github/workflows/ci.yml:206-230`; live ruleset `18531369`; PRs #216 and #217                                      | A successful CodeQL job could report a new alert without the alert itself blocking the merge.                                                 | Fixed on 2026-07-16: the ruleset blocks CodeQL Errors and High/Critical security alerts; PRs #216/#217 proved both paths.                  |
| Medium   | Fork PR #166 run `29425706633`; fork PR #227 runs `29546132668` and `29546490643`                                                                                         | The exact current graph had not run end to end with an external fork's downgraded token.                                                      | Fixed: #166 proves first-time approval; #227 proves unsigned fail-closed and signed-green current-graph execution with no secrets.         |
| Medium   | `b882972:.github/workflows/repo-health.yml:53-55`; `b882972:.github/workflows/ci.yml:16-159`                                                                              | High-severity dependency findings were weekly and `continue-on-error`, so vulnerable changes could merge and scheduled failures stayed green. | Fixed: the dependency audit gates required `quality` and now fails weekly health.                                                          |
| Medium   | `b882972:.github/workflows/publish.yml:1-26`                                                                                                                              | Different release tags could publish concurrently and race npm's `latest` dist-tag.                                                           | Fixed: one package-wide `queue: max` group serializes tags and retains up to GitHub's 100 pending runs.                                    |
| Medium   | `b882972:.github/workflows/ci.yml:17-20,142-147`; `b882972:.github/workflows/publish.yml:14-27,119-124`; `b882972:.github/workflows/scorecard.yml:14-18`                  | Several jobs had no timeout, and DCO/Scorecard/publication lacked explicit overlap policy.                                                    | Fixed: every runnable job is bounded; safe stale work cancels, release work queues.                                                        |
| Medium   | `b882972:.github/workflows/ci.yml:21-23,59,115`; `b882972:.github/workflows/repo-health.yml:26-28`                                                                        | Several read-only PR jobs left the checkout token in Git configuration.                                                                       | Fixed: every checkout disables credential persistence, enforced across the complete workflow inventory.                                    |
| Low      | `b882972:.github/workflows/ci.yml:17-40`; `b882972:.github/workflows/dco.yml:12-31`                                                                                       | Standalone DCO exactly duplicated the required CI job, used the floating runner Node, and produced an indistinguishable second check.         | Fixed: removed the workflow and pinned Node 24 in the sole required DCO owner.                                                             |
| Low      | `b882972:.github/workflows/ci.yml:68-87`; `b882972:.github/workflows/repo-health.yml:38-55`                                                                               | Lint/format ran six times; Ubuntu ran tests once directly and again under coverage; weekly health repeated static/package checks.             | Fixed: static work runs once, Ubuntu coverage owns its suite execution, and scheduled health retains only time-sensitive/runtime evidence. |
| Low      | `b882972:.github/workflows/publish.yml:84-99`                                                                                                                             | Release tarball output was expanded directly inside an OIDC-capable shell step.                                                               | Fixed: the value crosses through `env: TARBALL` and is shell-quoted.                                                                       |
| Low      | `b882972:.github/dependabot.yml:4-11,31-38`                                                                                                                               | Routine dependency releases could be proposed immediately after publication.                                                                  | Fixed: both ecosystems use a seven-day cooldown; GitHub documents that security updates bypass cooldown.                                   |
| Low      | `b882972:docs/ci-recipes.md:29-44`                                                                                                                                        | The user-facing GitHub Actions recipe modeled mutable major tags and persisted checkout credentials.                                          | Fixed: the sample now matches the repository safety baseline.                                                                              |
| Low      | `b882972:.github/CONTRIBUTING.md:63-68`; `b882972:GOVERNANCE.md:93-97`; `b882972:.github/skills/github-governance/SKILL.md:47-57`; `b882972:docs/scenario-coverage.md:60` | Governance, contributor, and scenario text retained stale DCO baseline, root `prepare`, and minimum-matrix claims.                            | Fixed against the current implementation and support boundary.                                                                             |

## Explicit downstream and accepted boundaries

| Boundary                                                                             | Disposition                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off-main tags can reach npm OIDC publication                                         | High #94, required input to release/supply-chain audit #136; no duplicate issue                                                                                                                                                           |
| The lifecycle test packs its own artifact before the final release tarball is packed | Release artifact sequencing belongs to #136; structured pack-once plumbing and diagnostics overlap #175                                                                                                                                   |
| Broken relative Markdown links are not checked                                       | #141 owns a deterministic, network-free repository checker                                                                                                                                                                                |
| Render-demo and publish validation are not universal required contexts               | Accepted: path-specific contexts cannot be required safely for unrelated PRs; reviewers see their results, while required tests/actionlint cover the always-applicable policy                                                             |
| Snyk, Scorecard, Copilot, and platform scanners are not `CI Success` dependencies    | Accepted as supplemental/settings-owned evidence; required audit plus CodeQL execution cover deterministic repository-controlled gates                                                                                                    |
| SLSA reusable workflow uses a semantic tag and owns its internal timeout             | Required upstream contract; exact allowlisted exception, documented and Dependabot-monitored                                                                                                                                              |
| Yarn Classic and Berry need separate executable identities                           | Both are exact and integrity-locked: Classic 1.22.22 remains in the root npm lockfile, while the isolated Berry fixture pins `@yarnpkg/cli-dist` 4.17.0 without replacing Classic's local bin                                             |
| Release upload uses `softprops/action-gh-release` instead of the GitHub CLI          | Accepted: the action supplies staged artifact upload and immutable finalization; it is full-SHA pinned and least-privileged                                                                                                               |
| GitHub's release concurrency queue is bounded at 100 pending runs                    | Accepted [platform limit](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency); PR validation uses separate groups, and maintainers publish tags deliberately one at a time |
| actionlint 1.7.12 does not yet recognize GitHub's `concurrency.queue` property       | Exact schema-lag diagnostic is suppressed; the property is regression-tested, and PR #178's hosted release-workflow validation confirms GitHub acceptance                                                                                 |
| Current external-fork graph and downgraded token boundary                            | Completed #180: PR #166 proves first-time approval; PR #227 proves the current graph, CodeQL upload, unsigned fail-closed path, signed green path, read-only token, and no secret source                                                  |
| Docs/community-only changes still instantiate the complete compatibility matrix      | Accepted to preserve a simple always-present fail-closed gate; a future skip classifier must prove it cannot weaken required coverage                                                                                                     |
| Admin can bypass the ruleset                                                         | Existing public governance exception; unchanged by this audit                                                                                                                                                                             |

## Regression evidence

`test/ci-policy.test.mjs` records the complete workflow inventory and fails on:

- an unreviewed action ref or permission escalation;
- `pull_request_target` or a checkout that persists credentials;
- a runnable job without a timeout or a workflow without overlap policy;
- removal of required static quality, audit, CodeQL, or aggregate dependencies;
- direct matrix/output expansion into shell commands;
- non-serialized publication;
- a duplicate DCO owner;
- loss of Dependabot cadence/cooldown coverage; or
- regression of the public GitHub Actions recipe.

The first run against the baseline failed on checkout credentials, missing
timeouts/concurrency, missing static workflow validation, and report-only
advisories. Focused red runs also preceded Dependabot cooldown, package-wide
publication serialization, duplicate-DCO removal, required CodeQL, literal
package-manager commands, and safe release-output handling.

The reviewer-found permission-shorthand and pending-release replacement shapes
were then restored together under the finished regressions: the focused run
failed 0/2 in the defective state and passed 2/2 after the fixes were reapplied.

## Verification record

Local final verification is recorded on macOS 26.5.2 with Node 26.4.0 and npm
11.17.0 using the exact commands below.
Hosted PR and `main` links below validate the changed architecture in addition
to the local evidence.

| Check                                        | Result                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| actionlint 1.7.12                            | Passed all six workflows with the exact `queue` schema-lag diagnostic ignored; checksum verified |
| zizmor 1.27.0 auditor mode                   | No Medium findings; the sole High analyzer result is the documented SLSA semantic-tag exception  |
| CI policy, metadata, and aggregate tests     | Passed; 50/50 focused tests                                                                      |
| `npm audit --audit-level=high`               | Passed; zero vulnerabilities                                                                     |
| `npm run lint`                               | Passed                                                                                           |
| `npm run format:check`                       | Passed                                                                                           |
| `npm test`                                   | Passed; 719/719 tests                                                                            |
| `npm run test:coverage`                      | Passed; 719/719 tests and 100% lines, branches, and functions                                    |
| `npm run coverage:check`                     | Passed; 719/719 tests, 100% coverage, and the 100.0% badge is current                            |
| `npm run states`                             | Passed; all 42 live message states                                                               |
| `npm run test:lifecycle:npm`                 | Passed; packed npm lifecycle across workspaces and linked worktrees                              |
| `npm pack --dry-run --json --ignore-scripts` | Passed; 59 files, 143,326-byte archive, 520,646 bytes unpacked                                   |
| `git diff --check`                           | Passed                                                                                           |

Hosted completion evidence:

- [PR #178 CI](https://github.com/RoryGlenn/commitment-issues/actions/runs/29381571143):
  all 22 required jobs passed, including static quality, six OS/Node lanes,
  twelve package-manager lanes, reusable CodeQL, and `CI Success`
- [PR #178 release-workflow validation](https://github.com/RoryGlenn/commitment-issues/actions/runs/29381571229):
  GitHub accepted the queue and reusable-workflow schema while every
  publish-capable job correctly skipped on the pull request
- [merged `main` CI](https://github.com/RoryGlenn/commitment-issues/actions/runs/29381843944):
  the same 22-job graph passed at merge commit `4d1a2a8`
- [standalone CodeQL on `main`](https://github.com/RoryGlenn/commitment-issues/actions/runs/29384848393):
  the revised manual/scheduled entry point initialized, analyzed, and uploaded
  successfully at `4d1a2a8`
- [Repository Health on `main`](https://github.com/RoryGlenn/commitment-issues/actions/runs/29384848376):
  the revised scheduled/manual path passed its locked install, tests, packed npm
  lifecycle, high-severity advisory gate, and stale-branch report
- [OpenSSF Scorecard on merged Audit 6](https://github.com/RoryGlenn/commitment-issues/actions/runs/29381843821):
  the post-merge settings/`main` path completed successfully
- [fork PR #166](https://github.com/RoryGlenn/commitment-issues/pull/166):
  fork-safe execution and CodeQL passed while unsigned DCO and the aggregate
  failed closed
- [external fork PR #227](https://github.com/RoryGlenn/commitment-issues/pull/227):
  unsigned [run 29546132668](https://github.com/RoryGlenn/commitment-issues/actions/runs/29546132668)
  failed only DCO and the aggregate after every other required job passed;
  signed [run 29546490643 attempt 2](https://github.com/RoryGlenn/commitment-issues/actions/runs/29546490643/attempts/2)
  passed all 34 required jobs with read-only permissions, no secret source, and
  successful CodeQL upload
- Live ruleset `18531369` remains active and strict with `CI Success` as its
  only required status context plus the CodeQL alert rule; repository workflow
  permissions remain read-only by default and first-time fork contributors
  still require approval
- [Disposable PR #216](https://github.com/RoryGlenn/commitment-issues/pull/216):
  the CodeQL analysis job succeeded, then the alert rule failed its merge check
  on Error/Critical command injection and kept the PR blocked
- [Clean PR #217](https://github.com/RoryGlenn/commitment-issues/pull/217):
  both the CodeQL analysis job and the separate ruleset alert check passed

Supporting baseline and scheduled evidence:

- [CI on merged Audit 5](https://github.com/RoryGlenn/commitment-issues/actions/runs/29379811767)
- [CodeQL on merged Audit 5](https://github.com/RoryGlenn/commitment-issues/actions/runs/29379811816)
- [OpenSSF Scorecard on merged Audit 5](https://github.com/RoryGlenn/commitment-issues/actions/runs/29379811783)
- [latest deterministic demo render](https://github.com/RoryGlenn/commitment-issues/actions/runs/29379535644)
- [successful v3.3.2 publication](https://github.com/RoryGlenn/commitment-issues/actions/runs/29194551447)

## Conclusion

The tracked automation now has one stable required gate, explicit permission and
timeout/concurrency policies, semantic workflow validation, required CodeQL
execution and dependency scanning, non-redundant static work, a support-aligned
platform matrix, and documented supplemental/settings-owned boundaries. After a
hosted pull request and the resulting `main` push validated the new reusable and
aggregate paths, Audit 6/9 is complete. CodeQL alert merge protection is now
active and independently evidenced under #177. Release authority remains
explicitly open for Audit 7/9. Current-architecture external-fork validation is
independently complete under #180 and PR #227; exact-candidate release and GUI
validation remain owned by Audit 9.

## 2026-07-18 phase-one CI feedback addendum (#204)

This addendum records the first scheduling change for
[#204](https://github.com/RoryGlenn/commitment-issues/issues/204) without
rewriting the historical Audit 6 snapshot above. Phase one separates the
Windows test suite from the packed npm lifecycle integration on both supported
Node lines. They now run as parallel required jobs instead of sequential steps
in the same Windows job.

The change preserves the existing evidence boundary:

- Windows still runs the complete unchanged test suite on Node 22.11.0 and
  Node 24;
- Windows still runs the same prebuilt-tarball npm lifecycle integration on
  both Node lines;
- no meaningful test, assertion, lifecycle scenario, supported platform, or
  supported Node lane is removed or skipped;
- the two Ubuntu coverage lanes remain unsharded and continue enforcing 100%
  line, branch, and function coverage, with Node 24 also checking badge
  freshness; and
- `CI Success` depends on both Windows jobs and fails closed unless each reports
  explicit success, just as it does for every other required dependency.

This phase did not introduce a change classifier, move compatibility evidence
to scheduled-only CI, or adopt test sharding. It changed scheduling only. Two
successful hosted observations used the measurement method in the
[CI performance baseline](../ci-performance.md):

| Event         | CI run                                                                          | Head commit                                | Jobs | Wall clock | Summed runner time |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------ | ---: | ---------- | ------------------ |
| PR #245       | [#750](https://github.com/RoryGlenn/commitment-issues/actions/runs/29650401160) | `9b26643d6978585bb603e042038e06ff953aab67` |   36 | 4m 10s     | 35m 31s            |
| merged `main` | [#751](https://github.com/RoryGlenn/commitment-issues/actions/runs/29650871447) | `74240e4f667b484607ab1221a2ce87e52e4898b2` |   36 | 4m 34s     | 36m 21s            |

These runs prove that the separated Windows test and lifecycle graph executes
and gates successfully on GitHub-hosted runners. Two observations are not the
required three-run after cohort, and neither the runner-time target nor the
broader #204 acceptance criteria are satisfied by this scheduling phase alone.

## 2026-07-18 phase-two Windows sharding decision addendum (#204)

Phase two compared two native test-file-sharding topologies on the remaining
Windows critical path. The all-Node topology replaces each unsharded Windows
test lane with the exact complementary pair `--test-shard=1/2` and
`--test-shard=2/2`, whose union assigns every top-level test file exactly once.

The all-Node architecture cohort used three successful first-attempt runs:
[#752](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651328636)
introduced the workflow, while
[#754](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651811092)
and
[#755](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651954831)
were evidence-document updates that still ran the identical 38-job full graph.
They produced 3m 30s/3m 37s wall-clock p50/p95 and 39m 50s/41m 23s summed
runner p50/p95. The mixed commit roles make them valid architecture timings,
not a same-change-class cohort or proof of documentation-only routing.

The selective topology kept the two Node 22.11.0 shards but restored one
complete Windows Node 24 lane. Its three successful first-attempt runs followed
the same role pattern:
[#756](https://github.com/RoryGlenn/commitment-issues/actions/runs/29652354078)
introduced the selective workflow, while
[#757](https://github.com/RoryGlenn/commitment-issues/actions/runs/29652509893)
and
[#758](https://github.com/RoryGlenn/commitment-issues/actions/runs/29652681381)
were evidence-document updates that ran the identical 37-job full graph. The
cohort produced 3m 54s/3m 58s wall-clock p50/p95 and 38m 33s/39m 03s runner
p50/p95. Its complete Node 24 test lane controlled the Windows critical path in
all three samples.

Compared with the selective cohort, all-Node sharding saved 24s at wall-clock
p50 and 21s at p95, while adding 1m 17s and 2m 20s of runner time. Selective
sharding reduced runner use but still regressed 9.2% at p50 from the baseline,
remained far above the 15–18-minute target, and missed the median wall-clock
target. All-Node sharding is therefore the adopted phase-two topology and the
only measured option that meets the median wall-clock target. Complete tables,
per-lane timings, calculations, and the excluded rerun are recorded in
[CI performance evidence](../ci-performance.md#after-optimization-evidence).

The adopted topology preserves the evidence boundary:

- both Ubuntu coverage lanes remain complete and unsharded, continue enforcing
  100% line, branch, and function coverage, and retain the Node 24 badge check;
- macOS continues running the complete unsharded suite on both Node lines;
- Windows runs the exact `1/2` and `2/2` pair on both Node lines, so every test
  file executes exactly once per supported Node version;
- Windows retains the same separate prebuilt-tarball npm lifecycle integration
  on both Node lines;
- no meaningful test, assertion, lifecycle scenario, platform, or Node lane is
  removed; and
- `CI Success` continues failing closed when any shard, lifecycle job, or other
  required dependency is unsuccessful or incomplete.

This phase did not add the change classifier, reuse lifecycle setup, move
compatibility evidence to scheduled-only CI, or satisfy the documentation-only
or 15–18-minute runner targets. [PR #246](https://github.com/RoryGlenn/commitment-issues/pull/246)
subsequently merged as `140f219136496d2c9cfd43ebc9e41e64a1e26f0e`.
Issue #204 was then closed as completed even though its classifier, lifecycle-
reuse decision, documentation-route timing, and routing-evidence items were
still absent; the follow-up below records that gap instead of treating the
closed state as technical evidence.

## 2026-07-18 fail-closed classifier and lifecycle decision (#204)

The classifier merged through
[PR #247](https://github.com/RoryGlenn/commitment-issues/pull/247) as
`ad25036d36a691e81a8cbb710c08708e438e904a`. It reads the complete local Git
diff from the true merge base with `--name-status -z --find-renames` and emits
the requested runtime,
package-manager, test/fixture, workflow/release, documentation/metadata,
demo/asset, and unknown categories, but optimizes only a non-empty change set
containing `A`/`M` records whose every path is on the explicit
documentation/metadata allowlist. Demo/assets retain the full graph until a
smaller visual route is independently proven. Pushes and manual runs always
use the full graph.

For pull requests, the workflow extracts and executes the classifier from the
immutable base SHA rather than trusting the proposed head tree. This prevents a
fork from changing the decision code that classifies its own diff. The initial
rollout or another missing trusted copy produces a fixed full-route tuple;
extraction or execution failure produces no trusted tuple, which launches the
full graph and also fails the aggregate.

The defensive boundary is executable rather than aspirational:

- full 40- or 64-character object IDs, complete history, both commit objects,
  and a true merge base are required before a small route is possible;
- NUL records preserve spaces, tabs, newlines, Unicode, and leading hyphens;
  rename/copy records retain both paths. Every deletion, rename, or copy takes
  the full graph even when all paths are documentation, while non-canonical
  backslash and traversal-shaped names remain unknown;
- executable editor configuration, mixed categories, unknown paths,
  type/unmerged/unknown statuses, empty or malformed output, shallow history,
  missing objects, no common ancestor, and Git failure select the full graph;
  and
- every compatibility job skips only for the exact tuple `route=docs`,
  `full_graph=false`, `docs_only=true`,
  `categories=documentation-metadata`, and `reason=docs-only`. Missing,
  contradictory, or failed classifier output launches the full graph, while
  `CI Success` also fails the run so a classifier crash cannot be mistaken for
  success.

DCO and `quality` remain unconditional. The latter retains actionlint,
high-severity dependency audit, lint, formatting, and a focused command that
currently exercises 164 documentation, metadata, schema, link, asset, release,
and policy assertions in about 4.6 seconds locally. That subset derives the
canonical 100% badge from the enforced threshold, so README-only edits retain
badge freshness without rerunning runtime coverage. Full-route coverage and
compatibility commands are unchanged.

The first hosted bootstrap measurement is complete.
[PR #247 run #761](https://github.com/RoryGlenn/commitment-issues/actions/runs/29655146160)
passed all 39 jobs at
`3f897f8c2bac2d9533d57c0789e779db4a5a07aa`. Its 4-second classifier job
emitted the expected fail-closed tuple `route=full`, `full_graph=true`,
`docs_only=false`, `categories=unknown`, and
`reason=trusted-classifier-unavailable`, because the PR base did not yet
contain the trusted script. The first full-graph job started two seconds after
classification completed. `CI Success` passed after 3m 27s wall clock; summed
runner time was 37m 13s. This validates the rollout fallback and shows that the
classifier barrier did not move the full route outside the 3–3.5-minute
wall-clock target. It does not substitute for the post-merge trusted-base
documentation, category, structural-change, unknown, and external-fork routing
evidence. Cancellation uses `!cancelled()` so a superseded PR does not keep
that matrix alive.

The proposed cross-job "pack once, download everywhere" lifecycle reuse was
measured and rejected rather than assumed to be faster. Ten local
`npm pack --ignore-scripts` samples averaged 0.308s (0.30–0.32s) for a 146 KiB
tarball. The 30 lifecycle jobs in hosted run
[#760](https://github.com/RoryGlenn/commitment-issues/actions/runs/29654045168)
used 1,669 runner-seconds, including 549 seconds in lifecycle steps and 195
seconds in `npm ci`. Removing 29 packs would save only about nine aggregate
seconds before adding one producer, 30 artifact downloads, and a scheduling
barrier. Sharing `node_modules` would cross OS/tool-shim and locked-install
boundaries and remains prohibited. The exact-tarball argv, environment, digest,
and immutability plumbing stays available in every lifecycle harness. A
separate three-OS shell-group benchmark may test removal of four duplicated
setup boundaries; package-manager lifecycle aggregation remains coordinated
with #175 so one early failure cannot hide later evidence.
