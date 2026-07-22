# Semantic context gateway

The semantic context gateway gives Codex and Claude the same small,
evidence-backed view of this repository. It compiles the current semantic
project graph, resolves exact focus nodes, applies deterministic limits, and
returns one versioned JSON envelope. Both host adapters call the same process;
the model name does not affect graph selection.

This is repository-only maintainer tooling. It stays local, sends no telemetry,
does not run in Commitment Issues Git hooks, and is excluded from the npm
package.

## What happens in a session

Project hook configuration lives in [`.codex/hooks.json`](../.codex/hooks.json)
and [`.claude/settings.json`](../.claude/settings.json). After the user trusts
the repository and its hook configuration as described by the official
[Codex hook](https://learn.chatgpt.com/docs/hooks) and
[Claude Code hook](https://code.claude.com/docs/en/hooks) contracts:

1. `SessionStart` compiles a stable observed graph and injects a depth-zero
   index of all declared product capabilities.
2. `UserPromptSubmit` injects a depth-two neighborhood only when the prompt
   contains an exact semantic marker such as `[[semantic:prepush]]` or an exact
   backticked node identifier, label, or path already present in the graph.
3. The adapter writes the same `hookSpecificOutput.additionalContext` shape for
   either host. The delimited JSON is explicitly labeled as untrusted data.
4. After stdout is written, the adapter atomically records the latest local
   delivery receipt below Git's common directory.

There is no fuzzy prompt matching. An ordinary prompt with no exact focus
produces no prompt hook output and consumes no graph context. Identifiers and
labels are case-sensitive. A path shared by multiple graph node kinds is
reported as ambiguous; use a stable node identifier to disambiguate it.

The semantic context policy lives directly in [`AGENTS.md`](../AGENTS.md).
Claude reads [`CLAUDE.md`](../CLAUDE.md), which imports `AGENTS.md`; Codex reads
`AGENTS.md` directly. Both hosts therefore load the same policy text rather
than depending on a model to follow a Markdown link.

## Manual commands

Run these commands from anywhere inside the repository:

```sh
npm run semantic:context -- --focus prepush --json
npm run semantic:context -- --focus command:prepush --focus module:scripts/prepush.mjs --depth 1
npm run semantic:receipt
npm run semantic:receipt -- --json
```

The context command always rebuilds from current tracked, staged, and tracked
worktree content. It compares the source fingerprint before and after graph
compilation, retries concurrent drift, and fails unavailable if the checkout
does not stabilize. It never presents the optional graph cache as current
without recompiling.

## Protocol and limits

[`semantic-context.schema.json`](semantic-context.schema.json) defines the
version-one context and receipt contracts. A context envelope contains:

- current `HEAD`, dirty state, and semantic source fingerprint;
- requested and resolved focus identifiers;
- selected public node and evidence-bearing edge fields;
- explicit `complete`, `truncated`, `ambiguous`, or `unavailable` status;
- selected-file and selected-byte measurements; and
- a SHA-256 digest over the payload before the integrity field is added.

Default manual limits are depth two, 40 selected files, 400,000 selected source
bytes, and 9,000 serialized context bytes. Host delivery uses at most 30 files,
400,000 selected source bytes, a 2,300-byte inner-envelope target, a hard
2,400-byte cap for model-visible additional context, and a 3,000-byte cap for
the complete serialized hook response, including unavailable fallbacks. Each
model token represents at least one encoded byte, so the model-visible byte cap
also keeps the token count below Codex's approximate 2,500-token large-output
boundary. Selection order is stable: nearest nodes first, then semantic kind,
then stable node identifier. Every edge between selected nodes is retained.
When any configured limit omits candidates, the status is `truncated`; the
gateway never labels a partial result complete.

These byte measurements make context use inspectable. They do not promise a
fixed token reduction because tokenization and the model's other session
context vary by host and model.

### Recorded repository baseline

On 2026-07-21, the working maintainer checkout contained 697 graph nodes and
1,719 edges. Independent Codex and Claude `SessionStart` runs each selected the
depth-zero capability index: zero source files and zero source bytes because
capability nodes contain metadata rather than file contents. Each emitted
2,294 model-visible bytes inside a 2,602-byte complete host response with
`complete` status in about 0.69 seconds on the same macOS host. Both runs
carried the same non-null source fingerprint and context digest. This is a
local payload/overhead observation, not a timing gate or token-savings
guarantee.

## Delivery receipts and the honesty boundary

The latest receipt is stored at
`<git-common-dir>/commitment-issues/semantic-context-receipt-v1.json`. Linked
worktrees share it. The file records the adapter, hook event, hashed session
identifier, source fingerprint, resolved focuses, context digest and status,
selected files and bytes, total emitted bytes, and timestamp. It contains no
prompt text and no repository content.

A receipt with `outcome: emitted-to-host` proves that the adapter wrote those
bytes to the host process pipe. Equal source fingerprints, focus identifiers,
and context digests from separate Codex and Claude runs prove that both adapters
emitted identical normalized graph payloads. No local mechanism can prove that
a language model understood, remembered, or obeyed context. Tests and review
remain authoritative.

Receipts are local observations, not canonical state. Writes use a temporary
file plus atomic rename and reject linked or non-regular destination paths. A
receipt failure is reported on stderr but does not turn successfully emitted
context into a false failure claim.

## Trust and compatibility

Project-local agent hooks execute repository code. Review the configuration
before trusting it. Codex requires a trusted project layer for `.codex` hooks;
Claude similarly asks users to approve project hook execution. The checked-in
commands pass only fixed adapter arguments and resolve the repository root
without interpolating prompt or graph data into a shell command.

The adapters require Node.js `>=22.11.0`, Git, Codex hook support, and Claude
Code `>=2.0.12`, which supports `UserPromptSubmit` additional context. The
Claude configuration deliberately uses the older shell-form command contract
instead of the exec-form `args` field added in Claude Code 2.1.139. If a host
does not support or allow the hooks, agents fall back to ordinary repository
inspection and must not claim a delivery receipt exists.
