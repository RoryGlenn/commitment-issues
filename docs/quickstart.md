# Quickstart

Use this when you want the shortest path from install to the first checked commit.

## 1. Install

Install `commitment-issues` with the peer tools it runs:

```bash
npm install -D commitment-issues husky lint-staged eslint prettier
```

## 2. Initialize

Run the setup command:

```bash
npx commitment-issues init
```

This wires the Git hooks, adds helper npm scripts, adds the `lint-staged` config, enables advisory push tests, activates Husky, and ignores the local ESLint/Prettier cache files.

The command is idempotent, so it is safe to re-run.

## 3. Make a commit

Stage your work and commit normally:

```bash
git add -A
git commit -m "your message"
```

By default, commit-time checks are advisory. They report issues, but the commit continues.

## 4. Fix staged files when needed

When the hook reports auto-fixable lint or formatting issues before committing, run:

```bash
npm run fix:staged
```

Then stage the updated files and commit again.

## 5. Fix the latest commit when safe

When the hook suggests amending the latest commit, run:

```bash
npm run commit:fix
```

This only runs when the working tree is safe enough to amend.

## 6. Push behavior

After `init`, push-time tests run in advisory mode. They warn when associated pushed-file tests fail, but the push continues.

To make pushed-file test failures block the push, set:

```json
{
  "precommitChecks": {
    "blockPushOnTestFailure": true
  }
}
```

If `blockPushOnTestFailure` and `advisePushTests` are both set, blocking takes precedence.

## 7. Common setup notes

- Your project needs an ESLint flat config, usually `eslint.config.js`.
- TypeScript projects need a TypeScript-aware ESLint config.
- `testCommand` defaults to `node --test` and must accept test file paths.
- Use `npm run doctor` to verify or repair hook wiring.
