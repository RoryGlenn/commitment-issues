# Yarn Berry Guide

This guide covers using `commitment-issues` with **Yarn Berry** (Yarn 2 and
later).

## The short version

`commitment-issues` works with Yarn Berry when the project uses the
`node-modules` linker:

```yaml
# .yarnrc.yml
nodeLinker: node-modules
```

Plug'n'Play (`nodeLinker: pnp`, the Yarn Berry default) is **not supported**.

## Why Plug'n'Play is not supported

The Git hooks that `commitment-issues` installs run the `commitment-issues`
binary from `node_modules/.bin`, and lint-staged shells out to `eslint` and
`prettier` the same way. Under Plug'n'Play there is no `node_modules` directory
and no `.bin` folder — Yarn resolves dependencies through its `.pnp.cjs` runtime
instead. That means the hook entry points cannot find the binaries they expect.

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
   yarn add -D commitment-issues husky lint-staged eslint prettier
   ```

4. Run the initializer:

   ```bash
   yarn commitment-issues init
   ```

5. Commit and push normally. The hooks resolve their binaries from
   `node_modules/.bin`, just like in an npm or pnpm project.

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
