# How commitment-issues works

`commitment-issues` owns the Git hook workflow directly: setup writes plain `.git/hooks` files, commit checks stay advisory by default, push checks can warn or block depending on configuration, and fix commands only mutate work when the safety checks pass.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/project-flowchart-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="../assets/project-flowchart-light.svg">
    <img src="../assets/project-flowchart-light.svg" alt="commitment-issues project flowchart showing setup, Git hook wiring, pre-commit checks, safe fix paths, and pre-push checks" width="100%">
  </picture>
</p>

## Setup

Install the package with the peer tools it runs:

```bash
npm install -D commitment-issues eslint prettier
```

Then initialize the project:

```bash
npx commitment-issues init
```

The init command is idempotent. It wires plain Git hooks, adds helper npm scripts, enables advisory push tests, and adds safe ignore defaults for local tool output.

## Core hook wiring

`commitment-issues` does not require a hook manager.

| Git action   | Native hook path        | Command invoked               |
| ------------ | ----------------------- | ----------------------------- |
| `git commit` | `.git/hooks/pre-commit` | `commitment-issues precommit` |
| `git push`   | `.git/hooks/pre-push`   | `commitment-issues prepush`   |

The hook files call the package binary from `node_modules/.bin`, so the behavior stays local to the project.

## Pre-commit flow

On commit, the pre-commit hook inspects staged files first.

- If there are no relevant project files, the commit continues.
- If relevant files are staged, the hook runs configured checks.
- Default checks can report lint issues, formatting drift, missing tests, and optional staged-related test failures.
- In default advisory mode, issues are shown as warnings and the commit still continues.

Blocking commit behavior is only used when explicitly configured.

## Safe fix paths

`commitment-issues` separates safe fix paths from normal advisory checks.

| Command              | Safety rule                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `npm run fix:staged` | Only targets staged fixable files and refuses partially staged files.         |
| `npm run commit:fix` | Only amends the latest unpushed commit when the tracked working tree is safe. |

The tool prefers refusing a risky mutation over hiding or rewriting work unexpectedly.

## Pre-push flow

After `init`, push-time tests run in advisory mode by default.

The pre-push hook reads pushed refs, detects changed files, collects related tests, and runs the configured test command. The default runner is `node --test`.

| Result                     | Default advisory mode     | Blocking mode |
| -------------------------- | ------------------------- | ------------- |
| Tests pass                 | Push allowed              | Push allowed  |
| Tests fail                 | Push allowed with warning | Push blocked  |
| No related tests are found | Push allowed              | Push allowed  |

If `blockPushOnTestFailure` and `advisePushTests` are both set, blocking takes precedence.

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
