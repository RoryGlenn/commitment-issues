# Why Catch Problems Before CI?

> **GitHub Actions catches mistakes after they become expensive. Commitment
> Issues catches them while they are still cheap.**

Continuous integration is the authoritative shared gate. It verifies code in a
controlled environment after that code has been pushed. Commitment Issues does
not replace that responsibility. It moves preventable feedback earlier, into
the commit and push workflow, while the developer still has the relevant code
and intent in mind.

The result is not fewer standards. It is a shorter and less disruptive path to
meeting the same standards.

## One mistake, two timelines

Consider a formatting problem that takes only a few seconds to correct once it
is identified.

### CI-only feedback

1. The developer commits and pushes the problem.
2. The workflow waits for a runner and executes its jobs.
3. The developer starts another task while waiting.
4. CI reports the failure.
5. The developer returns to the old task, reads the remote logs, and restores
   the relevant context.
6. The developer fixes the problem, pushes again, and waits through another
   workflow run.

### Earlier local feedback

1. The developer attempts the commit or push.
2. Commitment Issues identifies the problem and explains the next safe action.
3. The developer corrects it while still working in the same context.
4. The first push reaches CI without that preventable failure.
5. CI still performs the authoritative verification.

The local check does not eliminate CI time. It avoids an unnecessary failed run,
the interruption it creates, and the additional run required after correction.

## Where the cost comes from

### Waiting and rerunning

A preventable failure consumes more than runner time. It may include queue
latency, test execution, log review, a corrected push, and another complete or
partial workflow run.

### Context switching

The developer often begins another task while CI runs. Returning to the failed
change requires reconstructing what the code was doing and why. That recovery
time can cost more than the actual fix.

### Review and merge delay

Failed checks postpone review, occupy merge queues, and create extra
notifications. Reviewers may also begin looking at a change that the author
already could have known was not ready.

### Security response

A local secret warning can appear before a commit is shared. A CI secret warning
appears only after the commit has reached the remote system, where removing the
secret from the latest revision does not necessarily remove it from history.

### Frustration and broken focus

Repeated fail-wait-fix-rerun cycles make small mistakes feel expensive. Earlier
feedback keeps the correction close to the action that caused it and reduces
the amount of remote output a developer must interpret.

## An illustrative ROI calculation

Teams should use their own measurements. A simple starting model is:

```text
annual hours lost =
  developers
  × preventable CI failures per developer per week
  × minutes lost per failure
  × 52
  ÷ 60

annual engineering cost =
  annual hours lost × loaded hourly engineering cost
```

For example, assume:

- 20 developers;
- 2 preventable CI failures per developer each week;
- 12 minutes lost to waiting, investigation, context recovery, correction, and
  rerunning; and
- a $100 loaded hourly engineering cost.

The illustrative calculation is:

```text
20 × 2 × 12 × 52 ÷ 60 = 416 hours per year
416 × $100 = $41,600 per year
```

This is not a promised saving or a universal benchmark. It demonstrates how a
small recurring interruption can become significant across a team. Replace
every assumption with observed values from the repository being evaluated.

The calculation also excludes CI compute charges, delayed reviews, merge-queue
congestion, and the cost of responding to an exposed secret.

## Measure it in your own repository

A short before-and-after trial is more credible than a generic productivity
claim.

### Establish a baseline

For two to four weeks, record:

- CI runs that failed for problems detectable before push, such as lint,
  formatting, missing related tests, or an accidentally staged secret;
- median time from push to the first useful failure message;
- time from the failed run to the corrected push;
- additional CI runs caused by those failures; and
- how often a developer had switched to another task before the failure
  arrived.

### Run an advisory pilot

Enable Commitment Issues in advisory mode for a comparable period. Keep CI
unchanged and authoritative. Measure how many local findings were corrected
before the first push and how many corresponding CI reruns were avoided.

### Calculate the observed effect

Use the measured reduction in preventable failures and the team's own time and
cost assumptions. Separate confirmed savings from harder-to-quantify benefits
such as reduced frustration or lower secret-exposure risk.

Commitment Issues performs no telemetry or repository upload. A team that wants
these measurements should obtain them from its existing CI history and an
explicit internal trial rather than from hidden product tracking.

## What CI still does

CI remains essential because local hooks can be bypassed, disabled, missing, or
run in a different environment. CI should continue to provide:

- shared enforcement that does not depend on one developer's machine;
- clean-environment and cross-platform verification;
- complete integration, build, and deployment workflows;
- protected-branch and merge requirements; and
- an auditable result for the team.

Commitment Issues improves the path to that gate. It does not weaken or replace
the gate.

## Current and planned behavior

Today, Commitment Issues provides local commit and push feedback while projects
run their normal lint, formatting, test, and other enforcement commands in CI.
See the [CI provider recipes](ci-recipes.md) for the current integration model.

[Issue #145](https://github.com/RoryGlenn/commitment-issues/issues/145) proposes
a future CI-oriented command and GitHub Action that would evaluate the same
policy locally and in CI. That planned model is **one policy at two
checkpoints**:

1. immediate advisory feedback before code leaves the developer's machine; and
2. authoritative enforcement on the shared CI runner.

Until that feature ships, it should not be presented as current behavior.

## When CI alone may be enough

Commitment Issues will not provide the same value to every repository. CI alone
may be sufficient when:

- the project is very small;
- CI starts and finishes almost immediately;
- preventable local failures are rare;
- developers do not experience meaningful context-switching costs; or
- the team does not want local Git-hook feedback.

The relevant question is not whether CI can eventually find the problem. It is
whether finding that problem earlier saves enough time, money, risk, or
frustration to justify the local feedback layer.
