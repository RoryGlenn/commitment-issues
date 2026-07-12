# Commitment Issues Feature Ideas

This document is a parking lot for potential `commitment-issues` features.

Most entries are not committed roadmap items. The public direction lives in
the [roadmap](../ROADMAP.md), while accepted proposals use GitHub issues with
explicit acceptance criteria. This file keeps uncommitted ideas visible without
presenting them as shipped behavior or promises.

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
- **Secrets staged check** — `scanSecrets` + `blockOnSecrets` + `secretExempt` (curated high-precision patterns on added lines, plus dotenv files).
- **One-result aggregation** — multiple findings are consolidated into one
  human presentation, with structured precommit/prepush results available
  through the versioned JSON contract.
- **Optional commit-message linting** — bring-your-own project-local commitlint,
  advisory after enablement and blocking only after a second opt-in.

## Post-launch work already tracked

- [#81](https://github.com/RoryGlenn/commitment-issues/issues/81) — configurable
  lint/format adapters, beginning with Biome.
- [#83](https://github.com/RoryGlenn/commitment-issues/issues/83) — cross-shell
  and GUI Git-client compatibility coverage.
- [#84](https://github.com/RoryGlenn/commitment-issues/issues/84) — proposed v4
  standalone Go executable and migration path.
- [#86](https://github.com/RoryGlenn/commitment-issues/issues/86) — configurable
  terminal output styles.

These should not delay the initial public launch. Use adopter feedback to choose
between them rather than treating the issue numbers as a committed sequence.

## Untracked checks to validate with users

### Mixed concern detection

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

### Debug junk check

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

Current hooks already aggregate findings into one presentation. A future
read-only `status` or `red-flags` command would reuse the existing message and
JSON models rather than introduce another reporting system.

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

Any interactive confirmation mode would need to be an explicitly invoked,
opt-in command. It must never appear unexpectedly in the normal commit or push
hooks, where non-interactive and GUI-launched Git operations must remain safe.

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

This is not on the current roadmap. A network-backed mode would conflict with
the project's local-only direction and require an explicit product/security
decision; a deterministic local template would preserve the boundary but may
overlap with many existing tools.

## Existing aggregation and configuration constraints

The CLI already combines multiple findings into at most one human presentation
per invocation. Precommit and prepush also expose a versioned JSON model with
checks, findings, suggestions, diagnostics, overall status, and unchanged exit
behavior. New checks must extend those models rather than adding independent
prompts or boxes.

Configuration currently uses allowlisted keys under `precommitChecks` or at the
top level of `.commitmentrc.json`. Any accepted idea needs an explicit key,
validation, default, documentation, JSON/output treatment, and compatibility
tests. Arbitrary shell strings and an open-ended plugin-command surface remain
out of scope.

## Multi-language support strategy (future planning)

The current v3 release supports JavaScript and TypeScript projects and requires
Node.js. A language-neutral v4 is proposed in
[#84](https://github.com/RoryGlenn/commitment-issues/issues/84); the table below
records the architectural alternatives without promising that the proposal has
shipped.

### Approach comparison

| Approach                                            | How it works                                                                              | Main tradeoff                                                                                      | Current status                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Standalone Go core with optional distribution shims | One language-neutral executable owns behavior; npm or other ecosystems may distribute it. | Requires a careful v3 parity, migration, platform-build, signing, installer, and rollback program. | Current proposal in #84.                   |
| Node core with language adapters                    | Keep the npm runtime and add integrations for other ecosystems' tools.                    | Reuses v3 directly but keeps Node/npm as a runtime requirement for every repository.               | Not the current recommended direction.     |
| Separate native implementations                     | Maintain a different core per language ecosystem.                                         | Native installs, but duplicated behavior, security work, releases, and high drift risk.            | Non-goal for the current team and roadmap. |
| Arbitrary command runner                            | Let repositories configure any command instead of shipping opinionated adapters.          | Flexible, but weakens the product boundary and creates a shell/configuration trust surface.        | Explicit non-goal for the core product.    |

### Recommended direction

The proposed direction is one standalone Go core, not one implementation per
language. Before implementation, #84 requires a versioned inventory of v3
commands, configuration, JSON, exit codes, safety behavior, install/uninstall,
and migration expectations. Cross-shell and GUI-client validation in #83 is a
release dependency. v3 remains the supported product until those gates pass.

## Suggested review process

When reviewing this list after launch, sort each untracked idea into one of
these buckets:

- Build now
- Create GitHub issue
- Needs design
- Funny but later
- Not worth it

Current decision order:

1. Complete the launch-readiness work in #78.
2. Collect real installation friction and recurring questions.
3. Decide whether to begin the v4 contract/compatibility work in #84 and #83.
4. Prioritize #81 or #86 only when feedback supports the extra surface.
5. Promote an untracked check such as debug-junk or mixed-concern detection only
   after its signal quality and false-positive policy are clear.
