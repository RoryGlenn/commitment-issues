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

## Shipped

Implemented as advisory commit/push guards (see [configuration](configuration.md#commit-and-push-guards)):

- **Branch awareness** — `protectedBranches` + `blockProtectedBranches` (pre-commit and pre-push).
- **Huge commit warning** — `maxCommitFiles` / `maxCommitLines`.
- **Large file warning** — `maxFileSizeMb`.
- **Generated files warning** — `generatedPaths`.
- **Forgot to pull warning** — `adviseBehindUpstream`.
- **No matching tests warning** — shipped earlier as `requireTests` + `testExempt`.

## Recommended next features

### 1. Secrets staged check

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

### 2. Mixed concern detection

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

### 3. Debug junk check

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

## Multi-language support strategy (future planning)

If `commitment-issues` expands beyond JavaScript and TypeScript (for example Python, Java, and C#), there are several ways to structure the project.

### Approach comparison

| Approach                                            | How it works                                                                                            | Pros                                                                                                                                | Cons                                                                             | Fit for this project                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| Single repo, single npm package + language adapters | Keep one Node-based core and add language adapters (Python, Java, C#) that call each ecosystem's tools. | Lowest maintenance overhead, one release flow, one governance model, maximum code reuse (hooks, reporting, config, message system). | Pure non-Node teams may see install/runtime friction.                            | Best near-term fit.                                |
| Single repo, monorepo with per-ecosystem wrappers   | Keep a shared core repo, but publish wrappers to PyPI, Maven, NuGet, and npm.                           | Native install experience for each ecosystem, shared source of truth.                                                               | More release and CI complexity, more registry/auth/publishing overhead.          | Good later-phase option if demand proves strong.   |
| Multiple repos with native rewrites                 | Separate language-native implementations in separate repos.                                             | Idiomatic per ecosystem, no cross-runtime dependency concerns.                                                                      | Duplicated logic, high drift risk, multiplied governance and maintenance burden. | Poor fit for current team size and architecture.   |
| Config-only generic command runner                  | Do not ship language adapters; users define commands per project.                                       | Very flexible and fast to ship.                                                                                                     | Weak out-of-box experience, more user setup, less opinionated value.             | Useful as an escape hatch, not a primary strategy. |

### Recommended direction

Recommended path: start with a single repo and a single npm package, then add language adapters incrementally.

Why this is likely best for `commitment-issues`:

- The project already acts as an orchestrator around Git hooks and external tools.
- Existing architecture, tests, and governance are optimized for one codebase.
- It preserves the advisory-first design while adding language-specific checks.
- It keeps complexity proportional while validating demand.

If adoption from pure non-Node teams grows later, revisit a second phase with thin ecosystem-specific wrappers from the same repo.

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
