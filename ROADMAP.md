# Roadmap

This document describes the current public direction for `commitment-issues`.
It distinguishes the supported v3 product from proposed post-launch work; an
open issue is a design proposal, not a compatibility or delivery promise.

## Current product and near-term priority

The supported v3 release is a local, advisory-first Git-hook toolkit for
JavaScript and TypeScript projects running Node.js >=22.11.0. It remains the
recommended release while future architecture is evaluated.

The immediate priority is the technically validated, human-written public
launch tracked in
[#78](https://github.com/RoryGlenn/commitment-issues/issues/78). Non-blocking
feature work should wait until launch feedback can inform the next choices.

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

The cross-shell and Git-client matrix is tracked in
[#83](https://github.com/RoryGlenn/commitment-issues/issues/83). It separates
shell launch behavior from GUI-client behavior and covers hook quoting, paths,
permissions, line endings, and restricted `PATH` environments. Until that work
lands, the project should not claim blanket support for every shell or Git GUI.

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

- Treat [ADOPTION.md](ADOPTION.md) as the maintainer checklist for work that has
  already landed and remaining launch/adoption tasks.
- Treat linked GitHub issues as the detailed acceptance criteria for proposed
  work.
- Use real installation attempts and post-launch feedback before promoting an
  optional idea into committed implementation work.
- Update this roadmap through the normal pull-request process when priorities
  change.
