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
- `commit-msg <message-file>` (normally invoked by Git's commit-msg hook)
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
npx commitment-issues precommit --json
npx commitment-issues prepush
npx commitment-issues prepush --json
npx commitment-issues commit-msg .git/COMMIT_EDITMSG
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
- exact generated native pre-commit, pre-push, and optional commit-msg hook bodies

Customized hooks and scripts are preserved and reported for manual cleanup.
Shared `.gitignore` entries, ESLint/Prettier dependencies, the
`commitment-issues` dependency, and lockfiles are preserved. Run the package
manager's remove command after `uninstall` completes.

## Git hook interface

`init` writes plain `.git/hooks` files that call the installed binary:

- pre-commit hook -> `commitment-issues precommit`
- pre-push hook -> `commitment-issues prepush`
- commit-msg hook, only when enabled -> `commitment-issues commit-msg "$1"`

The hooks honor `COMMITMENT_ISSUES=0` (and the pre-3.0 `HUSKY=0`) as a skip,
and exit silently when the binary is no longer installed.

The package does not copy source files into a consumer repository.

## Configuration interface

All configuration lives under `precommitChecks` in `package.json`.

| Key                      | Type                    | Default              | Effect                                                                           |
| ------------------------ | ----------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `testExempt`             | string[]                | `[]`                 | Extra glob exemptions for missing-test checks.                                   |
| `requireTests`           | boolean                 | `true`               | Turns missing-test advisories on or off.                                         |
| `runStagedTests`         | boolean                 | `false`              | Runs related tests during `git commit`.                                          |
| `advisePushTests`        | boolean                 | `true` after `init`  | Runs related tests during `git push` in advisory mode.                           |
| `blockPushOnTestFailure` | boolean                 | `false`              | Blocks pushes when related pushed-file tests fail.                               |
| `testCommand`            | string[]                | `["node", "--test"]` | Verbatim command used to run related tests; must accept file paths.              |
| `timeoutMs`              | number                  | `120000`             | Timeout for a command and its attached process tree; maximum `2,147,483,647` ms. |
| `tone`                   | `"standard"` or `"fun"` | `"standard"`         | Advisory message tone.                                                           |
| `commitMessage`          | object                  | disabled             | Optional project-local commitlint settings described below.                      |

`commitMessage` accepts exactly two optional boolean keys:

- `enabled` (default `false`) creates/repairs the commit-msg hook and invokes
  project-local commitlint.
- `blockOnFailure` (default `false`) changes lint and setup failures from an
  advisory warning into a blocked commit.

The integration only resolves `node_modules/.bin/commitlint`; it never invokes
implicit `npx`, a global binary, or the network. The consuming project must
install `@commitlint/cli` and provide its own commitlint config/rules. No
Conventional Commits policy is built into this package.

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

## Output interface

The tool prints compact terminal boxes with clear status and next steps:

- advisory warnings for commit-time issues by default
- advisory warnings for push-time test failures by default
- advisory commit-message findings after the optional integration is enabled
- optional enforcement when explicitly configured

For concrete output states and screenshots, see
[Message states](message-states.md).

`precommit --json` and `prepush --json` replace terminal boxes on stdout with a
single versioned payload. The schema, field semantics, stderr behavior, and
examples are documented in [JSON output](json-output.md). Other subcommands do
not support `--json`.

## Exit behavior

- Default commit and push flows are advisory-first and non-blocking.
- Blocking behavior is opt-in via `precommitChecks`, including the nested
  `commitMessage.blockOnFailure` switch.
- Fix commands can fail non-zero when safety checks fail or manual fixes remain.
- JSON mode reports the same exit code in its `exitCode` field and does not
  change whether an advisory or enforcement result blocks.
- Missing ESLint/Prettier peers are advisory in hooks and never invoke an
  implicit `npx` fallback; fix commands fail nonzero and print an install hint.
- Configured test commands are executed verbatim, including an explicitly
  selected `npx` command.
