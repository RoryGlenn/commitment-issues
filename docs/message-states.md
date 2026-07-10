# Message States

`commitment-issues` uses compact terminal boxes to keep Git hook output readable. The README shows the main user journey; this page catalogs the states a user may see, grouped by the command that produces them. Every example is a rendered SVG of real box output.

## Init

### Setup complete

<p>
  <img src="../assets/init-success.svg" alt="Green output with the split-heart logo showing that Commitment Issues is set up" width="737">
</p>

Shown when `init` finishes wiring up hooks, scripts, and gitignore defaults. Lists exactly what was added.

### Dry-run preview

<p>
  <img src="../assets/init-dry-run.svg" alt="Info output previewing the changes init would make without writing files" width="716">
</p>

Shown for `init --dry-run`: the same change list, but nothing is written.

### Already configured

<p>
  <img src="../assets/init-already-configured.svg" alt="Green output showing that everything is already configured and nothing changed" width="737">
</p>

Shown when `init` is re-run and finds nothing to change. Init is safe to re-run at any time.

### No package.json

<p>
  <img src="../assets/no-package-json.svg" alt="Error output showing that no package.json was found" width="438">
</p>

Shown when `init` (or interactive `doctor`) runs outside a project root.

### Invalid package.json

<p>
  <img src="../assets/init-invalid-package-json.svg" alt="Error output showing that package.json is not valid JSON" width="768">
</p>

Shown when package.json cannot be parsed; fix the JSON and run `init` again.

### Hook wiring needs attention

<p>
  <img src="../assets/init-hook-wiring-warning.svg" alt="Warning output printed after the init summary when hook wiring needs manual attention" width="675">
</p>

Shown after the summary when `init` cannot fully wire the hooks by itself: a foreign `core.hooksPath` is configured, user-authored `.husky` hooks are stranded by the husky-era migration, or the directory is not a git repository yet. Each case lists the exact follow-up.

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

### Auto-fixable lint issues

<p>
  <img src="../assets/precommit-autofixable-lint.svg" alt="Warning output showing auto-fixable ESLint issues and the commit fix command" width="479">
</p>

Shown when ESLint finds issues it can fix itself (such as `prefer-const`); `npm run commit:fix` applies them.

### Failing staged tests

<p>
  <img src="../assets/precommit-staged-test-failure.svg" alt="Warning output showing that a staged test file is failing" width="541">
</p>

Shown when `runStagedTests` is enabled and a staged test file fails. The commit still continues.

### Tool timeout

<p>
  <img src="../assets/tool-limit-warning.svg" alt="Warning output showing that a tool exceeded the configured time limit" width="469">
</p>

Shown when a spawned tool exceeds the configured timeout.

### Tool crash

<p>
  <img src="../assets/precommit-tool-crash.svg" alt="Warning output showing that ESLint failed to complete" width="541">
</p>

Shown when ESLint or Prettier exits with a crash (broken config, parse error) instead of reporting issues. A crash is never presented as auto-fixable.

### Tool unavailable

<p>
  <img src="../assets/precommit-tool-unavailable.svg" alt="Warning output showing that ESLint could not be run" width="541">
</p>

Shown when a tool cannot be spawned at all (missing install). The commit still continues.

### Amend blocked by other tracked changes

<p>
  <img src="../assets/precommit-amend-blocked.svg" alt="Warning output explaining that other tracked changes suppress the automatic amend command" width="786">
</p>

Shown when fixable issues exist but other tracked files have unstaged changes, so `npm run commit:fix` is withheld: an amend would not leave a clean worktree.

### Amend withheld: worktree not inspectable

<p>
  <img src="../assets/precommit-amend-uninspectable.svg" alt="Warning output explaining that the working tree could not be inspected for a safe post-commit amend" width="786">
</p>

Shown when Git cannot report whether the worktree is clean; the amend recommendation is withheld rather than offered unverified.

### Fun tone

<p>
  <img src="../assets/precommit-fun-tone.svg" alt="Warning output showing the fun tone wording for pre-commit suggestions" width="582">
</p>

Shown when `precommitChecks.tone` is `"fun"`: every advisory state above keeps its structure but swaps in relationship-themed wording.

### Unknown config key warning

<p>
  <img src="../assets/config-unknown-key-warning.svg" alt="A single yellow console warning saying an unknown precommitChecks key is being ignored" width="646">
</p>

Shown (as a one-line stderr warning, not a box) by the pre-commit and pre-push hooks when `precommitChecks` contains a key the tool does not recognize — usually a typo like `requireTest` that would otherwise silently fall back to the default behavior.

### Invalid config value warning

<p>
  <img src="../assets/config-invalid-value-warning.svg" alt="A single yellow console warning saying an invalid precommitChecks value is being ignored" width="646">
</p>

Shown (as a one-line stderr warning, not a box) by the pre-commit and pre-push hooks when a recognized `precommitChecks` key has an invalid value — for example a string where a boolean is expected, or a non-positive `timeoutMs`. The invalid value is ignored in favor of the default, and the commit or push still proceeds.

### Unable to inspect staged files

<p>
  <img src="../assets/precommit-cannot-inspect-staged.svg" alt="Warning output showing that staged files could not be inspected and the commit continues" width="665">
</p>

Shown when Git cannot list the staged files at all. True to the advisory philosophy, the commit still continues.

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

### Commit guard suggestions

<p>
  <img src="../assets/precommit-commit-guards.svg" alt="Warning output showing protected-branch, behind-upstream, and large-commit advisories" width="603">
</p>

Shown when the advisory commit guards notice something about the commit itself: committing directly to a protected branch, a branch behind its upstream, an unusually large commit, staged files over the size threshold, or staged generated files. The commit still continues; guards join the same consolidated suggestions box as lint and test advisories.

### Commit blocked: protected branch

<p>
  <img src="../assets/precommit-blocked-protected-branch.svg" alt="Error output showing a commit refused on a protected branch" width="706">
</p>

Shown only when `blockProtectedBranches` is enabled and the current branch matches `protectedBranches`. The commit is refused; `git commit --no-verify` bypasses it once.

## Commit fix and staged fixes

### Latest commit amended

<p>
  <img src="../assets/commit-fix-success.svg" alt="Success output showing the latest commit amended with automatic fixes" width="590">
</p>

Shown after `npm run commit:fix` safely applies automatic fixes and amends the latest clean, unpushed commit.

### Latest commit amended with available fixes

<p>
  <img src="../assets/commit-fix-partial.svg" alt="Warning output showing the commit was amended but manual issues remain" width="581">
</p>

Shown when `commit:fix` amends what it can but some issues still need manual attention; it exits non-zero so the remaining work is not missed.

### Latest commit already clean

<p>
  <img src="../assets/commit-fix-already-clean.svg" alt="Success output showing the latest commit needed no automatic fixes" width="510">
</p>

Shown when `commit:fix` checks the latest commit's files and finds nothing to change.

### No automatic fixes landed

<p>
  <img src="../assets/commit-fix-manual-only.svg" alt="Warning output showing that no automatic changes were added to the latest commit" width="786">
</p>

Shown when the fixers ran but produced no changes while issues remain (for example, a file Prettier cannot parse); fix manually, then amend.

### Fixes emptied the commit

<p>
  <img src="../assets/commit-fix-emptied-commit.svg" alt="Warning output explaining that the fixes reverted the commit's only changes" width="716">
</p>

Shown when the automatic fixes reverted the only changes in the latest commit, so amending would create an empty commit; drop it with `git reset --soft HEAD^`.

### Already-pushed refusal

<p>
  <img src="../assets/commit-fix-already-pushed.svg" alt="Error output refusing to amend a commit that has already been pushed" width="786">
</p>

Shown when the latest commit exists on a remote branch. `commit:fix` never rewrites published history.

### Dirty worktree refusal

<p>
  <img src="../assets/commit-fix-dirty-worktree.svg" alt="Error output refusing to amend while tracked changes exist in the worktree" width="603">
</p>

Shown when tracked files have uncommitted changes; commit, stash, or discard them before amending.

### Unpushed status unverifiable

<p>
  <img src="../assets/commit-fix-unverified.svg" alt="Error output refusing to amend because Git could not confirm the commit is unpushed" width="737">
</p>

Shown when Git cannot list remote branches. The command fails closed rather than assume the commit is safe to rewrite.

### No commit to inspect

<p>
  <img src="../assets/commit-fix-no-commit.svg" alt="Error output showing that the latest commit could not be inspected" width="786">
</p>

Shown when the repository has no commit yet (or HEAD cannot be resolved).

### No fixable files in the latest commit

<p>
  <img src="../assets/commit-fix-no-fixable-files.svg" alt="Info output showing that the latest commit has no staged-fixer targets" width="685">
</p>

Shown when the latest commit contains no files the staged fixers handle.

### Fixes could not be staged or amended

<p>
  <img src="../assets/commit-fix-stage-failed.svg" alt="Error output showing fixes ran but the files could not be staged" width="675">
</p>

<p>
  <img src="../assets/commit-fix-amend-failed.svg" alt="Error output showing the staged fixes could not be amended into the commit" width="786">
</p>

Shown when the fixes were produced but `git add` or `git commit --amend` failed; both boxes explain the manual recovery step.

### Git state could not be inspected

<p>
  <img src="../assets/commit-fix-cannot-inspect.svg" alt="Error output showing the current working tree could not be inspected" width="786">
</p>

<p>
  <img src="../assets/commit-fix-cannot-list-files.svg" alt="Error output showing the files from the latest commit could not be listed" width="706">
</p>

<p>
  <img src="../assets/commit-fix-cannot-inspect-fixes.svg" alt="Error output showing the staged fixes could not be inspected" width="691">
</p>

Shown when a Git probe fails partway through `commit:fix` (worktree, commit file list, or staged-fix inspection); the command stops instead of guessing.

### Staged fixes applied

<p>
  <img src="../assets/fix-staged-success.svg" alt="Success output showing staged fixes were applied and the index refreshed" width="522">
</p>

Shown when `npm run fix:staged` applies automatic fixes and refreshes the staged index.

### Staged files already clean

<p>
  <img src="../assets/fix-staged-already-clean.svg" alt="Success output showing the staged files needed no automatic changes" width="696">
</p>

Shown when `fix:staged` runs but the staged files needed no automatic changes.

### Staged fixes need manual attention

<p>
  <img src="../assets/fix-staged-manual.svg" alt="Warning output showing fixes were applied but lint issues remain" width="786">
</p>

Shown when the available fixes were applied but non-fixable lint issues remain; it exits non-zero.

### No staged files to fix

<p>
  <img src="../assets/fix-staged-none.svg" alt="Info output showing there are no staged fixable files" width="786">
</p>

Shown when nothing fixable is staged.

### Partially staged safety refusal

<p>
  <img src="../assets/partially-staged-error.svg" alt="Error output showing that partially staged files cannot be fixed safely" width="568">
</p>

Shown when `npm run fix:staged` finds a file that has both staged and unstaged changes; resolve them before retrying.

### Staged file missing from the working tree

<p>
  <img src="../assets/fix-staged-missing-file.svg" alt="Error output refusing to fix staged files that are missing from the working tree" width="779">
</p>

Shown when a staged file no longer exists on disk (for example, a broken symlink); restore or unstage it first.

### Staged or unstaged files could not be inspected

<p>
  <img src="../assets/fix-staged-cannot-inspect.svg" alt="Error output showing staged files could not be inspected" width="786">
</p>

<p>
  <img src="../assets/fix-staged-cannot-inspect-unstaged.svg" alt="Error output showing unstaged files could not be inspected" width="786">
</p>

Shown when a Git probe fails before fixing starts; `fix:staged` stops rather than risk an unsafe index refresh.

### Fixed files could not be restaged

<p>
  <img src="../assets/fix-staged-restage-failed.svg" alt="Error output showing fixes were applied to the working tree but git add failed" width="696">
</p>

Shown when the fixers ran but the final `git add` failed: the fixes are safe in the working tree, and the command explains how to stage them manually.

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

### Could not run tests (advisory)

<p>
  <img src="../assets/prepush-advisory-could-not-run.svg" alt="Warning output showing the test command could not run and the push was allowed" width="623">
</p>

Shown when `advisePushTests` is enabled but the test command itself fails to run (or times out); the push is allowed.

### Push blocked: could not run tests

<p>
  <img src="../assets/prepush-blocked-could-not-run.svg" alt="Error output showing the push was blocked because the test command could not run" width="623">
</p>

Shown when `blockPushOnTestFailure` is enabled and the test command itself fails to run; the gate fails closed.

### Config conflict warning

<p>
  <img src="../assets/prepush-config-conflict.svg" alt="A single yellow console warning saying both push-test modes are set and blocking wins" width="718">
</p>

Shown (as a one-line stderr warning, not a box) when both `blockPushOnTestFailure` and `advisePushTests` are set; blocking wins.

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

### Pushing to a protected branch

<p>
  <img src="../assets/prepush-protected-branch-advisory.svg" alt="Warning output showing an advisory that the push updates a protected branch directly" width="459">
</p>

Shown when the push updates a branch matching `protectedBranches` and `blockProtectedBranches` is off. The push continues.

### Push blocked: protected branch

<p>
  <img src="../assets/prepush-blocked-protected-branch.svg" alt="Error output showing a push refused to a protected branch" width="675">
</p>

Shown when `blockProtectedBranches` is enabled and the push targets a protected branch. The push is refused; `git push --no-verify` bypasses it once.

### Silent by design

A real `git push` with no push-test mode configured prints nothing at all — the hook stays out of the way. The [Checks disabled](#checks-disabled) box only appears when the hook is run by hand in a terminal.

## Doctor

### Already healthy

<p>
  <img src="../assets/doctor-healthy.svg" alt="Success output showing that doctor found Git hook wiring already healthy" width="603">
</p>

Shown when `doctor` finds the hook wiring already correct.

### Repaired hooks

<p>
  <img src="../assets/doctor-repaired-hooks.svg" alt="Warning output showing that doctor repaired Git hook wiring" width="675">
</p>

Shown when `doctor` recreates missing `.git/hooks` files or retires dead husky-era wiring (a pre-3.0 `core.hooksPath` left behind after the husky package was removed).

### Hook not wired

<p>
  <img src="../assets/doctor-hook-not-wired.svg" alt="Warning output showing that a custom Git hook does not invoke commitment-issues" width="757">
</p>

Shown when a custom hook exists but never invokes `commitment-issues`; `doctor` reports it and leaves the hook untouched.

### Missing peer tools

<p>
  <img src="../assets/doctor-missing-tools.svg" alt="Warning output listing required tools that are not installed" width="726">
</p>

Shown when eslint or prettier cannot be resolved. Advisory only: missing tools never fail an otherwise-healthy repo.

### Foreign core.hooksPath

<p>
  <img src="../assets/doctor-hookspath-foreign.svg" alt="Warning output showing core.hooksPath points at a directory the tool does not manage" width="696">
</p>

Shown when `core.hooksPath` points at a directory this tool does not manage (another hook manager or a custom hooks dir) whose hooks never invoke `commitment-issues`. The configuration is never changed; the box lists the commands to add there (or how to unset it). When those hooks already invoke the tool, doctor reports healthy instead. Husky-era wiring gets the same respect while the husky package is still installed — doctor nudges toward `init` for the migration instead of rewiring automatically.

### Leftover .husky hooks

<p>
  <img src="../assets/doctor-leftover-husky-hooks.svg" alt="Warning output listing user-authored .husky hooks that no longer run" width="716">
</p>

Shown when user-authored hooks are stranded in `.husky/` after the husky-era wiring is retired. Advisory only — the files are never deleted.

### Not a git repository

<p>
  <img src="../assets/doctor-not-git-repo.svg" alt="Error output showing the current directory is not a git repository" width="500">
</p>

Shown when interactive `doctor` runs outside a Git worktree. (`doctor --quiet` exits silently instead, so installs never break.) Running without a package.json shows the same [No package.json](#no-packagejson) box as `init`.

### Repair failed

<p>
  <img src="../assets/doctor-repair-failed.svg" alt="Error output showing the git hook wiring could not be repaired" width="634">
</p>

<p>
  <img src="../assets/doctor-still-broken.svg" alt="Error output showing the hook wiring still looks broken after repair" width="768">
</p>

Shown when a repair step fails (for example, the husky-era `core.hooksPath` cannot be unset or a hook file cannot be written) or the wiring still looks broken afterward; interactive mode exits non-zero, `--quiet` warns in one line and still exits 0.

### Quiet mode one-liners

<p>
  <img src="../assets/doctor-quiet-lines.svg" alt="Plain console lines from doctor --quiet: a missing-tool warning and a repaired notice" width="786">
</p>

`doctor --quiet` (the `prepare` script) never prints boxes: it stays silent when healthy and prints a single line when it repairs something, finds missing tools, spots an unwired hook, or cannot complete a repair. It always exits 0 so an install can never break.

## Adding more examples

Add an SVG for each documented message state so the gallery stays visually consistent. Keep the README focused on the core user journey and use this page for the complete state catalog.
