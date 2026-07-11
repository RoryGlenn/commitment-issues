# Branch Coverage Policy

The README badge reports **branch coverage for the user-facing
`commitment-issues` runtime**, not every JavaScript file in the repository.
Run the canonical measurement with:

```bash
npm run test:coverage
```

The command uses Node's built-in test coverage on both supported Node lines and
fails below **90% branch coverage**. It passes every source file explicitly,
writes a temporary LCOV report, and fails if any intended runtime source is
missing from that report. Node also prints line and function coverage for the
same source scope, but the badge and enforced threshold are specifically the
aggregate branch metric.

## Source scope

These files are the complete published percentage denominator:

```text
scripts/cli.mjs
scripts/commit-fix.mjs
scripts/doctor.mjs
scripts/fix-staged-js.mjs
scripts/fix-staged.mjs
scripts/init.mjs
scripts/lib/checks.mjs
scripts/lib/commit-guards.mjs
scripts/lib/config.mjs
scripts/lib/files.mjs
scripts/lib/hooks.mjs
scripts/lib/logo.mjs
scripts/lib/message.mjs
scripts/lib/package-manager.mjs
scripts/lib/process.mjs
scripts/lib/secret-scan.mjs
scripts/lib/ui.mjs
scripts/precommit.mjs
scripts/prepush.mjs
scripts/uninstall.mjs
```

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

They still have unit or integration tests. A static invariant partitions every
`scripts/**/*.mjs` file into exactly one of these two lists, so adding a source
file requires an explicit scope decision.

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

Ubuntu CI enforces the 90% threshold on Node 22.22.1 and Node 24. Node 24 is the
canonical badge producer: `npm run coverage:check` runs the same gated command
and fails if the committed README badge differs from the generated value.

To refresh it locally:

```bash
npm run coverage:badge
```

Badge colors are derived from the percentage: `brightgreen` at 90%+, `green`
at 80%+, `yellowgreen` at 70%+, `yellow` at 60%+, `orange` at 50%+, and `red`
below 50%.
