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

## Phase-one scheduling observations

[PR #245](https://github.com/RoryGlenn/commitment-issues/pull/245) separated
the Windows test suite from the packed npm lifecycle on both Node lines. The
two jobs run in parallel, but all commands, assertions, environments, and
required-status behavior remain represented.

The pull-request run and resulting `main` push both passed the 36-job graph:

| Event         | CI run                                                                          | Head commit                                | UTC interval                 | Jobs | Wall clock | Summed runner time |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- | ---: | ---------- | ------------------ |
| PR #245       | [#750](https://github.com/RoryGlenn/commitment-issues/actions/runs/29650401160) | `9b26643d6978585bb603e042038e06ff953aab67` | 2026-07-18 15:39:00–15:43:10 |   36 | 4m 10s     | 35m 31s            |
| merged `main` | [#751](https://github.com/RoryGlenn/commitment-issues/actions/runs/29650871447) | `74240e4f667b484607ab1221a2ce87e52e4898b2` | 2026-07-18 15:53:22–15:57:56 |   36 | 4m 34s     | 36m 21s            |

These observations prove that the parallel scheduling works on GitHub-hosted
runners. They are not the three-run after cohort: there are only two samples,
and their graph does not include the phase-two Windows shards below. They do
not establish p50 or p95 after results, reduced runner usage, the ordinary-code
or documentation-only targets, or completion of #204.

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

The phase-two candidate partitions the same Windows top-level test-file set
with Node's native `--test-shard=1/2` and `--test-shard=2/2` on both supported
Node lines. The exact pair must assign every file once, the packed npm lifecycle
remains separate, and the two authoritative Ubuntu coverage runs remain
complete and unsharded.

A local correctness and balance probe used Node 22.11.0 on Ubuntu 24.04.4,
Linux 7.0.0-28-generic x86_64, and an Intel i9-10900K (10 cores/20 logical
CPUs). Three sequential repetitions of each exact command produced:

| Mode      | Files | Tests        | Wall-clock observations | Median |
| --------- | ----: | ------------ | ----------------------- | -----: |
| Shard 1/2 |    27 | 392/392 pass | 17.72s, 17.86s, 22.34s  | 17.86s |
| Shard 2/2 |    26 | 480/480 pass | 7.46s, 8.70s, 7.37s     |  7.46s |
| Unsharded |    53 | 872/872 pass | 19.92s, 19.97s, 20.06s  | 19.97s |

The shard-file union was 53/53 with zero overlap, omissions, or extra files.
The local projected critical path improved 10.6%, while the median summed shard
time increased 33.0%. These Linux timings validate the invocation and expose
the runtime imbalance; they are not substitutes for the hosted Windows
measurements below.

The first hosted candidate observation passed all required jobs. One run does
not establish an after p50, p95, or flake result, so aggregate fields remain
`TBD`.

| After sample | Change class               | CI run                                                                          | Head commit                                | Jobs | Wall clock | Summed runner time | Notes                                                   |
| -----------: | -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ | ---: | ---------- | ------------------ | ------------------------------------------------------- |
|            1 | Comparable code/full graph | [#752](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651328636) | `138c15e170fb7047e0c5d6a419f663e63778534e` |   38 | 3m 37s     | 41m 23s            | First hosted shard candidate; all required jobs passed  |
|            2 | Comparable code/full graph | [#754](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651811092) | `8fd30e41b64645dfd75dde184aad0902589f4831` |   38 | 3m 30s     | 39m 50s            | Second hosted shard candidate; all required jobs passed |
|            3 | Comparable code/full graph | TBD                                                                             | TBD                                        |  TBD | TBD        | TBD                | TBD                                                     |

### Excluded runs and reruns

[Run #753 attempt 1](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651498979/attempts/1)
is excluded from the primary cohort. All four Windows shard jobs passed on the
first attempt, but the unchanged Ubuntu/Node 24 coverage job exited nonzero
after its buffered log ended mid-test without a failed assertion, stale-badge
message, or coverage-threshold diagnostic. The fail-closed `CI Success` job
correctly failed. A
[failed-jobs-only retry](https://github.com/RoryGlenn/commitment-issues/actions/runs/29651498979/attempts/2)
then passed the coverage job and aggregate. Because that retry did not execute
the complete graph, neither attempt is a comparable successful first-attempt
sample.

| Metric             | Before p50 | Before p95 | After p50 | After p95 | Target    | Result |
| ------------------ | ---------- | ---------- | --------- | --------- | --------- | ------ |
| Wall clock         | 5m 30s     | 5m 43s     | TBD       | TBD       | 3–3.5 min | TBD    |
| Summed runner time | 35m 19s    | 36m 38s    | TBD       | TBD       | 15–18 min | TBD    |

Record the shard balance and duplicated setup cost for every candidate sample.
The maximum shard duration measures the Windows critical path; the sum helps
explain the candidate's contribution to combined runner time.

| After sample | Node    | Shard 1 duration | Shard 2 duration | Maximum | Sum    |
| -----------: | ------- | ---------------- | ---------------- | ------- | ------ |
|            1 | 22.11.0 | 2m 40s           | 3m 08s           | 3m 08s  | 5m 48s |
|            1 | 24      | 2m 36s           | 2m 11s           | 2m 36s  | 4m 47s |
|            2 | 22.11.0 | 3m 08s           | 1m 59s           | 3m 08s  | 5m 07s |
|            2 | 24      | 3m 04s           | 2m 09s           | 3m 04s  | 5m 13s |
|            3 | 22.11.0 | TBD              | TBD              | TBD     | TBD    |
|            3 | 24      | TBD              | TBD              | TBD     | TBD    |

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
