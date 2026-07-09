# Commitment Issues Feature Ideas

This document is a parking lot for potential `commitment-issues` features.

These are not committed roadmap items yet. The goal is to keep the ideas visible so we can review them later, decide what is worth building, and turn the best ones into issues or implementation plans.

## Guiding principle

`commitment-issues` should help developers catch risky Git actions before they become annoying, embarrassing, or hard to undo.

The best features should be:

- Useful before they are funny
- Clear about what is wrong
- Easy to bypass when appropriate
- Configurable by project
- Helpful to beginners without annoying experienced users

## Recommended next features

### 1. Branch awareness

Warn or block risky actions on protected branches.

Examples:

- Committing directly to `main`
- Pushing from or to `main`
- Pulling on the wrong branch
- Merging or rebasing while on a protected branch

Default protected branches could include:

- `main`
- `master`
- `release/*`
- `production`

Example output:

```text
⚠ Commitment Issues detected.

You're trying to commit directly to main.

That's usually how "just one quick fix" becomes a production incident.

Create a branch instead:
  git switch -c my-change
```

Suggested MVP:

- Support `pre-commit`
- Support `pre-push`
- Default to warning on `main` and `master`
- Allow `block` mode through config

### 2. Secrets staged check

Scan staged files for likely secrets before commit.

Examples:

- API keys
- Tokens
- Private keys
- `.env` files
- Cloud credentials
- Password-looking assignments

Example output:

```text
❌ Commit blocked

Possible secret found:
  src/config.ts

This looks like a token or credential.
Remove it before committing.
```

This is likely one of the highest-value features because it prevents real security incidents.

### 3. Huge commit warning

Warn when a commit is unusually large.

Possible signals:

- Too many files changed
- Too many lines changed
- Too many unrelated directories touched

Example output:

```text
⚠ This commit changes 47 files.

That is less of a commit and more of a lifestyle choice.
Consider splitting it into smaller commits.
```

### 4. Mixed concern detection

Warn when a commit appears to combine unrelated changes.

Examples:

- Source code and docs
- Dependency changes and feature work
- CI changes and app code
- Formatting changes and logic changes
- Tests unrelated to changed source files

Example output:

```text
⚠ This commit appears to mix multiple concerns.

Detected areas:
- application code
- documentation
- GitHub Actions
- package lockfile

Consider splitting this into separate commits.
```

### 5. Debug junk check

Warn when staged code contains temporary debugging artifacts.

Examples:

- `console.log`
- `debugger`
- `print(...)`
- `pdb.set_trace()`
- `binding.pry`
- `TODO remove`
- `FIXME temporary`

Example output:

```text
⚠ Debug junk detected

Found console.log in:
  src/app.ts

Remove it or commit intentionally.
```

## Additional practical ideas

### Forgot to pull warning

Before committing or pushing, warn if the current branch is behind its upstream branch.

Example output:

```text
⚠ Your branch is 7 commits behind origin/main.

Pull or rebase before stacking more chaos?
```

Possible modes:

- `off`
- `warn`
- `block`

### Generated files warning

Warn when generated or usually-ignored files are staged.

Examples:

- `dist/`
- `build/`
- `coverage/`
- `.DS_Store`
- `__pycache__/`
- `node_modules/`

Example output:

```text
⚠ Generated files appear to be staged.

These files are usually not committed:
- coverage/index.html
- dist/bundle.js
```

### Large file warning

Warn before committing unusually large files.

Example output:

```text
⚠ Large staged file detected

42 MB: demo.mov

Did you mean to use Git LFS?
```

### Dependency risk warning

Warn when dependency files change.

Examples:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `requirements.txt`
- `poetry.lock`
- `Cargo.lock`
- `go.mod`
- `go.sum`

Example output:

```text
⚠ Dependency files changed.

Review carefully before committing:
- package.json
- package-lock.json
```

### No matching tests warning

Warn when source files changed but no matching tests changed.

Example output:

```text
⚠ Source changed without nearby tests.

Changed source:
- src/parser.ts

No related test file was staged.
```

This should probably be configurable because not every change requires tests.

### PR readiness check

Add a command that checks whether a branch looks ready to open as a PR.

Possible command:

```bash
npx commitment-issues pr-check
```

Possible checks:

- Branch is not `main`
- Tests changed when source changed
- README changed when CLI behavior changed
- Package version changed only when appropriate
- Lockfile changes are intentional
- No debug junk
- No secrets
- Commit size is reasonable

## Out-of-the-box ideas

### Relationship status

Show a quick summary of repo risk.

Example output:

```text
Relationship status: complicated

Reasons:
- 12 unstaged files
- branch is behind remote
- staged changes touch 38 files
- current branch is main
```

Possible command:

```bash
npx commitment-issues status
```

### Red flag detector

Aggregate all risky signals into one report.

Example output:

```text
🚩 Red flags:
- committing to main
- package-lock.json changed
- 38 files staged
- console.log found
```

This could be the shared reporting model used by all checks.

### Commit prenup

Before a major commit, summarize what the developer is about to commit.

Example output:

```text
Commit prenup

This commit changes:
- 12 source files
- 4 test files
- 1 lockfile

Proceed? [y/N]
```

### Therapy mode

An intentionally funny confirmation mode for risky commits.

Example output:

```text
Before we commit, what are we actually committing to?

Staged summary:
- 8 source files
- 0 tests
- 1 lockfile

Proceed? [y/N]
```

### Panic button

Add a command for users who think they messed up Git.

Possible command:

```bash
npx commitment-issues panic
```

Example output:

```text
Git panic menu

Start here:
  git status

Unstage everything:
  git restore --staged .

Go back to the previous branch:
  git switch -

Find recent history:
  git reflog
```

This could be very beginner-friendly and highly shareable.

### Public shame mode

Optional roast-style output for users who want the funny version.

Example output:

```text
You are committing directly to main with console.log included.
Bold strategy.
```

This must be opt-in so the default tool stays professional enough for team use.

### AI commit message helper

Generate a commit message from staged changes.

Possible command:

```bash
npx commitment-issues suggest-message
```

Potential modes:

- Local-only mode
- User-provided API key mode
- Template-only non-AI mode

This should probably come later because it adds complexity and may overlap with many existing tools.

## Handling multiple issues at once

When multiple checks fail, the tool should not spam separate prompts.

Instead, each check should return structured issues. The CLI should aggregate them into one report and make one final decision.

Suggested severity model:

```ts
type IssueSeverity = "info" | "warn" | "block";

type Issue = {
  id: string;
  severity: IssueSeverity;
  title: string;
  message: string;
  file?: string;
  suggestion?: string;
};
```

Decision rule:

```text
block > warn > info
```

If any issue is a blocker, the whole action fails.

Example combined report:

```text
❌ Commit blocked

Blocking issue:
- You are committing directly to main

Warnings:
- 47 files changed
- package-lock.json changed
- console.log found

Fix the blocking issue first.
```

Example warning-only report:

```text
🚩 Commitment Issues found 4 red flags

1. Protected branch
   You are on: main

2. Huge commit
   47 files changed

3. Debug junk
   Found console.log in src/app.ts

4. Mixed concerns
   Code, docs, and CI files are staged together

Recommendation:
Split this commit before continuing.

Proceed anyway? [y/N]
```

This gives the project a clean internal model:

```text
many checks → one report → one final decision
```

## Possible configuration shape

```json
{
  "branchAwareness": {
    "enabled": true,
    "mode": "warn",
    "protectedBranches": ["main", "master", "release/*", "production"],
    "actions": ["commit", "push"]
  },
  "secrets": {
    "enabled": true,
    "mode": "block"
  },
  "hugeCommit": {
    "enabled": true,
    "mode": "warn",
    "maxFiles": 25,
    "maxLines": 500
  },
  "debugJunk": {
    "enabled": true,
    "mode": "warn"
  },
  "generatedFiles": {
    "enabled": true,
    "mode": "warn"
  }
}
```

## Suggested review process

When reviewing this list later, sort each idea into one of these buckets:

- Build now
- Create GitHub issue
- Needs design
- Funny but later
- Not worth it

Suggested first implementation order:

1. Branch awareness
2. Secrets staged check
3. Huge commit warning
4. Debug junk check
5. Issue aggregation/reporting model
6. PR readiness check
