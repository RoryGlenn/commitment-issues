# Migration Guide

This guide covers upgrading from `commitment-issues` 2.x and choosing between
migration from, or coexistence with, Husky, Lefthook, and the Python
`pre-commit` framework.

The short version: install `commitment-issues`, remove the old hook wiring, and run `npx --no-install commitment-issues init` in the repository root. The `init` command writes plain `.git/hooks` files, adds helper scripts and advisory push-test wiring, and migrates husky-era leftovers — without discarding unrelated project settings.

## Before you migrate

- Commit or stash any work you do not want to mix with the migration.
- Keep a copy of your current hook config so you can compare before and after.
- Make sure your repo already has a valid `package.json` and a Node version that satisfies `commitment-issues`.

## Keep an existing hook manager

Coexistence is different from migration. Migration transfers hook ownership to
Commitment Issues' generated `.git/hooks`; coexistence keeps the current
manager as the only hook owner and adds Commitment Issues as a manager command.
Choose coexistence when the manager still runs unrelated project logic.

Preview and apply package-owned setup with an explicit owner:

```bash
npx --no-install commitment-issues init --dry-run --integration=husky
npx --no-install commitment-issues init --integration=husky
npx --no-install commitment-issues doctor --integration=husky
```

Use `lefthook` or `pre-commit` instead of `husky` as appropriate. Bare
`--integration` auto-detects only when exactly one owner has active evidence.
No evidence or multiple managers require an explicit choice. An explicit
choice does not override an unsafe selected configuration: duplicate,
unsupported, linked, non-regular, or unreadable selected config paths still
stop before writes and require manual review. The tool does not guess.

The normal run may update Commitment Issues' `package.json` scripts,
configuration, `.gitignore` defaults, and its exact `prepare` suffix. It does
not write native hooks, unset `core.hooksPath`, run a manager install command,
or edit any manager-owned file. Dry-run writes nothing and prints the same
reviewable snippets. Re-running is idempotent.

Package-manager-native forms for the same command are:

| Package manager | Local invocation                                                   |
| --------------- | ------------------------------------------------------------------ |
| npm             | `npx --no-install commitment-issues init --integration=<manager>`  |
| pnpm            | `pnpm exec commitment-issues init --integration=<manager>`         |
| Yarn            | `yarn run commitment-issues init --integration=<manager>`          |
| Bun             | `bunx --no-install commitment-issues init --integration=<manager>` |

All generated snippets use the static project-relative
`node_modules/.bin/commitment-issues` path. No checkout path is interpolated,
so spaces, Unicode, shell metacharacters, linked worktrees, and GUI-launched Git
do not change the reviewed command. Yarn Plug'n'Play remains unsupported;
Yarn Berry must use `nodeLinker: node-modules`.

A restricted GUI or hook `PATH` must still provide `node`. Lefthook and
pre-commit integrations must also resolve their reviewed manager runtimes;
Husky uses its inspected repository-local dispatcher instead of a `husky`
executable from `PATH`. The project-local Commitment Issues path prevents a
global package fallback; it does not bundle those runtimes.

### Husky contract

Place the guarded line before every unrelated substantive command in the
corresponding existing file; do not replace those later commands. When Git uses
the direct `.husky` path for Husky v8, an exact `_/husky.sh` source line may
precede it:

```sh
# .husky/pre-commit
node_modules/.bin/commitment-issues precommit || exit $?

# .husky/pre-push
node_modules/.bin/commitment-issues prepush "$@" || exit $?

# .husky/commit-msg — only when commitMessage.enabled is true
node_modules/.bin/commitment-issues commit-msg "$1" || exit $?
```

The quoted arguments preserve Git's remote and message-file values. `|| exit
$?` preserves a configured blocking result even when custom commands follow;
success continues into the remaining Husky script. Git's `--no-verify`,
Husky's `HUSKY=0`, and `COMMITMENT_ISSUES=0` retain their normal bypass
behavior. `doctor` also requires Husky's `.husky/_` (or compatible `.husky`)
`core.hooksPath` to be active before reporting healthy.

Wrapper recognition is intentionally version-shaped. Doctor recognizes exact
stable Husky 8.0.1–8.0.3 and 9.0.2–9.1.7 dispatcher/runtime bodies. A direct v8
hook that does not source `_/husky.sh` needs no separate runtime; when it does
source that file, the runtime must match. Husky 8.0.0 is outside the supported
POSIX shape, and 9.0.1 is rejected because its published shared runtime ends
with an unconditional failure. A customized runtime, partial wrapper, or newer
generated shape is preserved and reported for manual review rather than
treated as healthy. Every effective wrapper is inspected before a
missing/foreign shared runtime is classified, so the runtime cannot hide a
linked or customized hook from init's pre-write safety check.

### Lefthook contract

Read-only inspection supports exactly one of these main YAML files:

- `lefthook.yml`
- `lefthook.yaml`
- `.lefthook.yml`
- `.lefthook.yaml`
- `.config/lefthook.yml`
- `.config/lefthook.yaml`

Lefthook JSON, JSONC, TOML, `*-local` configuration, multiple candidate files,
`extends`/`remotes`, advanced YAML constructs, unreviewed top-level options
(including all global settings), and a non-empty `LEFTHOOK_CONFIG` override are
detected but require manual review. This boundary avoids making a health claim
without evaluating Lefthook's complete schema, merge, runtime, and precedence
behavior.

Merge each `commitment-issues` command below into the matching existing
top-level hook and `commands` mapping. Do not duplicate a hook key or the
`commitment-issues` command key:

```yaml
pre-commit:
  commands:
    commitment-issues:
      run: node_modules/.bin/commitment-issues precommit
pre-push:
  commands:
    commitment-issues:
      run: node_modules/.bin/commitment-issues prepush
      use_stdin: true
commit-msg: # only when commitMessage.enabled is true
  commands:
    commitment-issues:
      run: node_modules/.bin/commitment-issues commit-msg --git-path
```

These commands are static: no Git-provided value or Lefthook positional
template is inserted into manager-owned shell configuration. `use_stdin: true`
passes the pushed ref list to the pre-push entrypoint. For commit-msg,
`--git-path` resolves Git's active message file at runtime with
`git rev-parse --git-path`, including in linked worktrees. Direct automatic
merges use `MERGE_MSG`; ordinary commits and a later `git commit` that completes
a pending merge use `COMMIT_EDITMSG`. Lefthook can pass stdin to only one
command, so if another pre-push command also consumes it, keep a project-owned
wrapper that reads once and fans the input out. Lefthook's installed pre-push
and commit-msg wrappers must forward `"$@"` to the manager. Lefthook retains
command ordering, parallelism, skip rules, and failure aggregation. Commitment
Issues' advisory modes exit zero; explicitly enabled blocking modes return
nonzero for Lefthook to enforce.

Conditions and skip rules on unrelated hooks and commands remain untouched.
The Commitment Issues hook and its command must be unconditional: hook-level
`skip`, `only`, or `exclude_tags`, and command-level path, tag, environment,
root, `skip`, or `only` filters prevent doctor from reporting the entry as
healthy. The installed dispatcher is checked separately. Doctor recognizes
the canonical Lefthook 2.1.10 generated wrapper and a narrow direct-wrapper
form; customized or newer templates need manual review. Without executing a
repository-controlled probe, the verifier also requires the selected runtime
candidate to exist and have a reviewed Lefthook executable identity.
The direct form is exactly a `#!/bin/sh` line plus one `lefthook run <hook>` or
`node_modules/.bin/lefthook run <hook>` line, optionally prefixed by `exec` or
`command`; the hook name may be double-quoted, and pre-push/commit-msg must end
with `"$@"`.
Before that claim, the entire selected YAML document is schema-checked: every
top-level Git hook and each nested setup, command, script, job, and group must
use a reviewed Lefthook 2.1.10 form. A malformed sibling therefore makes the
configuration uninspectable even when the Commitment Issues command itself is
exact. Runtime resolution follows shell PATH ordering and effective execute
access; `test -f` packaged candidates separately skip directories and special
nodes exactly as the generated wrapper does. The static verifier never runs a
repository-controlled executable.

### pre-commit framework contract

Use pre-commit 3.2 or newer so `stages` names match Git hook names. Merge these
entries into a `repo: local` hook list in either `.pre-commit-config.yaml` or
`.pre-commit-config.yml`; keep every other repo and hook:

```yaml
repos:
  - repo: local
    hooks:
      - id: commitment-issues-pre-commit
        name: commitment-issues pre-commit
        entry: node_modules/.bin/commitment-issues precommit
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-commit]
      - id: commitment-issues-pre-push
        name: commitment-issues pre-push
        entry: node_modules/.bin/commitment-issues prepush
        language: system
        pass_filenames: false
        always_run: true
        stages: [pre-push]
      # Add only when commitMessage.enabled is true:
      - id: commitment-issues-commit-msg
        name: commitment-issues commit-msg
        entry: node_modules/.bin/commitment-issues commit-msg
        language: system
        pass_filenames: true
        always_run: true
        stages: [commit-msg]
```

The framework supplies commit-msg's filename normally. For pre-push it consumes
Git stdin and publishes the same range through `PRE_COMMIT_FROM_REF`,
`PRE_COMMIT_TO_REF`, branch, remote-name, and remote-URL variables; the
Commitment Issues entrypoint understands that documented environment. The
framework's `SKIP=<hook-id>` and Git's `--no-verify` continue to work.

Each Commitment Issues ID must occur exactly once. The `entry`, `language`,
`pass_filenames`, `always_run`, and `stages` fields must each match the snippet
exactly; an `args` field is rejected because it can change the validated argv.
Other hooks keep their own conditions, but these entries must stay
unconditional with `always_run: true`. Doctor conservatively recognizes the
supported pre-commit 3.2+ generated dispatcher; customized or newer wrapper
templates are preserved for manual review. When the selected file is the
`.yml` form, the wrapper remediation includes its destination explicitly:

```bash
pre-commit install --config .pre-commit-config.yml --hook-type pre-commit --hook-type pre-push
```

Add `--hook-type commit-msg` when commit-message linting is enabled.

The whole pre-commit document is validated before health is reported, not just
the three local entries. Supported root options and every local, meta, and
remote hook must use audited keys, Git stages, languages, type tags, and a
conservative Python/JavaScript-compatible regex subset. Language validation
uses the intersection supported across pre-commit 3.2 and current releases;
version-specific languages require manual review because the identical wrapper
cannot prove the installed framework version. The
`default_language_version` map excludes the renamed `system`/`script` aliases
because current releases do not migrate those option keys. Type validation
likewise uses
the tags available in pre-commit's minimum `identify` 1.0 dependency rather
than accepting tags added by newer resolver releases. Plain YAML scalars are
interpreted with PyYAML SafeLoader's YAML 1.1 typing so quoted strings cannot be
confused with booleans, dates, or legacy numeric forms. For the same reason,
`minimum_pre_commit_version` may require at most the documented 3.2 floor.
Higher requirements, future type tags, advanced regex syntax, and unknown
fields remain untouched but require manual review.

The canonical dispatcher parser supports an empty, missing, or non-executable
primary (which selects PATH) and a slash-qualified executable with a reviewed
Python identity, including free-threaded `python3.Nt` names. PATH is evaluated
literally—empty components mean the repository directory and quotes are not
stripped—and linked executable identities are checked at their resolved
target. The static verifier does not execute `pre-commit` or Python to infer
behavior.

### lint-staged composition

lint-staged is a staged-file task runner, not a Git-hook owner. Keep its current
Husky or Lefthook pre-commit command and add Commitment Issues as a separate
command. Coexistence detection reports lint-staged but never reads, merges,
reorders, executes, interprets, or deletes its configuration. Detection covers
the `lint-staged` package/dependency keys, `.lintstagedrc` and its supported
JSON/YAML/JS/MJS/CJS/TS/MTS/CTS names, `lint-staged.config.*` for
JS/MJS/CJS/TS/MTS/CTS, and a top-level `lint-staged` key in `package.yaml` or
`package.yml`. This avoids changing its stash, concurrency, task-order, and
failure semantics.

`doctor --integration=<manager>` is verification-only: it checks the exact
configuration entry and the executable manager wrapper in Git's effective
hooks directory. Interactive mode exits nonzero with exact missing snippets or
the manager install command (`lefthook install` or `pre-commit install` with
each enabled hook type), while `--quiet` warns and exits zero so a package
install cannot fail. `uninstall` removes only the exact package-owned repair
suffix and other generated package state. Manager entries and wrappers are
user-owned and therefore never claimed or deleted; uninstall names recognized
entries for manual cleanup.

## Upgrading from `commitment-issues` 2.x

Version 3.0 dropped the husky and lint-staged dependencies: hooks are now plain `.git/hooks` files and staged fixes run ESLint/Prettier directly. The upgrade is automated:

1. Update the package (husky and lint-staged are no longer peer dependencies):

   ```bash
   npm install -D commitment-issues@latest
   npm remove husky lint-staged   # unless you use them yourself
   ```

2. Run the initializer once:

   ```bash
   npx --no-install commitment-issues init
   ```

   This retires the husky-era `core.hooksPath`, removes the `.husky` files this tool generated (never your own), and writes the native `.git/hooks` wiring. The next `npm install` self-heals automatically through the generated or composed `prepare` script, so teammates only need to reinstall.

3. Commit the changes (`.husky/` removal) and try a normal commit / push.

Notes:

- **Custom `.husky` hooks** (e.g. `commit-msg`) no longer run once the husky wiring is retired. `init` and `doctor` list them; move the logic into `.git/hooks` or use the [explicit Husky coexistence contract](#husky-contract). If that hook ran commitlint, you can instead enable `precommitChecks.commitMessage` after keeping your project-local commitlint dependency and config.
- **Custom `lint-staged` configs** are left untouched — `fix:staged` no longer reads them. Keep running lint-staged yourself if you rely on custom tasks.
- **CI recipes**: `COMMITMENT_ISSUES=0` is the new hook-skip variable; the old `HUSKY=0` is still honored.

## Verified package upgrades

The cross-version lifecycle starts from exact immutable release artifacts, not
from a moving npm dist-tag:

| Starting release | Verified boundary                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2.5.1           | Last 2.x release: Husky `core.hooksPath`, exact generated `.husky` hooks, historical scripts/configuration, and the old peer-tool set migrate to native hooks. |
| v3.2.0           | Previous minor: exact older native hooks, including the pre-push body that did not forward Git's remote arguments, are refreshed.                              |
| v3.3.2           | Latest published baseline: exact PATH-fallback pre-commit, pre-push, and commit-msg bodies are refreshed to project-local-bin wiring.                          |

Each fixture is pinned by SHA-256 to an immutable GitHub Release asset; the
[release audit](https://github.com/RoryGlenn/commitment-issues/blob/main/docs/audits/release-packaging-and-upgrades.md#pinned-upgrade-fixtures)
records the exact digests. The required pull-request lane exercises every
fixture with npm on Ubuntu and Node 24. The release workflow repeats the npm
migration with the exact candidate tarball in a read-only build job, then
hash-checks the artifact before the separate OIDC-enabled job publishes it.
Weekly health extends the same migration to pnpm, Yarn Classic, and Bun.

These are forward-upgrade guarantees. The lifecycle proves that exact generated
hooks and scripts are refreshed or removed only when ownership is established,
project-owned `prepare` logic is retained, custom hooks remain byte-for-byte
unchanged, and the migrated hooks run during a real commit and push. Other
historical starting versions are not a separate compatibility claim.

Run the new version's `init` explicitly after changing dependencies. Package
installation or peer removal does not guarantee that the consuming project's
root `prepare` runs during that same command. Once `init` has added or composed
the repair command, later normal installs can self-heal clone-local hooks.

## Downgrades and manual rollback

In-place downgrades are unsupported. An older release cannot safely reverse
newer native wiring into Husky, recognize every newer generated body, or infer
which newer configuration belongs to the project. It therefore must not rewrite
unknown state as an automatic reverse migration.

If you must return to an older release:

1. Commit or back up custom hook and configuration changes.
2. While the current version is still installed, run
   `npx --no-install commitment-issues uninstall`. This removes only state the
   current version can prove it owns and restores a composed project-owned
   `prepare` command.
3. Restore a package manifest and lockfile that pin the target version and its
   peer tools. Do not substitute a moving tag or an unbounded dependency range.
   Returning to 2.x also requires its compatible Husky and lint-staged peers and
   a Node version accepted by that release.
4. Install from the restored lockfile, then run the target version's
   `npx --no-install commitment-issues init` and
   `npx --no-install commitment-issues doctor`.
5. Review the resulting hooks and package changes, then try a normal commit and
   push before sharing the rollback.

Custom hooks are preserved throughout this process, but an older release may
not run logic written for a newer hook layout. Treat any manual-cleanup warning
as work to review, not as permission to delete the file.

## Migrate from raw `husky` + `lint-staged`

This is the most direct migration.

1. Install the package and its peer tools if needed:

   ```bash
   npm install -D commitment-issues eslint@^9 prettier@^3
   ```

2. Remove any custom hook bodies that call old scripts directly, and remove husky's `prepare` script (`init` replaces it).

3. Run the initializer:

   ```bash
   npx --no-install commitment-issues init
   ```

4. Review the `package.json` and `.gitignore` changes and the new `.git/hooks` files.

5. Uninstall the old wiring once you are happy:

   ```bash
   npm remove husky lint-staged
   ```

6. Commit the updated config and try a normal commit / push.

**Before** — a hand-wired `.husky/pre-commit` that runs lint-staged directly:

```bash
# .husky/pre-commit
npx lint-staged
```

**After** — `init` points plain `.git/hooks` files at the `commitment-issues` bin and adds an advisory pre-push test gate:

```bash
# .git/hooks/pre-commit (generated, not committed)
commitment-issues precommit

# .git/hooks/pre-push (generated, not committed)
commitment-issues prepush "$@"
```

Expect to review `package.json` (new helper scripts + `precommitChecks`) and `.gitignore` (cache and `node_modules/` ignores). `.git/hooks` is per-clone and self-heals on every install via the generated or composed `prepare` repair script.

## Migrate from `lefthook`

`lefthook` usually centralizes hooks in a single config file. Moving to `commitment-issues` means letting `init` write native `.git/hooks` entry points that call the `commitment-issues` bin.

1. Remove your `lefthook` hook installation (`lefthook uninstall` unsets its `core.hooksPath`; `doctor` will tell you if one is still configured).
2. Install `commitment-issues` and the peer tools it uses.
3. Run `npx --no-install commitment-issues init`.
4. Compare the resulting `.git/hooks/pre-commit` and `.git/hooks/pre-push` hooks with your old behavior.

The biggest behavior change is philosophical: `commitment-issues` is advisory-first by default. It reports problems without blocking unless you opt into stricter behavior in `precommitChecks`.

**Before** — hook logic centralized in `lefthook.yml`:

```yaml
# lefthook.yml
pre-commit:
  commands:
    lint:
      run: eslint {staged_files}
    format:
      run: prettier --write {staged_files}
```

**After** — remove `lefthook.yml`; the native hooks call the bin instead:

```bash
# .git/hooks/pre-commit (generated, not committed)
commitment-issues precommit

# .git/hooks/pre-push (generated, not committed)
commitment-issues prepush "$@"
```

Files to review: `package.json` and `.gitignore` — then delete the now-unused `lefthook.yml`.

## Migrate from `pre-commit`

If you are using the Python-based `pre-commit` framework, migrate the actual checks into your JavaScript package scripts and hook them through `commitment-issues`.

1. Map each check you care about to a package script or existing command.
2. Install `commitment-issues` alongside `eslint` and `prettier`.
3. Run `pre-commit uninstall` so its hook entry points are removed, then `npx --no-install commitment-issues init`.
4. Remove `.pre-commit-config.yaml`.

If you relied on `pre-commit` to block everything automatically, review your `precommitChecks` settings. `commitment-issues` warns by default and only blocks when you explicitly opt in.

**Before** — `.pre-commit-config.yaml` driving hooks through the Python framework:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: eslint
        name: eslint
        entry: npx eslint
        language: system
        types: [javascript]
```

**After** — drop `.pre-commit-config.yaml` and let the native hooks run your JS tooling:

```bash
# .git/hooks/pre-commit (generated, not committed)
commitment-issues precommit

# .git/hooks/pre-push (generated, not committed)
commitment-issues prepush "$@"
```

Files to review: `package.json` and `.gitignore` — then remove `.pre-commit-config.yaml` and any `pre-commit` install hook.

## After the migration

- Run `npm test` and `npm run lint`.
- Run `npm run doctor` to confirm the hooks report healthy.
- Try `npm run fix:staged` on a staged-only change.
- Try `npm run commit:fix` on a clean, fixable commit.
- If you want to preview the setup without writing files, run `npx --no-install commitment-issues init --dry-run` first.

## Common follow-up adjustments

- If your repo is TypeScript-heavy, make sure ESLint is configured for TypeScript files.
- If you use custom test commands, set `precommitChecks.testCommand` in `package.json`.
- If you want blocking push-time failures, set `precommitChecks.blockPushOnTestFailure` to `true`.

If you run into a migration edge case, check the FAQ and configuration docs for the behavior details.
