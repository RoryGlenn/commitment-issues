# Yarn Berry Guide

This guide describes the provisional setup for using `commitment-issues` with
**Yarn Berry** (Yarn 2 and later). Required CI currently verifies Yarn Classic;
dedicated Berry `node-modules` evidence remains tracked in
[#100](https://github.com/RoryGlenn/commitment-issues/issues/100). Until that
issue closes, this guide is compatibility guidance rather than an affirmative
support claim.

## The short version

The expected compatible mode uses Yarn Berry's `node-modules` linker:

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

1. Tell Yarn Berry to use the traditional linker. Create or edit
   `.yarnrc.yml` in your project root:

   ```yaml
   nodeLinker: node-modules
   ```

2. Reinstall so Yarn writes a real `node_modules` tree:

   ```bash
   yarn install
   ```

3. Add `commitment-issues` and the peer tools it runs:

   ```bash
   yarn add -D commitment-issues eslint@^9 prettier@^3
   ```

4. Run the initializer:

   ```bash
   yarn commitment-issues init
   ```

5. Commit and push normally. The hook entrypoint and peer tools resolve from the
   local `node_modules` tree, just like in an npm or pnpm project. Report a
   reproducible Berry-specific gap on #100 while the mode remains provisional.

If you enable optional commit-message linting, also add `@commitlint/cli` and
your chosen config package at the project root. That integration follows the
same `node_modules/.bin` requirement and has no PnP/global/npx fallback.

## Verifying the setup

- Confirm a `node_modules` directory exists at the project root.
- Confirm `node_modules/.bin/commitment-issues` is present.
- Run `yarn commitment-issues doctor` to check the hook wiring.

## If you must use Plug'n'Play

There is no supported path for running the hooks under PnP today. If your
repository requires PnP, the practical options are:

- Run your lint, format, and test commands directly in CI instead of relying on
  local Git hooks.
- Keep `commitment-issues` for developer machines that use the `node-modules`
  linker while enforcing checks in CI for everyone.

See the [FAQ](faq.md) and [Configuration and Behavior](configuration.md) docs
for the CI-side enforcement details.
