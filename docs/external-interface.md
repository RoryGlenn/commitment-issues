# External Interface Reference

This page is the compatibility contract for public commands, generated scripts,
Git hook entrypoints, output modes, and exit behavior. Configuration keys,
types, defaults, and validation rules are maintained once in
[Configuration and behavior](configuration.md).

For installation and quick usage, see the [README](../README.md).

## CLI commands

`commitment-issues` exposes these public commands and version flags:

- `init`
- `uninstall`
- `doctor`
- `precommit`
- `prepush`
- `commit-msg <message-file>` (normally invoked by Git)
- `commit-fix`
- `fix-staged`
- `fix-staged-js`
- `--version` and `-v`

Examples:

```bash
npx commitment-issues init
npx commitment-issues uninstall --dry-run
npx commitment-issues doctor
npx commitment-issues precommit --json
npx commitment-issues prepush --json
npx commitment-issues commit-msg .git/COMMIT_EDITMSG
npx commitment-issues --version
```

### Arguments and options

The public argument contract is deliberately small:

| Command                    | Accepted arguments                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| global                     | `--help`/`-h`, `--version`/`-v`                                       |
| `init`, `uninstall`        | optional `--dry-run` or `-n`                                          |
| `doctor`                   | optional `--quiet`                                                    |
| `precommit`                | optional `--json`                                                     |
| `prepush`                  | up to the remote name and URL supplied by Git, plus optional `--json` |
| `commit-msg`               | the message-file path supplied by Git                                 |
| `commit-fix`, `fix-staged` | no arguments                                                          |
| `fix-staged-js`            | zero or more explicit file paths                                      |

Unknown options and excess positional arguments exit nonzero. Setup, removal,
and doctor validate their arguments before changing project files or hooks, so
a misspelled `--dry-run` or `--quiet` cannot silently perform another action.

Setup and hook-health commands expect the project root of a non-bare Git
working tree. Bare repositories do not run this package's local commit or push
workflow and are not reported as having active hooks.

Detached HEAD intentionally has no protected branch identity, so the
protected-branch guard does not fire in that state. File, secret, size,
generated-file, lint, format, and related-test checks continue normally.

## Scripts added by `init`

`init` wires these common scripts in the consuming `package.json`:

- `doctor` verifies and repairs hook wiring.
- `fix:staged` runs staged-file fixes.
- `commit:fix` applies safe automatic fixes and amends the latest clean,
  unpushed commit.
- `test:precommit` runs pre-commit checks directly.

## Setup removed by `uninstall`

`uninstall` removes only setup it can identify safely:

- exact generated package scripts;
- the `precommitChecks` configuration block;
- a valid `.commitmentrc.json` standalone configuration file; and
- exact generated pre-commit, pre-push, and optional commit-msg hook bodies.

Customized hooks and scripts are preserved and reported. Shared `.gitignore`
entries, ESLint/Prettier dependencies, the package dependency, and lockfiles
remain owned by the consuming project.

Hook ownership checks do not follow symbolic links. A hook-file symlink,
dangling symlink, or symlink used as the hooks directory is preserved as
uninspectable; `init` and `doctor` report it instead of repairing through it.

## Git hook interface

`init` writes plain native hooks that call the installed binary:

- pre-commit → `commitment-issues precommit`
- pre-push → `commitment-issues prepush "$@"`
- commit-msg, when enabled → `commitment-issues commit-msg "$1"`

The hooks honor `COMMITMENT_ISSUES=0` and the pre-3.0 `HUSKY=0` compatibility
skip. They exit silently when the binary is no longer installed. The pre-push
hook forwards Git's remote name and URL for remote-specific first-push base
selection. Package source is not copied into the consumer repository.

Staged and pushed-file test commands inherit the developer's ordinary
environment, but Git's repository-local routing variables are removed first.
The command still discovers the current checkout from its working directory;
nested Git fixtures therefore cannot be redirected into the hook caller by an
inherited `GIT_DIR`, work tree, or index path.

## Configuration interface

Configuration is dependency-free JSON read from `.commitmentrc.json` and the
`precommitChecks` object in `package.json`. Standalone keys take precedence over
matching package keys; unmatched package values and built-in defaults remain
active. No JavaScript configuration file is discovered or executed.

The versioned configuration interface includes source precedence, allowlisted
keys, types, defaults, validation and fallback behavior, the test-command trust
boundary, and optional commitlint behavior. Adding or changing a key requires
updating the [configuration reference](configuration.md), runtime allowlist,
and tests together.

## Output interface

Human commands render at most one primary terminal box per invocation.
`precommit`, `prepush`, and `commit-msg` default to
`hookOutput: "problems-only"`, which suppresses final success and informational
boxes while retaining warnings and errors. `hookOutput: "normal"` restores
success and informational states without changing execution or exit behavior.

Operational commands (`init`, `uninstall`, `doctor`, and explicit fix commands)
are outside the hook-output policy. Mixed findings use the strongest final
severity.

The public
[message-state gallery](https://github.com/RoryGlenn/commitment-issues/blob/main/docs/message-states.md)
shows concrete human output. It is repository evidence rather than installed
package documentation.

`precommit --json` and `prepush --json` replace terminal boxes on stdout with a
single versioned payload. Field semantics, stderr behavior, and examples are in
[JSON output](json-output.md) and its
[versioned schema](json-output.schema.json). Other commands do not support
`--json`.

## Exit behavior

- Commit and push checks are advisory by default.
- Protected-branch, secret, push-test, and commit-message blocking require the
  corresponding explicit configuration.
- With `blockOnSecrets: true`, a detected secret and an unavailable staged-patch
  inspection both block. Git launch failures, nonzero results, and malformed
  patches have a distinct unavailable-scan terminal/JSON result; advisory mode
  warns and continues.
- Fix commands return nonzero when safety checks fail or manual work remains.
- JSON mode reports the same exit code in `exitCode`; it does not change whether
  a result blocks.
- Missing built-in peer tools are advisory in hooks and never invoke an implicit
  `npx` fallback; an explicit fix request fails when its required tool is absent.
- Configured test executables and options remain argument arrays, including an
  explicitly selected `npx` executable. Discovered paths are appended as data;
  Node `--test` paths are placed after `--`, and leading-hyphen paths are made
  absolute to prevent option interpretation.
