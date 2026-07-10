# Migration Guide

This guide covers upgrading from `commitment-issues` 2.x, plus the common paths in from raw `husky` + `lint-staged`, `lefthook`, and `pre-commit` setups.

The short version: install `commitment-issues`, remove the old hook wiring, and run `npx commitment-issues init` in the repository root. The `init` command writes plain `.git/hooks` files, adds helper scripts and advisory push-test wiring, and migrates husky-era leftovers — without discarding unrelated project settings.

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
   npx commitment-issues init
   ```

   This retires the husky-era `core.hooksPath`, removes the `.husky` files this tool generated (never your own), and writes the native `.git/hooks` wiring. The next `npm install` self-heals automatically through the generated or composed `prepare` script, so teammates only need to reinstall.

3. Commit the changes (`.husky/` removal) and try a normal commit / push.

Notes:

- **Custom `.husky` hooks** (e.g. `commit-msg`) no longer run once the husky wiring is retired. `init` and `doctor` list them; move the logic into `.git/hooks` or keep husky yourself — while the husky package stays installed, `doctor` respects its wiring and only nudges toward migration.
- **Custom `lint-staged` configs** are left untouched — `fix:staged` no longer reads them. Keep running lint-staged yourself if you rely on custom tasks.
- **CI recipes**: `COMMITMENT_ISSUES=0` is the new hook-skip variable; the old `HUSKY=0` is still honored.

## From raw `husky` + `lint-staged`

This is the most direct migration.

1. Install the package and its peer tools if needed:

   ```bash
   npm install -D commitment-issues eslint prettier
   ```

2. Remove any custom hook bodies that call old scripts directly, and remove husky's `prepare` script (`init` replaces it).

3. Run the initializer:

   ```bash
   npx commitment-issues init
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
commitment-issues prepush
```

Expect to review `package.json` (new helper scripts + `precommitChecks`) and `.gitignore` (cache and `node_modules/` ignores). `.git/hooks` is per-clone and self-heals on every install via the generated or composed `prepare` repair script.

## From `lefthook`

`lefthook` usually centralizes hooks in a single config file. Moving to `commitment-issues` means letting `init` write native `.git/hooks` entry points that call the `commitment-issues` bin.

1. Remove your `lefthook` hook installation (`lefthook uninstall` unsets its `core.hooksPath`; `doctor` will tell you if one is still configured).
2. Install `commitment-issues` and the peer tools it uses.
3. Run `npx commitment-issues init`.
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
commitment-issues prepush
```

Files to review: `package.json` and `.gitignore` — then delete the now-unused `lefthook.yml`.

## From `pre-commit`

If you are using the Python-based `pre-commit` framework, migrate the actual checks into your JavaScript package scripts and hook them through `commitment-issues`.

1. Map each check you care about to a package script or existing command.
2. Install `commitment-issues` alongside `eslint` and `prettier`.
3. Run `pre-commit uninstall` so its hook entry points are removed, then `npx commitment-issues init`.
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
commitment-issues prepush
```

Files to review: `package.json` and `.gitignore` — then remove `.pre-commit-config.yaml` and any `pre-commit` install hook.

## After the migration

- Run `npm test` and `npm run lint`.
- Run `npm run doctor` to confirm the hooks report healthy.
- Try `npm run fix:staged` on a staged-only change.
- Try `npm run commit:fix` on a clean, fixable commit.
- If you want to preview the setup without writing files, run `npx commitment-issues init --dry-run` first.

## Common follow-up adjustments

- If your repo is TypeScript-heavy, make sure ESLint is configured for TypeScript files.
- If you use custom test commands, set `precommitChecks.testCommand` in `package.json`.
- If you want blocking push-time failures, set `precommitChecks.blockPushOnTestFailure` to `true`.

If you run into a migration edge case, check the FAQ and configuration docs for the behavior details.
