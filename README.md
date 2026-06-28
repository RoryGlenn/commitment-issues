# Pre-commit checks

This repo contains a non-blocking pre-commit flow for JavaScript projects using Husky, lint-staged, ESLint, and Prettier.

## Active flow

- `.husky/pre-commit` runs `node scripts/precommit-unified.mjs`.
- `scripts/precommit-unified.mjs` inspects staged files, prints one consolidated summary box, and never blocks the commit.
- When ESLint or formatting issues are fixable, the hook suggests `npm run fix:staged`.
- `npm run fix:staged` runs `scripts/fix-staged.mjs`, which delegates staged-file fixing to `lint-staged`.
- JavaScript files are fixed by `scripts/fix-staged-js.mjs`, which runs `eslint --fix` and then `prettier --write` on the staged JS file set.
- Other staged Prettier-supported files are fixed by `prettier --write` through `lint-staged`.

## Safety model

- Commits are advisory: the hook reports issues but exits successfully.
- `npm run fix:staged` only targets staged files.
- If a file has both staged and unstaged changes, `npm run fix:staged` refuses to run for safety.
- If ESLint cannot fix everything automatically, available fixes are still applied and re-staged, and the command exits non-zero so the remaining issues are visible.

## Commands

```bash
npm run test:precommit  # run the unified hook script directly
npm run fix:staged      # apply staged-only ESLint/Prettier fixes
npm run lint            # lint the full repo
npm run format:check    # check formatting across the repo
```
