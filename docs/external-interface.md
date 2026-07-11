# External Interface Reference

This page documents the public interface of `commitment-issues`: CLI commands,
`init`-added scripts, Git hook entrypoints, configuration keys, defaults, and
high-level output behavior.

For install and quick usage, see the [README](../README.md).

## CLI commands

`commitment-issues` exposes these subcommands:

- `init`
- `uninstall`
- `doctor`
- `precommit`
- `prepush`
- `commit-fix`
- `fix-staged`
- `fix-staged-js`
- `--version` and `-v`

Examples:

```bash
npx commitment-issues init
npx commitment-issues uninstall --dry-run
npx commitment-issues uninstall
npx commitment-issues doctor
npx commitment-issues precommit
npx commitment-issues prepush
npx commitment-issues --version
```

## Scripts added by `init`

`init` wires common scripts in `package.json`:

- `doctor` -> verifies and repairs hook wiring
- `fix:staged` -> runs staged-file fixes
- `commit:fix` -> applies safe automatic fixes and amends the latest clean,
  unpushed commit
- `test:precommit` -> runs pre-commit checks directly

## Setup removed by `uninstall`

`uninstall` removes only setup it can identify safely:

- exact generated package scripts
- the `precommitChecks` configuration block
- a valid `.commitmentrc.json` standalone configuration file
- exact generated native pre-commit and pre-push hook bodies

Customized hooks and scripts are preserved and reported for manual cleanup.
Shared `.gitignore` entries, ESLint/Prettier dependencies, the
`commitment-issues` dependency, and lockfiles are preserved. Run the package
manager's remove command after `uninstall` completes.

## Git hook interface

`init` writes plain `.git/hooks` files that call the installed binary:

- pre-commit hook -> `commitment-issues precommit`
- pre-push hook -> `commitment-issues prepush`

The hooks honor `COMMITMENT_ISSUES=0` (and the pre-3.0 `HUSKY=0`) as a skip,
and exit silently when the binary is no longer installed.

The package does not copy source files into a consumer repository.

## Configuration interface

Configuration is accepted from two dependency-free JSON sources at the project
root:

- `.commitmentrc.json`: options are direct top-level keys
- `package.json`: options remain under `precommitChecks` for backward
  compatibility

The sources are shallowly merged. A key in `.commitmentrc.json` overrides the
same key in `package.json`; other package keys remain active, and built-in
defaults fill anything absent from both. Arrays replace lower-precedence arrays.
No JavaScript config file is discovered or executed.

A malformed standalone file is ignored by hook-time reads with an advisory
warning and `package.json` fallback. `init` and `uninstall` reject it before
mutation. If a valid standalone file already exists, `init` puts its generated
advisory push default there; otherwise its existing `package.json` behavior is
unchanged.

| Key                      | Type                    | Default              | Effect                                                     |
| ------------------------ | ----------------------- | -------------------- | ---------------------------------------------------------- |
| `testExempt`             | string[]                | `[]`                 | Extra glob exemptions for missing-test checks.             |
| `requireTests`           | boolean                 | `true`               | Turns missing-test advisories on or off.                   |
| `runStagedTests`         | boolean                 | `false`              | Runs related tests during `git commit`.                    |
| `advisePushTests`        | boolean                 | `true` after `init`  | Runs related tests during `git push` in advisory mode.     |
| `blockPushOnTestFailure` | boolean                 | `false`              | Blocks pushes when related pushed-file tests fail.         |
| `testCommand`            | string[]                | `["node", "--test"]` | Command used to run related tests. Must accept file paths. |
| `timeoutMs`              | number                  | `120000`             | Timeout for spawned tools.                                 |
| `tone`                   | `"standard"` or `"fun"` | `"standard"`         | Advisory message tone.                                     |

Example:

```json
{
  "precommitChecks": {
    "runStagedTests": true,
    "blockPushOnTestFailure": true,
    "testCommand": ["node", "--test"],
    "testExempt": ["src/legacy/**"],
    "tone": "standard"
  }
}
```

Equivalent `.commitmentrc.json`:

```json
{
  "runStagedTests": true,
  "blockPushOnTestFailure": true,
  "testCommand": ["node", "--test"],
  "testExempt": ["src/legacy/**"],
  "tone": "standard"
}
```

## Output interface

The tool prints compact terminal boxes with clear status and next steps:

- advisory warnings for commit-time issues by default
- advisory warnings for push-time test failures by default
- optional enforcement when explicitly configured

For concrete output states and screenshots, see
[Message states](message-states.md).

## Exit behavior

- Default commit and push flows are advisory-first and non-blocking.
- Blocking behavior is opt-in through either configuration source.
- Fix commands can fail non-zero when safety checks fail or manual fixes remain.
