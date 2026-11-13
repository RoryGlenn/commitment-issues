# js-yaml v5 compatibility

## Evidence and approach

The public npm registry provides js-yaml 5.2.2. The existing `^5.2.2` range
currently resolves to 5.5.0. A Node 22.11.0 `npm ci --dry-run --ignore-scripts`
reproduces the manifest/lockfile mismatch before changes.

Upstream's v5 migration guide replaces default imports with named or namespace
imports, `Type` with `defineScalarTag`, and `Schema.extend` with `withTags`.
Migrate the custom PyYAML scalar fallback using the supported tag API while
retaining the YAML 1.2 built-ins and the existing non-string grammar. Quoted and
block scalar values must remain strings. Unsupported YAML and duplicate mapping
keys must continue to require manual inspection.

Independent review and verification found that v5 rejects impossible timestamps
in its built-in resolver and then treats them as strings. Remove two unintended
spaces in the custom full-timestamp pattern so the fallback still recognizes
those PyYAML non-string values. Exercise invalid calendar dates and times in
plain, quoted, and block forms.

Regenerate the npm lockfile without updating unrelated dependencies. Preserve
the original dependency range and allow npm to retain ESLint's separate v4
dependency where its declared range requires it.

## Validation

- Reproduce the pre-change installation failure and v5 runtime import failure.
- Run focused hook-inspection and YAML-form tests, including plain and quoted
  PyYAML-sensitive scalars.
- Run `npm ci`, lint, formatting, and the complete test suite.
- Run the 100% runtime coverage gates on Node 22.11.0 and Node 24.
- Run the npm packed lifecycle and native POSIX shell lifecycle to exercise
  install, init, hooks, doctor, and uninstall.
- Inspect the final diff and OpenSpec validation results before handoff.

## Results

These results apply to the candidate based on the published PR head
`b38ce3df44e32c8a37f8f8f9b6ef7626002155e1`.

- Node 22.11.0 passed a fresh locked install, lint, formatting, all 1,423 tests,
  and 100% line, branch, and function runtime coverage.
- Node 24.18.0 passed the coverage and badge-freshness gate at 100%, all 12
  packed npm lifecycle checks, and the native POSIX `sh` packed lifecycle.
- The focused hook and YAML-form suite passed all 101 tests. Its scalar table
  checks 18 values in plain, quoted, and block forms.
- The exact package contains 61 files and stays within the existing 879 KiB
  unpacked-size budget. Required compatibility checks on other operating systems
  and package managers remain with hosted CI.

## Current main integration

Remote main advanced to `9b1e1c79c3d560929ea914e858d4fe06201867c9` before delivery.
It contains the v4.0.0 preparation, a repository-only Go prototype, pre-push
timeout changes, and a compatible dependency refresh. A read-only merge-tree
check reports one conflict in the published PR, in `package.json`.

The validated candidate was committed as
`1368f8e6a2aa0306b1665ab03481edc838403321`. A `--no-commit` merge of main is
prepared. The manifest, lockfile, and changelog conflicts were resolved by keeping
main's v4.0.0 baseline, selecting the existing `^5.2.2` YAML range, regenerating
the lockfile, and retaining the new entry above the v4.0.0 section. The YAML
runtime and test files are identical between the old base and current main, so
the migration transfers directly. The combined package required a shorter
explanation in the touched scalar comment to fit the existing size budget.
The merged source was validated before handoff.

## Merged source results

- Node 22.11.0 passed a fresh locked install, lint, formatting, the 133 focused
  hook, YAML-form, and metadata tests, all 1,430 tests, and 100% runtime coverage.
- Node 24.18.0 passed all 1,430 tests under the 100% coverage and badge-freshness
  gate, all 12 packed npm lifecycle checks, and the POSIX `sh` packed lifecycle.
- The final delta against current main contains the 11 intended dependency,
  runtime, regression-test, changelog, and OpenSpec files. Every other main path
  has identical content.

## Delivery boundary

The writer leaves a focused uncommitted diff. The coordinator owns independent
review, verification, commit, push, and the existing PR response. Hosted operating
system and package-manager compatibility remain subject to the PR's CI matrix.

The original published Snyk commit
`b38ce3df44e32c8a37f8f8f9b6ef7626002155e1` lacks a DCO sign-off. The current
hosted DCO check requires a sign-off on every PR commit, creating a historical
delivery blocker for the coordinator to address.
