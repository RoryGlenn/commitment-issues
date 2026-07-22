# Semantic project graph

The semantic project graph is repository-only maintainer tooling. It connects
the project's product capabilities to the commands, hooks, modules, exported
symbols, configuration keys, tests, documentation, and package files that
implement them. Focused queries let maintainers and coding agents retrieve a
small evidence-backed neighborhood instead of reading the whole repository to
rediscover the same relationships.

It does not run during ordinary commits or pushes, is not installed in the npm
package, and does not change the public product contract.

## Commands

Run the commands from the repository root after `npm ci`:

```sh
npm run semantic:build
npm run semantic:check
npm run semantic:tree -- --focus prepush
npm run semantic:impact -- scripts/lib/files.mjs
```

Add `--json` to any graph command for machine-readable output. Tree and impact
queries accept `--depth <0-8>`; the default is two relationship hops.

- `semantic:build` compiles the current graph, validates it, and writes a local
  cache below Git's common directory.
- `semantic:check` compiles the graph twice, verifies deterministic output,
  validates repository invariants, and rejects an invalid or stale cache. A
  missing cache is valid because CI and fresh clones should not need a build
  artifact checked into the worktree.
- `semantic:tree` resolves one capability, command, hook, key, file, symbol, or
  document and renders its focused neighborhood.
- `semantic:impact` renders the incoming and outgoing relationships around one
  node together with the selected file and byte counts.

The focused JSON result contains the same source identity, nodes, edges,
diagnostics, and retrieval measurement used by the human view. Callers should
request the smallest useful neighborhood instead of injecting the complete
graph into every prompt.

## Authoritative inputs

Mechanical relationships are regenerated from the repository itself:

- `package.json` command scripts and exact npm file allowlist;
- the static `COMMANDS` registry in `scripts/cli.mjs`;
- `HOOK_SUBCOMMANDS` in `scripts/lib/hooks.mjs`;
- the configuration allowlists in `scripts/lib/config.mjs`;
- JavaScript ESM imports, exports, and literal dynamic imports parsed by
  Espree;
- direct test imports and matching test filenames;
- Markdown links, inline repository paths, and explicit command/key mentions;
  and
- the small capability-intent manifest in
  `tools/semantic-capabilities.json`.

The capability manifest describes why high-level commands and hooks belong
together. It must not duplicate routine import edges or become a second
hand-maintained file inventory. `docs/index.md` remains the authority for
canonical documentation.

## Schema and trust model

The versioned output contract is
[`semantic-graph.schema.json`](semantic-graph.schema.json). Node identifiers
are stable semantic identifiers such as `command:prepush`,
`module:scripts/prepush.mjs`, and `config:requireTests`; display labels are not
identities.

Every edge includes a provenance category, file/declaration evidence, and one
certainty. Provenance identifies the responsible parser, project registry,
document, test convention, package manifest, project tool, or semantic
manifest; evidence identifies the exact source of the claim.

| Certainty       | Meaning                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `proven`        | Directly present in an authoritative static declaration or relationship |
| `tool-reported` | Reported by a supported project-local tool                              |
| `declared`      | Intentionally present in the capability manifest                        |
| `inferred`      | Derived from a documented convention such as a matching test filename   |
| `unknown`       | The relationship cannot be established safely                           |

An inferred or incomplete relationship is never upgraded to proven. Computed
dynamic imports, parser failures, unsupported source extensions, missing
targets, and ambiguous declarations produce diagnostics rather than invented
edges. Unknown relationships are useful information and do not fail the check
unless the graph makes a stronger invalid claim or violates a required
repository invariant.

## Source identity and cache

The source fingerprint covers:

- the current `HEAD` commit (or an unborn repository marker);
- Git's staged binary diff;
- Git's tracked working-tree binary diff; and
- the path, type, and current content of every tracked file.

This distinguishes repeated edits even when `git status` keeps the same shape,
and it distinguishes staged content from additional worktree changes. Deleted
and non-regular tracked paths remain part of the identity.

`semantic:build` writes the generated graph to
`<git-common-dir>/commitment-issues/semantic-graph-v1.json` through a temporary
file and atomic rename. It refuses linked or non-regular cache paths. The cache
is local, shared by linked worktrees through their common Git directory, absent
from the npm package, and never a canonical artifact. `semantic:check` rejects
it as stale whenever its fingerprint differs from a fresh build.

## Accuracy checks

The validator rejects:

- duplicate nodes, dangling edges, invalid certainty values, or missing edge
  evidence;
- stale capability members;
- public commands without dispatch, test, or documentation relationships;
- supported configuration keys without test or documentation relationships;
- package allowlist entries that are not tracked; and
- nondeterministic output from the same source identity.

Fixtures cover static and computed imports, cycles, workspaces of unusual
shape, Unicode paths, malformed and unsupported source, missing targets,
staged/worktree identity changes, invalid/stale caches, focused queries, and
CLI failures. Repository-level tests also compile the real checkout and assert
that commands, hooks, configuration, canonical documentation, and package
files remain represented.

## Measurement and limitations

`semantic:build` reports generation time, process RSS, node/edge counts, graph
bytes, and warnings. Tree and impact results report selected file bytes against
the complete indexable-text byte count; binary files remain in the source
fingerprint and tracked-byte total but do not inflate the AI-context baseline.
These deterministic retrieval measurements can support the hypothesis that a
focused index reduces AI context size, but they are not a promised
token-savings percentage.

The ordinary test suite does not assert wall-clock time. Record same-host
measurements when deliberately changing traversal, parser, or output volume.

### Recorded repository baseline

On 2026-07-21, a staged checkout on the maintainer's macOS host produced 671
nodes, 1,681 edges, and a 708,204-byte graph in 514.978 ms, with process RSS of
236,355,584 bytes. The complete tracked-text discovery baseline was 3,254,879
bytes. A depth-one impact query for `scripts/lib/files.mjs` selected 19 files
and 311,815 bytes (9.6% of that baseline); a depth-two `push-inspection` tree
selected 14 files and 364,497 bytes (11.2%). These are payload measurements,
not token guarantees or performance gates.

The graph is static analysis, not a complete JavaScript runtime call graph. It
does not replace Jest, Vitest, Nx, Turborepo, or another tool's supported
dependency analysis. Future related-test adapters tracked by
[#146](https://github.com/RoryGlenn/commitment-issues/issues/146) may contribute
`tool-reported` evidence without duplicating those adapters here.
