# CI performance baseline

This document is the reproducible timing record for
[#204](https://github.com/RoryGlenn/commitment-issues/issues/204). It separates
workflow wall-clock time from summed runner time and keeps the current
before-optimization evidence distinct from future after-optimization results.
It is repository evidence, not a published-package contract or a timing gate.

## Measurement method

The source is GitHub's REST API for the `CI` workflow:

- `GET /repos/RoryGlenn/commitment-issues/actions/runs/{run_id}` supplies
  `run_started_at` and `updated_at`;
- `GET /repos/RoryGlenn/commitment-issues/actions/runs/{run_id}/jobs?per_page=100`
  supplies every job's `started_at` and `completed_at`.

For each run:

- **wall clock** is `updated_at - run_started_at`;
- **summed runner time** is the sum of `completed_at - started_at` for every
  reported job with both timestamps, including the reusable CodeQL job and the
  final `CI Success` job; and
- **job count** is the API's `total_count`.

Summed runner time is raw elapsed job time. It is not GitHub's billable-minute
calculation and does not apply operating-system billing multipliers. Wall clock
includes orchestration around the parallel jobs; summed runner time measures
the total occupied time across those jobs.

The following commands reproduce one observation. Replace `CI_PERF_RUN_ID`
with another run ID without changing the calculations:

```bash
CI_PERF_REPO=RoryGlenn/commitment-issues
CI_PERF_RUN_ID=29649185856

curl --fail --location --silent --show-error \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$CI_PERF_REPO/actions/runs/$CI_PERF_RUN_ID" |
  jq '{
    run_number,
    run_started_at,
    updated_at,
    wall_seconds:
      ((.updated_at | fromdateiso8601) -
       (.run_started_at | fromdateiso8601))
  }'

curl --fail --location --silent --show-error \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$CI_PERF_REPO/actions/runs/$CI_PERF_RUN_ID/jobs?per_page=100" |
  jq '{
    job_count: .total_count,
    runner_seconds: ([
      .jobs[] |
      select(.started_at != null and .completed_at != null) |
      ((.completed_at | fromdateiso8601) -
       (.started_at | fromdateiso8601))
    ] | add)
  }'
```

Percentiles use the nearest-rank method. For `n` ordered observations, percentile
`p` is the observation at one-based rank `ceil(p * n)`. With only three samples,
p95 is the maximum; it is useful as the issue's minimum comparison record, not
as a stable estimate of tail behavior.

## Before-optimization cohort

The baseline was captured on 2026-07-18 from three successful revisions of
[PR #244](https://github.com/RoryGlenn/commitment-issues/pull/244). All three ran
the same 34-job `CI` graph. They are comparable measurements of the current
full graph, but the PR includes documentation, tests, visual assets, and a
rendering-workflow change, so this cohort alone does not prove the future
code-PR or documentation-only targets.

| CI run                                                                          | Head commit                                | UTC interval                 | Jobs | Wall clock | Summed runner time |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- | ---: | ---------- | ------------------ |
| [#746](https://github.com/RoryGlenn/commitment-issues/actions/runs/29647937352) | `cde2dd59c5476628bcec794426171aaf9c8e584c` | 2026-07-18 14:23:20–14:28:50 |   34 | 5m 30s     | 34m 58s            |
| [#747](https://github.com/RoryGlenn/commitment-issues/actions/runs/29648479882) | `63e74a9c10f53e5f049b1eb2bf2e00a521bf05e3` | 2026-07-18 14:40:17–14:45:31 |   34 | 5m 14s     | 35m 19s            |
| [#748](https://github.com/RoryGlenn/commitment-issues/actions/runs/29649185856) | `ffb822466435dc3a3d7cdf554b9a758e5352ed1e` | 2026-07-18 15:02:01–15:07:44 |   34 | 5m 43s     | 36m 38s            |

| Metric             | Ordered observations      | p50     | p95     |
| ------------------ | ------------------------- | ------- | ------- |
| Wall clock         | 5m 14s, 5m 30s, 5m 43s    | 5m 30s  | 5m 43s  |
| Summed runner time | 34m 58s, 35m 19s, 36m 38s | 35m 19s | 36m 38s |

### Slow-job evidence

The two Windows test jobs were the longest jobs in every baseline run. The
Node 22.11.0 Windows job was the critical path each time.

| Job                    | #746   | #747   | #748   | p50    |
| ---------------------- | ------ | ------ | ------ | ------ |
| Windows / Node 22.11.0 | 5m 21s | 4m 59s | 5m 34s | 5m 21s |
| Windows / Node 24      | 5m 03s | 4m 50s | 4m 54s | 4m 54s |
| Ubuntu / Node 22.11.0  | 3m 22s | 3m 05s | 3m 20s | 3m 20s |
| Ubuntu / Node 24       | 2m 29s | 2m 25s | 2m 28s | 2m 28s |
| macOS / Node 22.11.0   | 1m 49s | 2m 44s | 2m 27s | 2m 27s |

These observations identify the current critical path. They do not by
themselves attribute the time to an individual step or justify removing any
command, assertion, platform, Node version, or package lifecycle.

## Documentation-only reference

[PR #241](https://github.com/RoryGlenn/commitment-issues/pull/241) changed only
`ADOPTION.md` and `promo/launch.md`. Its successful
[CI run #739](https://github.com/RoryGlenn/commitment-issues/actions/runs/29645269549)
ran from 2026-07-18 12:57:42 UTC through 13:04:21 UTC:

| Head commit                                | Jobs | Wall clock | Summed runner time |
| ------------------------------------------ | ---: | ---------- | ------------------ |
| `48da4a8c88bb4a2b97f8dc8df7cbb49eeb6da223` |   34 | 6m 39s     | 33m 52s            |

This is a reference point, not a percentile cohort. It confirms that the
current workflow instantiates the full compatibility graph for a pure
documentation change and does not yet meet the documentation-only target.

## Targets and non-negotiable evidence

Issue #204 defines these outcome targets:

| Change class or metric      | Target                                              |
| --------------------------- | --------------------------------------------------- |
| Ordinary code-PR wall clock | Approximately 3–3.5 minutes                         |
| Combined runner time        | Approximately 15–18 minutes where safely achievable |
| Pure documentation PR       | Under one minute                                    |

The targets do not authorize weaker evidence. The 100% line, branch, and
function coverage gates, coverage-badge freshness, supported OS/Node/package-
manager evidence, applicable lifecycle checks, and fail-closed `CI Success`
behavior remain required. Unknown or failed classification must run the full
graph.

## After-optimization evidence

Do not replace the baseline above. Fill in the tables below after the candidate
architecture has passed its routing, compatibility, coverage, and flake checks.
Use successful first attempts where possible; record reruns separately. The
three primary after runs must use the same change class and intended job graph
as one another, and the comparison must explain any difference from the before
cohort.

| After sample | Change class               | CI run | Head commit | Jobs | Wall clock | Summed runner time | Notes |
| -----------: | -------------------------- | ------ | ----------- | ---: | ---------- | ------------------ | ----- |
|            1 | Comparable code/full graph | TBD    | TBD         |  TBD | TBD        | TBD                | TBD   |
|            2 | Comparable code/full graph | TBD    | TBD         |  TBD | TBD        | TBD                | TBD   |
|            3 | Comparable code/full graph | TBD    | TBD         |  TBD | TBD        | TBD                | TBD   |

| Metric             | Before p50 | Before p95 | After p50 | After p95 | Target    | Result |
| ------------------ | ---------- | ---------- | --------- | --------- | --------- | ------ |
| Wall clock         | 5m 30s     | 5m 43s     | TBD       | TBD       | 3–3.5 min | TBD    |
| Summed runner time | 35m 19s    | 36m 38s    | TBD       | TBD       | 15–18 min | TBD    |

Record documentation-only routing separately because run #739 is only one
before reference and is not part of the three-run full-graph cohort:

| Documentation sample | CI run | Head commit | Classifier result | Jobs | Wall clock | Applicable checks retained |
| -------------------: | ------ | ----------- | ----------------- | ---: | ---------- | -------------------------- |
|                    1 | TBD    | TBD         | TBD               |  TBD | TBD        | TBD                        |
|                    2 | TBD    | TBD         | TBD               |  TBD | TBD        | TBD                        |
|                    3 | TBD    | TBD         | TBD               |  TBD | TBD        | TBD                        |

The final issue evidence should also link the routing runs for runtime,
package-manager, workflow, rename/deletion, unknown-classification, and fork
pull requests. A faster happy path is insufficient if any of those paths can
silently omit applicable evidence.
