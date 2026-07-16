# Hook performance and scaling

This repository keeps hook performance measurable without turning wall-clock
timings into flaky pull-request checks. The ordinary test suite runs the
`smoke` tier for behavior only. Maintainers run the larger tiers explicitly
when hook discovery, Git queries, tool invocation, or path transport changes.

## Reproduce the benchmark

Install the locked dependencies, then run:

```bash
npm ci
npm run benchmark:hooks -- --tier smoke
npm run benchmark:hooks -- --tier large --enforce-budgets
npm run benchmark:hooks -- --tier argv-pressure --enforce-budgets
```

Use `--json` for machine-readable stdout or `--output <path>` to retain a JSON
report. `--keep` preserves the disposable repository and prints its path for
manual inspection. Without `--keep`, the fixture is removed and its temporary
path is not exposed in the report.

The tiers are deliberately bounded:

| Tier            | Source/test pairs | Staged paths | What runs                                                                  |
| --------------- | ----------------- | ------------ | -------------------------------------------------------------------------- |
| `smoke`         | 4                 | 9            | Test discovery plus real pre-commit and pre-push hooks                     |
| `large`         | 250               | 501          | Test discovery plus real ESLint, Prettier, Node tests, and both hook paths |
| `argv-pressure` | 1,000             | 2,001        | Discovery and conservative Windows command-line accounting only            |

Every generated path contains spaces, non-ASCII text, shell metacharacters,
and a long segment. The full-hook tiers use a real Git index and pushed diff;
the source/test pairs make every staged source discover one test.

## Budgets

These budgets catch order-of-magnitude regressions on a comparable maintainer
machine. They are not end-user latency guarantees and are not enforced by
normal pull-request CI.

| Tier            | Discovery | Pre-commit | Pre-push | Peak process-tree RSS | Fixture disk |
| --------------- | --------- | ---------- | -------- | --------------------- | ------------ |
| `smoke`         | 250 ms    | 15 s       | 15 s     | 512 MiB               | 32 MiB       |
| `large`         | 1 s       | 60 s       | 60 s     | 1,024 MiB             | 128 MiB      |
| `argv-pressure` | 5 s       | not run    | not run  | not measured          | 512 MiB      |

Run `--enforce-budgets` only on a controlled host. The report always records
the machine, individual discovery samples, elapsed hook time, sampled process
tree RSS where the platform exposes it, output byte counts, fixture size, and
whether each applicable budget passed.

## Measured baseline

The initial baseline was recorded on 2026-07-15 using Node 26.4.0, Git 2.55.0,
and a 10-logical-core Apple M1 Pro with 16 GiB RAM on macOS arm64.

| Tier            | Discovery median | Pre-commit | Pre-push | Peak RSS     | Fixture disk | Result |
| --------------- | ---------------- | ---------- | -------- | ------------ | ------------ | ------ |
| `large`         | 12.037 ms        | 2.599 s    | 1.929 s  | 711.625 MiB  | 0.789 MiB    | passed |
| `argv-pressure` | 55.755 ms        | not run    | not run  | not measured | 0.886 MiB    | passed |

The large pre-commit result was 361,309 bytes and the pre-push result was
145,430 bytes. That run exposed and now regression-tests a short-write defect:
a pipe could accept only the first part of a JSON result before the hook's
immediate exit. JSON output now retries partial and temporarily blocked writes
until the complete UTF-8 payload is delivered.

Treat these numbers as a reproducible reference point, not a comparison across
unlike machines. Refresh the dated table when a deliberate scaling change is
accepted; preserve the command, tier, host details, and before/after reports in
the pull request.

## Current path-count boundary

The hooks currently pass path lists directly as child-process arguments. There
is no universal safe file count because the limit depends on every path's
length, quoting, executable path, configured test command, operating system,
and launcher.

The benchmark therefore reports a conservative UTF-16 command-line estimate
against a 30,000-unit Windows direct-process budget and a 7,500-unit `cmd.exe`
budget. For the `large` tier's 135–140-unit hostile paths, the direct-process
prefix was approximately:

| Invocation             | Items within 30,000 units | Items within 7,500 units | Full 250-pair tier |
| ---------------------- | ------------------------- | ------------------------ | ------------------ |
| `git ls-files --stage` | 108                       | 27                       | batching required  |
| ESLint                 | 106                       | 25                       | batching required  |
| Prettier               | 107                       | 26                       | batching required  |
| Configured Node tests  | 105                       | 26                       | batching required  |

At the `argv-pressure` tier's 167–172-unit paths, the direct-process prefixes
fall to 86–88 items and the `cmd.exe` prefixes to 20–22. These are conservative
fixture-specific planning values, not advertised product maxima.

Accordingly, the full large tier is measured as correct on the recorded POSIX
host, while Windows correctness is supported only when the complete command
fits its launcher limit. The follow-up is tracked in
[#212](https://github.com/RoryGlenn/commitment-issues/issues/212): it must use
bounded batches for ESLint, Prettier, and configured tests, plus bounded Git
pathspec transport, while preserving aggregate findings, exit behavior,
NUL-safe path handling, timeouts, and test-selection semantics.

## Regression policy

- Keep ordinary CI deterministic: assert fixture shape, hook success, cleanup,
  and report structure, but never elapsed milliseconds.
- Run `large` before merging a change that affects hook traversal, discovery,
  process execution, JSON volume, or tool argv construction.
- Run `argv-pressure` when changing path quoting, Windows launch behavior, or
  batching logic.
- Investigate a budget failure before raising a threshold. Record whether the
  cause is product code, dependency behavior, or a materially different host.
- Do not infer cross-platform support from a POSIX timing run; use the command
  pressure report and dedicated platform evidence together.
