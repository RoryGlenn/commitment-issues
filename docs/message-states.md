# Message States

`commitment-issues` uses compact terminal boxes to keep Git hook output readable. The README shows the main user journey; this page catalogs the states a user may see, grouped by the command that produces them. Every example is a rendered SVG of real box output.

## Pre-commit

### All checks passed

<p>
  <img src="../assets/precommit-all-passed.svg" alt="Success output showing that all pre-commit checks passed" width="511">
</p>

Shown when the pre-commit hook finds no advisory issues.

### Suggestions found

<p>
  <img src="../assets/precommit-suggestions-warning.svg" alt="Warning output showing formatting suggestions and the commit fix command" width="479">
</p>

Shown when commit-time checks find advisory issues such as formatting drift, lint issues, or missing tests. The commit still continues, and `npm run commit:fix` is offered when amending the latest commit is safe.

### Missing tests

<p>
  <img src="../assets/missing-tests-warning.svg" alt="Warning output showing that a staged source file is missing unit tests" width="554">
</p>

Shown when a staged source file has no nearby matching test and is not exempt.

### Manual lint issue

<p>
  <img src="../assets/manual-lint-warning.svg" alt="Warning output showing an ESLint issue that needs manual fixes" width="554">
</p>

Shown when ESLint reports issues that cannot be fixed automatically.

### Tool timeout

<p>
  <img src="../assets/tool-limit-warning.svg" alt="Warning output showing that a tool exceeded the configured time limit" width="469">
</p>

Shown when a spawned tool exceeds the configured timeout.

### No staged files

<p>
  <img src="../assets/no-staged-files.svg" alt="Info output showing that no staged files were found" width="585">
</p>

Shown when the pre-commit hook runs with no staged files.

### Deletion-only commit

<p>
  <img src="../assets/deletion-only-commit.svg" alt="Info output showing that only deleted files are staged" width="734">
</p>

Shown when only deleted files are staged.

### No lintable or formattable files

<p>
  <img src="../assets/no-lintable-files.svg" alt="Info output showing that no lintable or formattable files are staged" width="617">
</p>

Shown when staged files are outside the JavaScript, TypeScript, and formatted-file patterns.

### No project files

<p>
  <img src="../assets/no-project-files.svg" alt="Info output showing that only dependency files are staged" width="543">
</p>

Shown when accidentally staged dependency files are ignored and no project files remain to check.

## Commit fix and staged fixes

### Latest commit amended

<p>
  <img src="../assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="590">
</p>

Shown after `npm run commit:fix` safely applies automatic fixes and amends the latest clean, unpushed commit.

### Staged fixes applied

<p>
  <img src="../assets/fix-staged-success.svg" alt="Success output showing staged fixes were applied and the index refreshed" width="522">
</p>

Shown when `npm run fix:staged` applies automatic fixes and refreshes the staged index.

### Partially staged safety refusal

<p>
  <img src="../assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="568">
</p>

Shown when `npm run fix:staged` finds a file that has both staged and unstaged changes; resolve them before retrying.

## Pre-push

### Tests passed

<p>
  <img src="../assets/prepush-success.svg" alt="Success output showing all pushed-file tests passed and push was allowed" width="310">
</p>

Shown when push-time tests are enabled and the associated pushed-file tests pass.

### No tests to run

<p>
  <img src="../assets/prepush-no-tests.svg" alt="Info output showing that no pushed files have associated tests" width="755">
</p>

Shown when a push mode is enabled but none of the pushed files have associated tests.

### Checks disabled

<p>
  <img src="../assets/prepush-disabled.svg" alt="Info output showing that no pre-push test mode is enabled" width="786">
</p>

Shown when the pre-push hook is run by hand and no push-test mode is configured.

### Advisory push failure

<p>
  <img src="../assets/advisory-push-failure.svg" alt="Warning output showing failing push-time tests in advisory mode" width="713">
</p>

Shown when `advisePushTests` is enabled and pushed-file tests fail; the push is still allowed.

### Blocking push failure

<p>
  <img src="../assets/blocking-push-failure.svg" alt="Error output showing failing push-time tests in blocking mode" width="596">
</p>

Shown when `blockPushOnTestFailure` is enabled and pushed-file tests fail; the push is blocked.

### Could not inspect pushed files (advisory)

<p>
  <img src="../assets/prepush-advisory-uninspectable.svg" alt="Warning output showing that the pushed-file diff could not be computed in advisory mode" width="776">
</p>

Shown when Git cannot list the pushed files in advisory mode; a warning prints and the push is allowed.

### Push blocked: could not inspect pushed files

<p>
  <img src="../assets/prepush-blocked-uninspectable.svg" alt="Error output showing that the pushed-file diff could not be computed in blocking mode" width="776">
</p>

Shown when Git cannot list the pushed files in blocking mode; the gate fails closed rather than skipping the check.

## Doctor

### Already healthy

<p>
  <img src="../assets/doctor-healthy.svg" alt="Success output showing that doctor found Git hook wiring already healthy" width="617">
</p>

Shown when `doctor` finds the hook wiring already correct.

### Repaired hooks

<p>
  <img src="../assets/doctor-repaired-hooks.svg" alt="Warning output showing that doctor repaired Git hook wiring" width="617">
</p>

Shown when `doctor` repairs missing or broken Husky wiring.

### Hook not wired

<p>
  <img src="../assets/doctor-hook-not-wired.svg" alt="Warning output showing that a custom Git hook does not invoke commitment-issues" width="766">
</p>

Shown when a custom hook exists but never invokes `commitment-issues`; `doctor` reports it and leaves the hook untouched.

## Adding more examples

Add an SVG for each documented message state so the gallery stays visually consistent. Keep the README focused on the core user journey and use this page for the complete state catalog.
