# Compatibility and installation support

This page is the canonical environment support boundary for
`commitment-issues`. “CI-verified” means a required pull-request job installs
the packed package and exercises its real CLI, native Git hooks, workspaces,
clone repair, linked worktrees, and removal. “Locally verified” records useful
additional evidence but is not a required cross-platform gate. “Unverified” is
not an affirmative compatibility claim.

## Package managers

| Manager or mode                            | Support                        | Required evidence                                                                                  |
| ------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| npm                                        | Supported                      | Packed lifecycle on Ubuntu, macOS, and Windows with Node 22.11.0 and 24                            |
| pnpm 10                                    | Supported                      | Packed lifecycle on all three OSes with Node 24 and on Ubuntu with Node 22.11.0                    |
| Yarn Classic 1.22.22                       | Supported                      | Packed lifecycle on all three OSes with Node 24 and on Ubuntu with Node 22.11.0                    |
| Bun 1.3.14                                 | Supported                      | Packed lifecycle on all three OSes with Node 24 and on Ubuntu with Node 22.11.0                    |
| Yarn Berry with `nodeLinker: node-modules` | Provisional, not yet supported | Dedicated evidence is tracked in [#100](https://github.com/RoryGlenn/commitment-issues/issues/100) |
| Yarn Plug'n'Play                           | Unsupported                    | The hook and peer-tool design requires a root `node_modules/.bin` tree                             |
| Other package managers                     | Unsupported                    | No install, lockfile, runner, hint, or lifecycle contract                                          |

Install the package and its peer tools locally. The baseline peer versions work
at the exact minimum Node release:

```bash
# npm
npm install -D commitment-issues eslint@^9 prettier@^3
npx --no-install commitment-issues init

# pnpm
pnpm add -D commitment-issues eslint@^9 prettier@^3
pnpm exec commitment-issues init

# Yarn Classic
yarn add -D commitment-issues eslint@^9 prettier@^3
yarn run commitment-issues init

# Bun
bun add --dev commitment-issues eslint@^9 prettier@^3
bunx --no-install commitment-issues init
```

At a workspace root, pnpm additionally needs `--workspace-root` and Yarn
Classic needs `--ignore-workspace-root-check`. The
[monorepo guide](monorepo.md) shows those exact commands.

Global installation and a registry-downloading one-shot runner are not
supported. Generated hooks deliberately invoke
`node_modules/.bin/commitment-issues` and self-neutralize when that project-local
entry is gone; they never fall through to a global binary.

## Install and lifecycle modes

| Mode                                      | Boundary and evidence                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Clean local install                       | Supported from the packed tarball with each manager above                                                                                 |
| Manager-native CLI                        | Verified through `npx --no-install`, `pnpm exec`, `yarn run`, or `bunx --no-install`                                                      |
| Normal fresh-clone reinstall              | Runs the consumer-owned `prepare` repair added by `init` and recreates missing hooks                                                      |
| Install with lifecycle scripts disabled   | Installs the CLI but intentionally does not repair clone-local hooks; run the local `doctor` command or reinstall with scripts enabled    |
| Re-initialization and same-version repair | Supported and idempotent                                                                                                                  |
| Forward cross-version upgrade             | Supported from pinned immutable v2.5.1, v3.2.0, and v3.3.2 fixtures when the new version's `init` is run                                  |
| In-place downgrade                        | Unsupported; older versions do not perform reverse migrations                                                                             |
| Manual rollback                           | Documented cleanup-and-reinstall path using current `uninstall`, a pinned target manifest/lockfile and peers, then target `init`/`doctor` |
| Uninstall                                 | The CLI removes exact owned setup, then the selected manager removes the package while preserving the lockfile                            |
| Root-owned workspaces                     | Supported for the default npm, pnpm, Yarn Classic, and Bun layouts in the [monorepo guide](monorepo.md)                                   |
| Global install                            | Unsupported; the product contract is project-local                                                                                        |

The package itself declares no dependency install lifecycle script. `init`
adds or composes `commitment-issues doctor --quiet` in the consuming project's
`prepare` script so normal installs can repair that repository's clone-local
hooks. Projects that disable scripts retain an explicit, local recovery path
without executing package code during dependency installation.

Cross-version evidence downloads only immutable release artifacts whose
SHA-256 values are pinned in the
[release audit](audits/release-packaging-and-upgrades.md#pinned-upgrade-fixtures).
The required pull-request boundary is npm on Ubuntu/Node 24. A read-only release
candidate job reruns that npm migration against the exact tarball, then hands
the artifact and its hash to the separate OIDC-enabled publish job. Weekly
repository health exercises pnpm 10, Yarn Classic 1.22.22, and Bun 1.3.14.
Every path preserves project-owned `prepare` logic and custom hooks, while
changing exact generated artifacts only.

The [migration guide](migration.md#downgrades-and-manual-rollback) defines the
manual rollback procedure. It is an explicit recovery path, not support for
installing an older package over a newer configured repository.

## Node.js and peer tools

`package.json` requires Node.js `>=22.11.0`. The exact minimum and Node 24 are
required CI lanes. A local macOS audit also exercises Node 26; versions not
named here are admitted by the minimum engine range but do not have a separate
evidence claim. A lenient package manager that launches the CLI below the
minimum receives a direct version diagnostic before command dispatch.

The cross-version migration lane uses Node 24 because the pinned v2.5.1 and
v3.2.0 starting releases declared a higher `>=22.22.1` floor. Their historical
floor does not narrow the current package's Node 22.11.0 support.

ESLint 9 and 10 are the supported peer majors, and Prettier 3 is the supported
formatter major. The baseline install commands select ESLint 9 because it works
at Node 22.11.0. ESLint 10 is exercised on Node 24 and newer lanes and remains
subject to ESLint's own Node engine. The package has no TypeScript build or
compiler target: TypeScript support means file discovery followed by the
consumer's TypeScript-aware ESLint configuration.

The production package is native ESM JavaScript with no transpilation. Its
three runtime dependencies (`boxen`, `cross-spawn`, and `picocolors`) all have
Node requirements below this package's declared floor.

## Operating systems, shells, and Git clients

| Environment                                   | Evidence level       | Boundary                                                                            |
| --------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| Ubuntu, macOS, Windows                        | CI-verified          | npm at Node 22.11.0/24; pnpm, Yarn Classic, and Bun at Node 24                      |
| POSIX `sh` and Git for Windows' bundled shell | CI-verified          | These execute the generated `#!/bin/sh` hooks during real commits and pushes        |
| Bash                                          | CI launcher evidence | Linux/macOS Actions launch the suite; the hook itself still uses `sh`               |
| PowerShell                                    | CI launcher evidence | Windows Actions launch the full suite; Git executes hooks through its bundled shell |
| Zsh                                           | Locally verified     | Full packed npm lifecycle on macOS                                                  |
| Fish and direct Command Prompt launch         | Unverified           | No blanket compatibility claim                                                      |
| VS Code, JetBrains IDEs, GitHub Desktop       | Unverified           | Node and the local bin must be reachable in the environment inherited by Git        |

Dedicated shell and GUI Git-client evidence remains tracked in
[#83](https://github.com/RoryGlenn/commitment-issues/issues/83). Until that work
closes, the project does not claim blanket Fish, Command Prompt, VS Code,
JetBrains, or GitHub Desktop compatibility.
