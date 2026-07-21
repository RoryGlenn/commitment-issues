# Roadmap

This document describes the current public direction for `commitment-issues`.
It distinguishes the supported v3 product from proposed post-launch work; an
open issue is a design proposal, not a compatibility or delivery promise.

The canonical [Definition of Done](docs/definition-of-done.md) defines the
completion gates for changes, releases, public promotion, and a future
feature-complete maintenance-only state. Once a milestone meets its gate, new
ideas remain backlog candidates rather than retroactive blockers.

## Current product and near-term priority

The supported v3 release is a local, advisory-first Git-hook toolkit for
JavaScript and TypeScript projects running Node.js >=22.11.0. It remains the
recommended release while future architecture is evaluated.

The immediate priority is completing the production-readiness audit tracked in
[#101](https://github.com/RoryGlenn/commitment-issues/issues/101). The nine audit
workstreams run in their documented dependency order, ending with independent
final verification in
[#138](https://github.com/RoryGlenn/commitment-issues/issues/138).

The technically validated, human-written Product Hunt launch tracked in
[#240](https://github.com/RoryGlenn/commitment-issues/issues/240) follows that
verification. The launch has no fixed date until every audit workstream is
closed, every Critical and High finding is resolved, remaining findings have an
explicit disposition, and the final verification passes. Non-blocking feature
work should wait until launch feedback can inform the next choices.

## Guiding principles

The project will prioritize:

- protecting user working trees and Git history;
- advisory behavior by default and explicit opt-in enforcement;
- local execution without telemetry or repository uploads;
- clear ownership, reversible setup, and safe refusal paths;
- cross-platform behavior backed by explicit tests;
- supply-chain transparency and verifiable releases; and
- small, reviewable changes with tests and documentation.

## Planned work

### Complete the production-readiness audit

The audit is the launch-critical execution plan:

1. Audit core CLI and Git behavior in
   [#130](https://github.com/RoryGlenn/commitment-issues/issues/130) and security,
   secrets, paths, and subprocesses in
   [#131](https://github.com/RoryGlenn/commitment-issues/issues/131). Read-only
   inspection may run in parallel, with behavior and security changes
   coordinated before they merge.
2. Audit test quality and meaningful coverage in
   [#132](https://github.com/RoryGlenn/commitment-issues/issues/132).
3. Audit terminal UX in
   [#133](https://github.com/RoryGlenn/commitment-issues/issues/133) and package
   manager and cross-platform behavior in
   [#134](https://github.com/RoryGlenn/commitment-issues/issues/134). These may
   run in parallel after the test audit.
4. Complete the CI/CD audit in
   [#135](https://github.com/RoryGlenn/commitment-issues/issues/135), the release
   and packaging audit in
   [#136](https://github.com/RoryGlenn/commitment-issues/issues/136), and the
   documentation and governance audit in
   [#137](https://github.com/RoryGlenn/commitment-issues/issues/137), in order.
5. Run the independent clean-checkout verification in
   [#138](https://github.com/RoryGlenn/commitment-issues/issues/138). Closing
   this workstream is the go/no-go gate for the launch.

Finishing a workstream does not require implementing every non-blocking idea it
discovers. It does require recording each finding, fixing all launch blockers,
and explicitly accepting or deferring remaining risks in separately tracked
issues before closing the workstream.

### Maintain and support v3

- Keep npm, pnpm, Yarn, Bun, Node.js, framework, monorepo, migration, and CI
  guidance aligned with the tested support matrix.
- Keep dependencies, pinned GitHub Actions, CodeQL, Scorecard, trusted
  publishing, release provenance, and vulnerability reporting current.
- Preserve 100% measured runtime coverage and add focused regression tests for
  practical defects.
- Keep the README, FAQ, configuration reference, external interface, message
  states, and release-verification instructions synchronized with behavior.

### Validate platform compatibility

The required cross-shell matrix landed through
[#83](https://github.com/RoryGlenn/commitment-issues/issues/83). It covers hook
quoting, paths, permissions, line endings, and restricted `PATH` environments.
Post-launch GUI-client validation remains separately tracked in
[#231](https://github.com/RoryGlenn/commitment-issues/issues/231); until those
UI lanes run, the project does not claim verified support for VS Code Source
Control, JetBrains commit/push UI, or GitHub Desktop.

### Evaluate the v4 standalone core

The proposed v4 workstream is tracked in
[#84](https://github.com/RoryGlenn/commitment-issues/issues/84). Its current
direction is one language-neutral standalone Go executable, with GitHub release
artifacts and optional ecosystem-specific distribution wrappers. The first
stage is to define the v3 compatibility, configuration, output, installation,
migration, rollback, and support contracts before treating a rewrite as a GA
commitment.

v3 remains supported during that evaluation. The project should not maintain
separate behavioral implementations for each programming language.

### Consider post-launch product requests

- Configurable lint/format adapters, beginning with Biome, are specified in
  [#81](https://github.com/RoryGlenn/commitment-issues/issues/81). Implement
  them only if adopter demand justifies the added surface.
- Configurable terminal presentation is specified in
  [#86](https://github.com/RoryGlenn/commitment-issues/issues/86). Preserve the
  existing output and one-presentation invariant by default.
- Additional advisory checks should remain local, dependency-light,
  deterministic, actionable, and integrated into the existing message and JSON
  models.

## Non-goals

The project does not intend to:

- become a general-purpose arbitrary-command hook framework;
- replace linters, formatters, test runners, CI, or server-side policy;
- add telemetry, analytics, repository uploads, or a required SaaS account;
- mutate ambiguous unstaged work or rewrite pushed history;
- make blocking behavior the universal default;
- maintain separate native cores for every programming language;
- promise untested shell, GUI-client, or locked-down-workstation support; or
- commit generated release binaries into the source tree.

## How priorities are chosen

- Treat the production-readiness tracker and its nine workstreams as the
  current execution plan. Independent verification in #138 gates the launch in
  #240.
- Treat [ADOPTION.md](ADOPTION.md) as the maintainer checklist for work that has
  already landed and launch/adoption tasks that follow the audit.
- Treat linked GitHub issues as the detailed acceptance criteria for proposed
  work.
- Use real installation attempts and post-launch feedback before promoting an
  optional idea into committed implementation work.
- Update this roadmap through the normal pull-request process when priorities
  change.
