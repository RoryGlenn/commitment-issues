# Yarn Berry Guide

This guide describes the supported setup for using `commitment-issues` with
**Yarn Berry 4.17.0**. Required CI pins that exact release independently from
Yarn Classic 1.22.22 and runs the packed package through the same Ubuntu,
macOS, Windows, minimum-Node, workspace, Git-hook, repair, and uninstall
boundaries.

## The short version

The supported mode pins Yarn 4.17.0 and uses Berry's `node-modules` linker:

```json
{
  "packageManager": "yarn@4.17.0"
}
```

```yaml
# .yarnrc.yml
nodeLinker: node-modules
```

Plug'n'Play (`nodeLinker: pnp`, the Yarn Berry default) is **not supported**.

## Why Plug'n'Play is not supported

The Git hooks that `commitment-issues` installs run the `commitment-issues`
binary from `node_modules/.bin`, while built-in checks resolve the installed
`eslint` and `prettier` package bins directly from `node_modules`. Under
Plug'n'Play there is no `node_modules` directory or `.bin` folder — Yarn resolves
dependencies through its `.pnp.cjs` runtime instead. That means the hook entry
points and peer-tool resolver cannot find the binaries they expect.

This is a boundary of the current design, not a temporary bug. Supporting PnP
would require resolving every tool through the Yarn runtime instead of
`node_modules/.bin`.

## Setup with the node-modules linker

1. Pin the tested Yarn release in the root `package.json`:

   ```json
   {
     "packageManager": "yarn@4.17.0"
   }
   ```

2. Tell Yarn Berry to use the traditional linker. Create or edit
   `.yarnrc.yml` in your project root:

   ```yaml
   nodeLinker: node-modules
   ```

3. Reinstall so Yarn writes a real `node_modules` tree:

   ```bash
   yarn install
   ```

4. Add `commitment-issues` and the peer tools it runs:

   ```bash
   yarn add -D commitment-issues eslint@^9 prettier@^3
   ```

5. Run the initializer:

   ```bash
   yarn run commitment-issues init
   ```

6. Commit and push normally. The hook entrypoint and peer tools resolve from the
   local `node_modules` tree, just like in an npm or pnpm project.

If you enable optional commit-message linting, also add `@commitlint/cli` and
your chosen config package at the project root. That integration follows the
same `node_modules/.bin` requirement and has no PnP/global/npx fallback.

## Verifying the setup

- Confirm a `node_modules` directory exists at the project root.
- Confirm `node_modules/.bin/commitment-issues` is present.
- Run `yarn run commitment-issues doctor` to check the hook wiring.

## Fresh clones and hook repair

Yarn Berry does not support npm's `prepare` lifecycle, and Yarn 4.17.0 disables
`postinstall` scripts by default. A normal Berry install therefore restores the
local package and bin but does not claim to recreate clone-local Git hooks.
After cloning or removing `.git/hooks`, run the explicit local repair:

```bash
yarn install
yarn run commitment-issues doctor
```

The required lifecycle fixture verifies both the scripts-disabled and normal
install paths, confirms that hooks remain absent until repair, then verifies
that `doctor` recreates `pre-commit`, `commit-msg`, and `pre-push`. Do not enable
global dependency scripts solely for this repair path. See Yarn's
[lifecycle-script boundary](https://yarnpkg.com/advanced/lifecycle-scripts) and
[postinstall security default](https://yarnpkg.com/features/security) for the
manager behavior behind this difference.

## If you must use Plug'n'Play

There is no supported path for running the hooks under PnP today. If your
repository requires PnP, the practical options are:

- Run your lint, format, and test commands directly in CI instead of relying on
  local Git hooks.
- Keep `commitment-issues` for developer machines that use the `node-modules`
  linker while enforcing checks in CI for everyone.

See the [FAQ](faq.md) and [Configuration and Behavior](configuration.md) docs
for the CI-side enforcement details.
