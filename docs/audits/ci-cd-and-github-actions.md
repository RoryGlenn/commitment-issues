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

Fork evidence is intentionally composite rather than overstated: external PR
#166 proves the fork-safe `pull_request` event, merge-ref checkout, downgraded
token boundary, CodeQL upload, and fail-closed DCO/aggregate behavior. PR #178
then proves the changed reusable-CodeQL permission contract and expanded
aggregate under the same event type. No post-refactor external contributor has
yet pushed a new revision, so that exact end-to-end combination remains useful
live surveillance rather than an undisclosed completion claim. The exact
fork-token run is tracked as Medium evidence gap
[#180](https://github.com/RoryGlenn/commitment-issues/issues/180).

No Critical or High finding owned by this workstream remains. The known High
release-authorization gap is deliberately retained under
[#94](https://github.com/RoryGlenn/commitment-issues/issues/94) for the following
release and supply-chain audit (#136): a matching `v*` tag is still not proven
to originate from reviewed `main`. That is an explicit downstream disposition,
not a claim that the release boundary is safe already.

The remaining Medium settings change is tracked in
[#177](https://github.com/RoryGlenn/commitment-issues/issues/177). Required CI
proves that CodeQL analysis completed. Governance now selects CodeQL
tool-severity Errors and High-or-Critical security alerts as the launch
threshold, but the alert rule remains supplemental until the owner authorizes
the live ruleset mutation and positive and negative pull-request evidence is
recorded.

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

This folds CodeQL execution into the existing gate without adding a second live
ruleset context. A skipped, cancelled, timed-out, or failed analysis fails
closed. The live ruleset does not enable code-scanning alert merge protection,
so a completed CodeQL scan may still succeed while reporting a new alert.
Render-demo, publish-workflow validation, Scorecard, Snyk, alert findings, and
GitHub-managed scanners remain supplemental for the reasons recorded below.

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
fork-safe event. PR #166 passed every then-current OS/Node and package-manager
lane while DCO and `CI Success` correctly failed its unsigned commit. Neither
fork received release authority. PR #178 subsequently proved the changed
reusable CodeQL call, expanded matrix, exact-success aggregate, and release
workflow parsing; its merged `main` run repeated the full required graph. This
composite evidence covers the changed architecture without mutating an unrelated
contributor branch merely to manufacture a new event. The live fork approval
policy still requires approval for first-time contributors.

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
| Medium   | `4d1a2a8:.github/workflows/codeql.yml:38-47`; `4d1a2a8:.github/workflows/ci.yml:206-230`; live ruleset `18531369`                                                         | A successful CodeQL job can report a new alert without the alert itself blocking the merge.                                                   | Prepared in #177: block CodeQL Errors and High/Critical security alerts; live activation and positive/negative evidence remain.            |
| Medium   | Fork PR #166 run `29350550947`; same-repository PR #178 run `29381571143`                                                                                                 | The exact post-refactor graph has not run end to end with an external fork's downgraded token.                                                | Tracked in #180: use a disposable or natural fork revision to validate reusable CodeQL, the expanded matrix, and the aggregate together.   |
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
| CodeQL alerts do not themselves block merging                                        | #177 selects Errors and High/Critical security alerts for [merge protection](https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection); live activation and evidence remain                                       |
| Snyk, Scorecard, Copilot, and platform scanners are not `CI Success` dependencies    | Accepted as supplemental/settings-owned evidence; required audit plus CodeQL execution cover deterministic repository-controlled gates                                                                                                    |
| SLSA reusable workflow uses a semantic tag and owns its internal timeout             | Required upstream contract; exact allowlisted exception, documented and Dependabot-monitored                                                                                                                                              |
| Yarn Classic and Berry need separate executable identities                           | Both are exact and integrity-locked: Classic 1.22.22 remains in the root npm lockfile, while the isolated Berry fixture pins `@yarnpkg/cli-dist` 4.17.0 without replacing Classic's local bin                                             |
| Release upload uses `softprops/action-gh-release` instead of the GitHub CLI          | Accepted: the action supplies staged artifact upload and immutable finalization; it is full-SHA pinned and least-privileged                                                                                                               |
| GitHub's release concurrency queue is bounded at 100 pending runs                    | Accepted [platform limit](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency); PR validation uses separate groups, and maintainers publish tags deliberately one at a time |
| actionlint 1.7.12 does not yet recognize GitHub's `concurrency.queue` property       | Exact schema-lag diagnostic is suppressed; the property is regression-tested, and PR #178's hosted release-workflow validation confirms GitHub acceptance                                                                                 |
| No post-refactor external fork revision has run the complete new graph               | Medium #180: current evidence is composite—PR #166 proves fork token/event behavior, while PR #178 proves reusable CodeQL and the expanded aggregate; record the next external revision without mutating an unrelated contributor branch  |
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
- Live ruleset `18531369` remained active and strict with only `CI Success`
  required; repository workflow permissions remained read-only by default and
  first-time fork contributors still require approval

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
aggregate paths, Audit 6/9 is complete. Release authority remains explicitly
open for Audit 7/9, and CodeQL alert merge protection remains separately tracked
in #177. Current-architecture external-fork validation remains separately
tracked in #180 rather than being hidden by this completion claim.
