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

```text
info

No staged files to check.

Stage changes with git add before committing.
```

Shown when the pre-commit hook runs with no staged files.

### Deletion-only commit

```text
info

Deletion-only commit — nothing to check.

Removing files needs no lint, format, or tests. Looks good!
```

Shown when only deleted files are staged.

### No lintable or formattable files

```text
info

No lintable or formattable files staged.

N staged files will be committed without checks.
```

Shown when staged files are outside the JavaScript, TypeScript, and formatted-file patterns.

### Missing tests

```text
warning

Pre-commit suggestions found

Commit will continue. Suggestions:

→ 1 staged source file missing unit tests
  src/example.js

No automatic fix command for these issues.
```

Shown when a staged source file has no nearby matching test and is not exempt.

### Manual lint issue

```text
warning

Pre-commit suggestions found

Commit will continue. Suggestions:

→ 1 ESLint issue needing manual fixes
  src/example.js:1:7 (no-undef)

No automatic fix command for these issues.
```

Shown when ESLint reports issues that cannot be fixed automatically.

### Tool timeout

```text
warning

Pre-commit suggestions found

Commit will continue. Suggestions:

→ ESLint timed out
  No result within 120s
```

Shown when a spawned tool exceeds the configured timeout.

### Advisory push failure

```text
warning

Tests failed (advisory)

N passed, M failed

Push allowed, but the failing tests above need attention.
```

Shown when `advisePushTests` is enabled and pushed-file tests fail.

### Blocking push failure

```text
error

Push blocked: tests failed

N passed, M failed

Fix the failing tests above, then push again.
```

Shown when `blockPushOnTestFailure` is enabled and pushed-file tests fail.

### Doctor repaired hooks

```text
success

Git hooks are healthy.

Repaired the git hook wiring.
```

Shown when `doctor` repairs missing or broken Husky wiring.

### Doctor already healthy

```text
success

Git hooks are healthy.

Already configured — nothing to change.
```

Shown when `doctor` finds the hook wiring already correct.

## Adding more examples

Add a new SVG only when the state is useful to explain visually in the README or docs. Otherwise, prefer a short text example here so the README stays focused on the core user journey.
