# How commitment-issues works

`commitment-issues` owns the Git hook workflow directly by default, or composes
into an explicitly selected existing manager without taking ownership of its
files. Commit checks stay advisory by default, push checks can warn or block
depending on configuration, and fix commands mutate work only when the safety
checks pass.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/project-flowchart-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="../assets/project-flowchart-light.svg">
    <img src="../assets/project-flowchart-light.svg" alt="commitment-issues project flowchart showing setup, Git hook wiring, code and guard checks before commit, safe fix paths, and pre-push tests" width="100%">
  </picture>
</p>

## Setup

Install the package with the peer tools it runs:

```bash
npm install -D commitment-issues eslint@^9 prettier@^3
```

Then initialize the project:

```bash
npx --no-install commitment-issues init
```

Run this from the project root of a non-bare Git working tree. Bare repositories
cannot run the local commit and push workflow and are reported as unsupported
instead of being marked healthy. The init command is idempotent. It wires plain
Git hooks, adds helper npm scripts, enables advisory push tests, and adds safe
ignore defaults for local tool output.

## Core hook wiring

`commitment-issues` does not require a hook manager.

| Git action              | Native hook path        | Command invoked                     |
| ----------------------- | ----------------------- | ----------------------------------- |
| `git commit`            | `.git/hooks/pre-commit` | `commitment-issues precommit`       |
| `git push`              | `.git/hooks/pre-push`   | `commitment-issues prepush "$@"`    |
| commit message (opt-in) | `.git/hooks/commit-msg` | `commitment-issues commit-msg "$1"` |

The hook files call the package binary from `node_modules/.bin`, so the behavior stays local to the project.

### Existing-manager path

`init --integration=<manager>` uses a hidden dispatcher inside Husky, Lefthook,
or pre-commit. Manager files stay user-owned; health requires exact config and
an executable installed dispatcher. Ambiguous or unsafe ownership fails closed.

The recognized forms are intentionally conservative. Lefthook inspection is
limited to one of six main YAML names (`lefthook.yml`, `lefthook.yaml`, their
leading-dot forms, or either extension below `.config/`); JSON, JSONC, TOML,
local, extended/remote, overridden, and advanced-YAML configurations require
manual review. pre-commit accepts either `.pre-commit-config.yaml` or `.yml`.
Installed wrappers must match Husky 8.0.1–8.0.3 or 9.0.2–9.1.7, the canonical
Lefthook 2.1.10 shape (or its narrow direct form), or the supported pre-commit
3.2+ shape. Customized or newer templates are preserved and reported.

Hook-directory discovery preserves Git's path bytes, removing only the single
line terminator emitted by `git rev-parse --git-path hooks`. The separate
NUL-delimited `core.hooksPath` probe distinguishes an unset key from a present
empty value and never trims whitespace. Husky ownership keeps backslashes
literal on POSIX and treats them as separators only on Windows, matching Git's
platform path rules.

Husky receives Git's `$@`/`$1` directly and uses `|| exit $?` to retain an
enforced result before later custom lines. Lefthook uses static commands,
forwards pre-push stdin through `use_stdin: true`, and invokes commit-msg with
`--git-path` so the Node entrypoint resolves Git's worktree-specific
message path itself. The pre-commit framework supplies commit-msg's filename
and publishes its consumed pre-push range through `PRE_COMMIT_*`
variables. Hidden dispatch keeps skips hook-scoped; old and duplicate forms get
replacement or removal-only guidance.

Only the Commitment Issues entry is required to be unconditional; other
manager commands retain their own ordering, conditions, and skip behavior.
Duplicate Lefthook hook/command keys and duplicate pre-commit IDs are rejected.
pre-commit's exact entry fields are validated, and `args` is not accepted
because it could alter the reviewed invocation. lint-staged is detected only as
separate composition evidence; its config is never loaded or interpreted.
The same structural pass validates all sibling Lefthook hooks and nested jobs,
and all pre-commit repos/hooks plus supported root options; an invalid unrelated
entry cannot be hidden behind a healthy Commitment Issues entry.

Install-time repair is owner-specific. Native setup composes `doctor --quiet`;
coexistence composes `doctor --quiet --integration=<manager>`, which verifies
and warns but never modifies manager configuration or breaks an install.

Project-relative commands avoid global package lookup, but a restricted hook
or GUI `PATH` must still contain `node`. Lefthook and pre-commit must also
resolve their reviewed manager runtimes; Husky uses its inspected local
dispatcher.

ESLint and Prettier are also resolved directly from the project's
`node_modules`; a missing peer is reported with an install hint and never
delegated to an implicit `npx` fallback. The configured `testCommand` is user
owned and runs verbatim.

## Pre-commit flow

On the first eligible clean or informational human-readable pre-commit run in a
clone, a compact Commit Owl welcome becomes the final box and records a
versioned marker below Git's common directory. Warnings and errors take
priority without consuming it. Linked worktrees share the marker. JSON runs do
not display or consume it, and projects can opt out with
`showWelcomeOnFirstCommit: false`.

The pre-commit hook then inspects staged files.

- Git pathname lists are requested with NUL delimiters. Leading/trailing
  whitespace, tabs, newlines, and Unicode are preserved exactly when paths are
  passed to checks or fixers.
- If there are no relevant project files, the commit continues.
- If relevant files are staged, the hook runs configured checks.
- Code checks can report lint issues, formatting drift, missing tests, and optional staged-related test failures.
- Guard checks cover the branch and its upstream, commit shape and size, generated files, and likely staged secrets.
- In default advisory mode, issues are shown as warnings and the commit still continues.

Blocking commit behavior is only used when explicitly configured.

## Optional commit-message flow

When `precommitChecks.commitMessage.enabled` is `true`, `init` and `doctor`
also own the native commit-msg hook. Git supplies the pending message file as
`$1`; the generated hook quotes it and the Node entrypoint forwards its absolute
path as one argv value to project-local `node_modules/.bin/commitlint`.
Lefthook instead uses the explicit static `hook commit-msg --git-path` mode, which
selects `MERGE_MSG` only for a direct `git merge` invocation (identified by
Git's `GITHEAD_<object-id>` environment plus a regular `MERGE_HEAD`) and uses
`COMMIT_EDITMSG` for ordinary commits and a later `git commit` that completes a
pending merge. It resolves the selected file with `git rev-parse --git-path`
before invoking the same local commitlint command.

No commitlint package or ruleset is bundled. The consumer installs the CLI and
defines its own commitlint configuration. Findings and setup failures warn by
default; `commitMessage.blockOnFailure` is the explicit enforcement switch.
Successful runs are silent, and `git commit --no-verify` retains Git's normal
bypass behavior.

## Safe fix paths

`commitment-issues` separates safe fix paths from normal advisory checks.

| Command              | Safety rule                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `npm run fix:staged` | Only targets staged fixable files and refuses partially staged files.         |
| `npm run commit:fix` | Only amends the latest unpushed commit when the tracked working tree is safe. |

The tool prefers refusing a risky mutation over hiding or rewriting work unexpectedly.

## Pre-push flow

After `init`, push-time tests run in advisory mode by default.

The pre-push hook reads pushed refs, detects changed files, collects related
tests, and runs the configured test command. Native, Husky, and Lefthook wiring
read Git's stdin directly. The pre-commit framework consumes that stream first,
so the entrypoint reconstructs the same range only from a complete documented
`PRE_COMMIT_*` environment. A partial environment is ignored rather than
guessed. The default runner is `node --test`.

For an existing remote branch, its advertised SHA is the diff base. On the
first push of a new branch, the hook chooses the closest unambiguous merge base
from its upstream or remote-tracking branches, so files inherited from `main`
do not trigger a whole-repository test snapshot. If the history is orphaned,
unrelated, or no safe base can be identified, it conservatively diffs from the
repository's empty tree. That fallback may run more tests, but cannot omit a
test because base discovery failed.

Related-test lookup is package-aware. Colocated tests win first, followed by
paths mirrored below the nearest package's `test/` or `tests/` directory. A
nested package never falls through to the root package's basename-only test.
See [Monorepo & Workspaces Guide](monorepo.md#related-test-selection) for the
full deterministic lookup order.

| Result                     | Default advisory mode     | Blocking mode |
| -------------------------- | ------------------------- | ------------- |
| Tests pass                 | Push allowed              | Push allowed  |
| Tests fail                 | Push allowed with warning | Push blocked  |
| No related tests are found | Push allowed              | Push allowed  |

If `blockPushOnTestFailure` and `advisePushTests` are both set, blocking takes precedence.

Spawned tools return structured outcomes for success, normal nonzero exit,
external signal, timeout, and spawn failure. Missing built-in peer tools are a
separate outcome. Timeout cleanup terminates the attached process group on
Ubuntu/macOS and process tree on Windows; see the documented
[timeout cleanup boundary](configuration.md#timeout-cleanup-boundary).

## Configuration defaults

The default behavior is intentionally advisory-first:

```json
{
  "precommitChecks": {
    "advisePushTests": true,
    "blockPushOnTestFailure": false,
    "testCommand": ["node", "--test"]
  }
}
```

These keys may instead be top-level entries in `.commitmentrc.json`.
Standalone keys override matching `package.json` values.

See [Configuration and Behavior](configuration.md) for the full configuration reference.
