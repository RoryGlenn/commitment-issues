# Message States

`commitment-issues` uses compact terminal boxes to keep Git hook output readable. The README shows the main user journey; this page catalogs the common states a user may see.

## Pre-commit suggestions

Shown when commit-time checks find advisory issues such as formatting drift, lint issues, or missing tests.

<p>
  <img src="../assets/precommit-suggestions-warning.svg" alt="Pre-commit warning output showing formatting suggestions and the commit fix command" width="476">
</p>

Typical meaning:

- the commit can continue
- at least one issue was found
- automatic fixes may be available
- the tool may suggest `npm run commit:fix` when amending the latest commit is safe

## Latest commit amended

Shown after `npm run commit:fix` safely applies automatic fixes and amends the latest clean commit.

<p>
  <img src="../assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="555">
</p>

Typical meaning:

- the latest commit was not already pushed
- the tracked working tree was safe to amend
- automatic fixes were applied
- the commit was amended in place

## Partially staged safety refusal

Shown when `npm run fix:staged` finds a file that has both staged and unstaged changes.

<p>
  <img src="../assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="620">
</p>

Typical meaning:

- the command refused to mutate a risky file
- staged and unstaged changes need to be resolved first
- the user should commit, stash, discard, or restage intentionally before retrying

## Pre-push tests passed

Shown when push-time tests are enabled and the associated pushed-file tests pass.

<p>
  <img src="../assets/prepush-success.svg" alt="Success output showing all pushed-file tests passed and push was allowed" width="294">
</p>

Typical meaning:

- pushed files had associated tests
- the configured test command completed successfully
- the push is allowed

## Other common states

### No staged files

<p>
  <img src="../assets/no-staged-files.svg" alt="Info output showing that no staged files were found" width="476">
</p>

Shown when the pre-commit hook runs with no staged files.

### Deletion-only commit

<p>
  <img src="../assets/deletion-only-commit.svg" alt="Info output showing that only deleted files are staged" width="520">
</p>

Shown when only deleted files are staged.

### No lintable or formattable files

<p>
  <img src="../assets/no-lintable-files.svg" alt="Info output showing that no lintable or formattable files are staged" width="500">
</p>

Shown when staged files are outside the JavaScript, TypeScript, and formatted-file patterns.

### No project files

<p>
  <img src="../assets/no-project-files.svg" alt="Info output showing that only dependency files are staged" width="430">
</p>

Shown when accidentally staged dependency files are ignored and no project files remain to check.

### Missing tests

<p>
  <img src="../assets/missing-tests-warning.svg" alt="Warning output showing that a staged source file is missing unit tests" width="476">
</p>

Shown when a staged source file has no nearby matching test and is not exempt.

### Manual lint issue

<p>
  <img src="../assets/manual-lint-warning.svg" alt="Warning output showing an ESLint issue that needs manual fixes" width="476">
</p>

Shown when ESLint reports issues that cannot be fixed automatically.

### Tool timeout

<p>
  <img src="../assets/tool-limit-warning.svg" alt="Warning output showing that a tool exceeded the configured time limit" width="476">
</p>

Shown when a spawned tool exceeds the configured timeout.

### Advisory push failure

<p>
  <img src="../assets/advisory-push-failure.svg" alt="Warning output showing failing push-time tests in advisory mode" width="450">
</p>

Shown when `advisePushTests` is enabled and pushed-file tests fail.

### Blocking push failure

<p>
  <img src="../assets/blocking-push-failure.svg" alt="Error output showing failing push-time tests in blocking mode" width="450">
</p>

Shown when `blockPushOnTestFailure` is enabled and pushed-file tests fail.

### Doctor repaired hooks

<p>
  <img src="../assets/doctor-repaired-hooks.svg" alt="Success output showing that doctor repaired Git hook wiring" width="430">
</p>

Shown when `doctor` repairs missing or broken Husky wiring.

### Doctor already healthy

<p>
  <img src="../assets/doctor-healthy.svg" alt="Success output showing that doctor found Git hook wiring already healthy" width="430">
</p>

Shown when `doctor` finds the hook wiring already correct.

## Adding more examples

Add an SVG for each documented message state so the gallery stays visually consistent. Keep README focused on the core user journey and use this page for the complete state catalog.
