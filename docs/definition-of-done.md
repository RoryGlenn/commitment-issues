# Definition of Done

This policy defines objective finish lines for individual changes, releases,
public promotion, and the point at which `commitment-issues` can be declared
feature complete. It prevents an open-ended backlog from turning “done” into a
moving target.

## Product promise

`commitment-issues` catches common, fixable Git workflow problems while they
are still cheap to correct, without taking control away from the developer.

The supported product must remain:

- advisory by default, with blocking enabled only by explicit repository
  configuration;
- local and free of telemetry or repository uploads;
- safe for working trees and Git history, refusing ambiguous mutation;
- actionable, with one coherent presentation for each Git operation;
- reversible through documented and tested removal; and
- honest about its tested compatibility and limitations.

The project does not need to solve every Git workflow problem. It is complete
when it delivers this promise reliably within its documented scope.

## A change is done when

- The linked issue or pull request acceptance criteria are satisfied.
- New behavior has automated tests, and a practical regression test accompanies
  every defect fix.
- Safety boundaries, advisory defaults, and explicit enforcement remain intact.
- User-visible behavior, configuration, schemas, examples, and documentation
  agree.
- User-visible changes are recorded under `CHANGELOG.md`'s `Unreleased`
  section.
- The behavior has been exercised through the same packaged or subprocess
  surface that users run, when applicable.
- Cross-platform work avoids untested shell, path, permission, and line-ending
  assumptions.
- Lint, formatting, tests, coverage, and all change-specific validation pass.
- Required CI and review requirements pass, every commit has a DCO sign-off,
  and no actionable review thread remains.
- The pull request contains one logical change and no unrelated cleanup.
- The change is merged. An implemented but unmerged branch is not done.

## A release is done when

- The release commit is on a fully green `main` branch.
- The package version, immutable tag, changelog entry, npm release, and GitHub
  Release identify the same version.
- The exact packed tarball is installed and exercised in a clean disposable
  repository rather than inferred from the source checkout.
- Every public CLI command and the init, hook, doctor, upgrade or
  re-initialization, and uninstall paths have relevant evidence.
- Advisory behavior continues without unexpected blocking, and configured
  enforcement blocks only the documented condition.
- Claims for Node.js, operating systems, package managers, shells, workspaces,
  and Git clients do not exceed the tested support matrix.
- Required packed-artifact shell CI passes. GUI-client evidence is recorded
  with the manual [GUI Git-client checklist](git-client-release-checklist.md)
  for every client the release claims as verified; any unexecuted lane is
  explicitly classified as unsupported/unverified, excluded from support
  claims, and owned by a linked follow-up issue.
- README instructions, examples, message states, and promotional media describe
  behavior available in that release.
- Trusted publishing, npm provenance, the GitHub release assets, and independent
  verification succeed as documented in
  [Release Verification](release-verification.md).
- No Critical or High finding remains open. Every remaining Medium finding has
  an explicit acceptance or deferral decision and a tracking issue.
- The fix-forward path is known. A consumed release tag is never moved or
  reused.

Passing tests in the source checkout alone is not sufficient release evidence.

## The project is ready to promote when

A developer who has never seen the project can, without maintainer help:

1. understand the problem and value from the README in about 30 seconds;
2. install the published package in a clean supported project;
3. initialize it and reach a useful warning within about five minutes;
4. understand what happened, why it matters, and what to do next;
5. observe advisory behavior before choosing stricter enforcement; and
6. preview and complete removal without damaged or orphaned hook wiring.

Promotion also requires:

- completion of the production-readiness gate tracked by
  [#101](https://github.com/RoryGlenn/commitment-issues/issues/101), including
  independent verification in
  [#138](https://github.com/RoryGlenn/commitment-issues/issues/138);
- a published release that satisfies the release definition above;
- documentation of privacy, trust boundaries, bypass behavior, limitations, and
  removal;
- no known defect that compromises installation, distribution, security, hook
  integrity, reversibility, or the core product promise; and
- readiness to execute the human-written launch tracked by
  [#78](https://github.com/RoryGlenn/commitment-issues/issues/78).

## Stop rule

Once every required gate for the current milestone passes, complete the
milestone. Do not add another gate unless new evidence identifies a security,
data-loss, installation, distribution, or core-workflow defect.

An open feature backlog does not make a release or launch unfinished. Proposed
registries, runtimes, adapters, presentation styles, platform expansions,
rewrites, marketing submissions, and certification improvements remain
non-blocking unless the documented product promise cannot be met without them.

## Feature complete — maintenance mode

The project may be declared **feature complete — maintenance mode** when the
supported product solves the product promise and continued feature expansion is
no longer necessary to meet it.

Feature complete means that product scope is closed indefinitely. It does not
mean abandoned, unsupported, archived, or frozen against necessary maintenance.

### Entry criteria

All of the following must be true:

- The promotion definition above has been satisfied and the public launch has
  happened.
- At least one post-launch feedback and stable-release cycle has been triaged.
- Repeated adopter feedback does not reveal an unmet need within the core
  product promise.
- Core behavior, public interfaces, supported environments, safety boundaries,
  and removal are tested and documented.
- There are no open Critical or High findings, and remaining risks have explicit
  dispositions.
- Security response, dependency updates, release operations, governance,
  maintainer continuity, and support boundaries are documented.
- Every open feature proposal has been accepted as required maintenance, moved
  to a separately scoped future project, or closed as not planned.
- A normal pull request updates [the roadmap](../ROADMAP.md) with the declaration
  date, baseline version, supported matrix, and maintenance policy.

The declaration is an intentional maintainer decision, not an automatic result
of low issue activity.

### Work allowed in maintenance mode

Maintenance includes:

- security and vulnerability fixes;
- defects and regressions against documented behavior;
- compatibility work needed to preserve the supported environment matrix;
- dependency, GitHub Actions, provenance, and release-tooling updates;
- test, CI, packaging, and documentation reliability;
- support and governance corrections;
- migrations or deprecations required by upstream ecosystem changes; and
- bounded refactoring that demonstrably reduces maintenance or security risk
  without expanding product behavior.

### Work outside maintenance mode

Maintenance does not include:

- new categories of Git checks or product capabilities;
- new adapters, ecosystems, registries, languages, or platform targets;
- a standalone rewrite or new major-version architecture;
- additional terminal presentation systems;
- telemetry, hosted services, or accounts;
- speculative optimization; or
- opportunistic refactoring without a concrete maintenance benefit.

Such proposals should normally be closed as not planned or placed in a
separately scoped future project rather than kept indefinitely in the active
backlog.

### Reopening feature development

Feature development may resume only through an explicit roadmap and governance
pull request that:

1. presents evidence that an external platform change, repeated adopter need,
   or material security and maintenance benefit makes the current scope
   insufficient;
2. defines the bounded new scope and its non-goals;
3. documents compatibility, migration, support, and maintenance costs; and
4. establishes a new measurable definition of done.

One appealing feature request is not enough to leave maintenance mode.

## Current status

The project remains in active development through the production-readiness
audit, public launch, and first feedback cycle. This document defines the gate
for a future maintenance-only declaration; it does not declare that state by
itself.
