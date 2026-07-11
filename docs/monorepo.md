# Monorepo & Workspaces Guide

This guide covers using `commitment-issues` in a monorepo or a
workspaces-based repository (npm, pnpm, or yarn workspaces).

## The short version

Install and initialize `commitment-issues` **once at the repository root**. The
Git hooks run from the repo root and check staged files across every workspace
package using the root configuration.

```bash
# from the repository root
npm install -D commitment-issues eslint prettier
npx commitment-issues init
```

## How it works in a monorepo today

`commitment-issues` treats the repository as a single unit rooted at the Git
root:

- **Hooks live at the Git root.** `init` writes `.git/hooks/pre-commit` and
  `.git/hooks/pre-push` in the repository's git directory, plus the optional
  `.git/hooks/commit-msg` when enabled, so they run once for the whole
  repository.
- **Staged files are checked across all packages.** The pre-commit check reads
  staged paths with `git diff --cached` relative to the repo root, so changes in
  any workspace package are included together.
- **Configuration is read from the root `package.json`.** The `precommitChecks`
  options come from the root package, not from individual workspace packages.
- **Tools resolve locally from the root `node_modules`.** In a typical workspace
  setup the peer tools (`eslint`, `prettier`) and optional commitlint CLI are
  hoisted to the root. Hooks read peer-tool package bins directly and resolve
  optional commitlint through the root `node_modules/.bin` tree.

## Recommended setup

1. Install `commitment-issues` and the peer tools at the repository root, not
   inside an individual workspace package.
2. Run `npx commitment-issues init` from the root.
3. Keep a root-level ESLint flat config. Use its `files` patterns to scope rules
   to specific packages when needed.
4. Set `precommitChecks` in the root `package.json` to match how you want the
   whole repository checked.
5. If commit-message linting is enabled, install commitlint and keep its config
   at the root; per-workspace commitlint resolution is not attempted.

## Scoping checks per package

Because configuration is root-level, use the tools' own path scoping:

- **ESLint flat config** can apply different rules per package with `files`
  globs.
- **`precommitChecks.testExempt`** accepts globs, so you can exempt packages or
  paths from the missing-test check (for example, `packages/legacy/**`).
- **`precommitChecks.testCommand`** sets the runner used for staged and pushed
  tests across the repository.

## Boundary: what is not supported

The following are outside the current design:

- **Per-package `precommitChecks` configuration.** Only the root package's
  `precommitChecks` is read.
- **Per-package tool versions.** The hooks resolve a single set of tools from the
  root `node_modules` rather than a different version per workspace.
- **Separate hooks per workspace package.** Hooks are wired once at the Git root,
  not per package.

If your repository needs per-package enforcement with different configs or tool
versions, run those checks directly in CI for each package in addition to the
root-level advisory hooks.

## Tips

- If a peer tool is not hoisted to the root (some strict workspace layouts avoid
  hoisting), install it at the repository root so the hooks can resolve it.
- Run `npx commitment-issues doctor` from the root to verify the hook wiring.

See the [FAQ](faq.md) and [Configuration and Behavior](configuration.md) docs for
more detail on the check behavior and CI enforcement.
