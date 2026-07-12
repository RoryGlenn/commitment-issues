# Runtime Coverage Policy

The README badge reports **branch coverage for the user-facing
`commitment-issues` runtime**, not every JavaScript file in the repository.
Run the canonical measurement with:

```bash
npm run test:coverage
```

The command uses Node's built-in test coverage on both supported Node lines and
requires **100% line, branch, and function coverage**. It passes every source
file explicitly, writes a temporary LCOV report, and fails if any intended
runtime source is missing from that report. The README badge displays the
aggregate branch metric for the same source and test scope.

## Source scope

Every published `scripts/**/*.mjs` file is included in the public-runtime
denominator automatically unless it appears in the exact maintenance-only list
below. This keeps the scope closed by default: adding a new hook, command, or
runtime helper cannot silently escape the threshold.
These repository/package-maintenance files are deliberately outside the
published runtime percentage:

```text
scripts/ci-lifecycle-smoke.mjs
scripts/lib/coverage-badge.mjs
scripts/lib/lifecycle-managers.mjs
scripts/run-branch-coverage.mjs
scripts/run-lifecycle-test.mjs
scripts/update-readme-coverage-badge.mjs
```

They still have unit or integration tests. A static invariant requires every
exclusion to name an existing script and verifies that every other script is in
the measured denominator. New runtime files are therefore covered by default;
adding a maintenance-only script requires an explicit exclusion.

## Test scope

The percentage is driven by every top-level test matching these non-recursive
patterns:

```text
test/*.test.mjs
test/*.test.js
```

Test files and `test/helpers/**` drive execution but are not source files in the
percentage denominator.

The nested `test/integration/lifecycle-manager.test.mjs` suite is reported as a
separate **package lifecycle integration** pass/fail gate. It installs and runs
an unpacked package copy in a temporary repository; mixing those duplicate,
temporary source paths into the source-tree percentage would make the badge
less reproducible rather than more complete. CI runs the npm lifecycle gate in
the Node/OS matrix and separate pnpm, Yarn, and Bun lifecycle gates.

## CI and badge freshness

Ubuntu CI enforces 100% lines, branches, and functions on Node 22.11.0 and Node 24. Node 24 is the canonical badge producer: `npm run coverage:check` runs the
same gated command and fails if the committed README badge differs from the
generated value.

The badge rounds to one decimal place, while all three CI thresholds evaluate
Node's unrounded coverage result. Rounding therefore never relaxes the 100%
gate.

To refresh it locally:

```bash
npm run coverage:badge
```

Badge colors are derived from the percentage: `brightgreen` at 90%+, `green`
at 80%+, `yellowgreen` at 70%+, `yellow` at 60%+, `orange` at 50%+, and `red`
below 50%.
