# JSON output

`precommit` and `prepush` support an opt-in, machine-readable result:

```bash
npx commitment-issues precommit --json
npx commitment-issues prepush --json
```

These are the only commands with a JSON contract. Without `--json`, every
command keeps its human terminal output policy. `hookOutput` only controls
human hook boxes and never changes this JSON contract.

## Output contract

JSON mode writes exactly one JSON document followed by a newline to stdout. It
does not render terminal boxes or progress lines there. Pre-push test-runner
output can be arbitrarily large and tool-specific, so it is relayed to stderr
and summarized in the payload instead. Configuration warnings become entries
in `diagnostics`. A pre-commit JSON run also leaves the once-per-clone welcome
unconsumed; the next eligible human-readable run can still display it.

The normative version 1 definition is
[`json-output.schema.json`](json-output.schema.json). Every payload contains:

| Field           | Meaning                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `schemaVersion` | Contract version. Breaking field or semantic changes increment this value.            |
| `command`       | `precommit` or `prepush`.                                                             |
| `mode`          | Effective posture: `advisory`, `blocking`, or `disabled`.                             |
| `status`        | Overall result: `clean`, `advisory`, `blocked`, `skipped`, or `error`.                |
| `exitCode`      | The process exit code. It is unchanged from the equivalent human-mode invocation.     |
| `summary`       | A concise description for logs; automation should branch on the fields above.         |
| `checks`        | Checks attempted, with stable IDs, statuses, summaries, and command-specific details. |
| `findings`      | Structured advisory or blocking findings.                                             |
| `suggestions`   | Safe follow-up commands the human output would recommend, when one can be verified.   |
| `diagnostics`   | Configuration or argument diagnostics that are separate from repository findings.     |

Check `details` are intentionally command-specific. Consumers should use the
top-level contract and each check's `id` and `status` as the stable control
surface. New check IDs and new keys inside `details` may be added without a
schema-version change. Consumers should ignore checks they do not recognize.
The `check` field on a finding is its broad category (for example, `format` or
`tests`), not a foreign key to one specific check entry.

Example advisory result (abridged):

```json
{
  "schemaVersion": 1,
  "command": "precommit",
  "mode": "advisory",
  "status": "advisory",
  "exitCode": 0,
  "summary": "1 pre-commit finding; commit allowed",
  "checks": [
    {
      "id": "prettier",
      "status": "advisory",
      "summary": "1 Prettier finding",
      "details": {
        "files": ["src/example.js", "src/other.js"],
        "status": 1,
        "signal": null
      }
    }
  ],
  "findings": [
    {
      "check": "format",
      "severity": "warning",
      "message": "2 files need Prettier formatting",
      "autoFixable": true,
      "details": ["src/example.js", "src/other.js"]
    }
  ],
  "suggestions": [
    {
      "command": "npm run commit:fix",
      "description": "Apply automatic fixes and safely amend the latest commit"
    }
  ],
  "diagnostics": []
}
```

## Status and exit codes

- `clean`: applicable checks completed without findings.
- `advisory`: findings exist, but the commit or push remains allowed and exits
  `0`.
- `blocked`: an explicitly enabled enforcement policy blocked the operation and
  exits non-zero, just as human mode does.
- `skipped`: there was nothing applicable to run, or pre-push tests are
  disabled.
- `error`: the JSON-mode invocation itself was invalid.

The version 1 contract does not turn advisory results into failures. Automation
that wants to enforce advisories can inspect `status` or `findings` itself.

## Pre-push hook arguments

Git may pass a remote name and URL to a pre-push hook. JSON mode accepts those
two positional arguments and the flag in either order:

```bash
commitment-issues prepush origin https://example.invalid/repo.git --json
commitment-issues prepush --json origin https://example.invalid/repo.git
```

The pushed-ref list still comes from stdin. Duplicate `--json`, valued forms
such as `--json=pretty`, unknown options, or extra positional arguments produce
a version 1 payload with a `status` of `error` and exit `1`.
