# Monorepo & Workspaces Guide

This guide covers the supported contract for using `commitment-issues` in a
monorepo or workspace-based repository with npm, pnpm, Yarn, or Bun.

## The short version

Install and initialize `commitment-issues` **once at the Git and workspace
root**. The Git hooks run from that root and check staged files across every
workspace package using one root configuration.

```bash
# from the repository root
npm install -D commitment-issues eslint prettier
npx commitment-issues init
```

## How it works in a monorepo today

`commitment-issues` treats the repository as a single unit rooted at the Git
root:

- **Hooks belong to the Git repository.** `init` writes `pre-commit` and
  `pre-push` in Git's common hooks directory, plus the optional `commit-msg`
  hook when enabled, so they run once for the whole repository. A linked Git
  worktree shares those hooks with the primary checkout.
- **Staged files are checked across all packages.** The pre-commit check reads
  staged paths with `git diff --cached` relative to the repo root, so changes in
  any workspace package are included together.
- **Configuration is read from the repository root.** Use root
  `.commitmentrc.json` and/or root `package.json` `precommitChecks`; individual
  workspace package configuration is not discovered.
- **Tools resolve locally from the root `node_modules`.** Install
  `commitment-issues`, ESLint, Prettier, and optional commitlint as root
  development dependencies. Hooks read peer-tool package bins directly and
  resolve the package CLI and optional commitlint through the root
  `node_modules/.bin` tree. This works with the managers' default
  `node_modules` layouts, including linked or isolated workspace installs;
  package-local tool installs are not searched.

## Tested compatibility contract

The lifecycle integration suite packs the real package and exercises this
workspace layout with every supported manager:

```text
package.json
packages/
  app/
    package.json
    src/ (source and test)
    scripts/ (workspace test command)
  nested/
    lib/
      package.json
      src/ (source and test)
      scripts/ (workspace test command)
```

| Manager | Workspace metadata exercised                 | Install layout covered                      |
| ------- | -------------------------------------------- | ------------------------------------------- |
| npm     | root `package.json#workspaces`               | npm's default root `node_modules` layout    |
| pnpm    | root `workspaces` plus `pnpm-workspace.yaml` | pnpm's default linked `node_modules` layout |
| Yarn    | root `package.json#workspaces`               | Yarn Classic's default hoisted layout       |
| Bun     | root `package.json#workspaces`               | Bun's default workspace layout              |

For each manager, the suite installs the packed package at the root, runs
both packages' test scripts through the manager's own workspace selector, runs
`init`, commits staged source and test files from both workspace depths, pushes
to a bare remote, repairs hooks during a fresh-clone install, and commits from a
nested package in a linked Git worktree. The nested packages carry conflicting
`precommitChecks` values to verify that only the root configuration is used.

The table above is the tested compatibility baseline. Other workspace globs and
custom hoisting settings may work when they preserve the same two invariants:
the Git/workspace root owns the configuration, and the required binaries exist
in its root `node_modules` tree. They are not blanket guarantees; report a
specific layout that violates those invariants as a focused compatibility
issue.

## Recommended setup

1. Install `commitment-issues` and the peer tools at the repository root, not
   inside an individual workspace package.
2. Run `npx commitment-issues init` from the root.
3. Keep a root-level ESLint flat config. Use its `files` patterns to scope rules
   to specific packages when needed.
4. Set the root `.commitmentrc.json` or root `package.json` `precommitChecks` to
   match how you want the whole repository checked.
5. If commit-message linting is enabled, install commitlint and keep its config
   at the root; per-workspace commitlint resolution is not attempted.

For pnpm, use the workspace-root flag when adding the tools:

```bash
pnpm add --save-dev --workspace-root commitment-issues eslint prettier
```

For Yarn Classic, acknowledge the root install explicitly:

```bash
yarn add --dev --ignore-workspace-root-check commitment-issues eslint prettier
```

## Scoping checks per package

Because configuration is root-level, use the tools' own path scoping:

- **ESLint flat config** can apply different rules per package with `files`
  globs.
- **`precommitChecks.testExempt`** accepts globs, so you can exempt packages or
  paths from the missing-test check (for example, `packages/legacy/**`).
- **`precommitChecks.testCommand`** sets the runner used for staged and pushed
  tests across the repository.

## Related-test selection

Each workspace should have its own `package.json`; the closest parent
`package.json` defines the package boundary for a changed source file. Test
lookup uses the first non-empty tier below:

1. sibling tests and the source directory's `__tests__/` directory;
2. the source path mirrored under the package's `test/` or `tests/` directory
   (for example, `packages/a/src/api.mjs` →
   `packages/a/test/src/api.test.mjs`);
3. the same package-local path with a leading `src/` or `lib/` removed (for
   example, `packages/a/src/api.mjs` →
   `packages/a/test/api.test.mjs`);
4. only for the root package, the legacy `test/<basename>` or
   `tests/<basename>` fallback.

All existing `.test.*` and `.spec.*` candidates in the winning tier run in a
stable order. Lower tiers are ignored once a more specific tier matches. This
means `packages/a/src/index.mjs` and `packages/b/src/index.mjs` cannot silently
select each other's test, and a root `test/index.test.mjs` cannot steal the
selection from either workspace.

This focused related-test isolation complements the tested root-owned lifecycle
contract above. It does not add per-package configuration, per-package tool
versions, or separate hooks; those boundaries below are unchanged.

## Linked Git worktrees

Linked worktrees share the primary repository's native hooks because Git stores
them in the common Git directory. Dependencies do not automatically carry over
to another worktree, so run your package manager's normal install in each
worktree. The root `prepare` repair is safe to re-run and verifies the shared
hook wiring.

## Boundary: what is not supported

The following are outside the current design:

- **Per-package configuration.** Only the root standalone/package configuration
  is read.
- **Per-package tool versions.** The hooks resolve a single set of tools from the
  root `node_modules` rather than a different version per workspace.
- **Separate hooks per workspace package.** Hooks are wired once at the Git root,
  not per package.
- **Yarn Plug'n'Play.** Yarn Berry must use `nodeLinker: node-modules`; see the
  [Yarn Berry guide](yarn-berry.md).
- **Cross-package dependency-graph scheduling.** Related tests are selected from
  changed paths; the hook does not infer build-system or task-runner graphs.
- **An exhaustive custom-layout matrix.** The tested defaults above are the
  compatibility contract. Add a focused fixture when a real layout exposes a
  reproducible gap instead of growing an open-ended matrix speculatively.

If your repository needs per-package enforcement with different configs or tool
versions, run those checks directly in CI for each package in addition to the
root-level advisory hooks.

## Tips

- If a custom no-hoist or isolated layout does not expose a root binary, add the
  tool as a root development dependency or run that package-specific check in
  CI.
- Run `npx commitment-issues doctor` from the root to verify the hook wiring.
- Keep a `package.json` at every workspace root so related-test lookup can stop
  at the intended package boundary.

See the [FAQ](faq.md) and [Configuration and Behavior](configuration.md) docs for
more detail on the check behavior and CI enforcement.
