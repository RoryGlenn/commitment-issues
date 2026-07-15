# Migration Guide

This guide covers upgrading from `commitment-issues` 2.x, plus the common paths in from raw `husky` + `lint-staged`, `lefthook`, and `pre-commit` setups.

The short version: install `commitment-issues`, remove the old hook wiring, and run `npx --no-install commitment-issues init` in the repository root. The `init` command writes plain `.git/hooks` files, adds helper scripts and advisory push-test wiring, and migrates husky-era leftovers — without discarding unrelated project settings.

## Before you migrate

- Commit or stash any work you do not want to mix with the migration.
- Keep a copy of your current hook config so you can compare before and after.
- Make sure your repo already has a valid `package.json` and a Node version that satisfies `commitment-issues`.

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

- **Custom `.husky` hooks** (e.g. `commit-msg`) no longer run once the husky wiring is retired. `init` and `doctor` list them; move the logic into `.git/hooks` or keep husky yourself — while the husky package stays installed, `doctor` respects its wiring and only nudges toward migration. If that hook ran commitlint, you can instead enable `precommitChecks.commitMessage` after keeping your project-local commitlint dependency and config. Composite custom hooks are preserved; add `commitment-issues commit-msg "$1"` manually rather than replacing their other logic.
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
[release audit](audits/release-packaging-and-upgrades.md#pinned-upgrade-fixtures)
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

## From raw `husky` + `lint-staged`

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

## From `lefthook`

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

## From `pre-commit`

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
