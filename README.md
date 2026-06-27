# Pre-commit hook scripts

This ZIP contains several pre-commit wrapper options for a React/JavaScript project using Husky + lint-staged + ESLint + Prettier.

## Recommended file

Use this one first:

```text
scripts/precommit-boxen.mjs
```

It gives you the boxed start/success/failure messages while keeping the real lint-staged, ESLint, and Prettier output visible.

## Options

```text
scripts/precommit-boxen.mjs      # recommended
scripts/precommit-ora.mjs        # spinner style
scripts/precommit-boxen-ora.mjs  # hybrid boxed + spinner
scripts/precommit-plain.mjs      # no UI dependencies
.husky/pre-commit                # Husky hook example
package-json-snippet.json        # package.json fields to merge
install.sh                       # install helper
```

## Install

```bash
npm install --save-dev husky lint-staged prettier eslint boxen picocolors ora
npx husky init
mkdir -p scripts
cp scripts/precommit-boxen.mjs scripts/precommit.mjs
echo 'node scripts/precommit.mjs' > .husky/pre-commit
chmod +x .husky/pre-commit
```

Then merge `package-json-snippet.json` into your real `package.json`.

## Notes

- `prepare` is recommended so Husky installs automatically after `npm install`.
- The hook scripts in this repo are intentionally advisory: they print suggestions and let commits/pushes continue.
- `.husky/pre-commit` runs `scripts/precommit.mjs`.
- `lint-staged` now also runs `scripts/check-tests.mjs` for staged JS files.
- `.husky/pre-push` currently only prints a note and does not run a script.
