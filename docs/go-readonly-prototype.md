# Experimental Go staged checker

This repository-only implementation is the first bounded read-only slice under
[#84](https://github.com/RoryGlenn/commitment-issues/issues/84). It is not the planned
standalone Go release or a replacement for the supported Node commands. The
4.0.0 npm package continues to use Node; this prototype is excluded from its
allowlist and does not install or replace hooks.

The source is in [`experimental/go-core`](../experimental/go-core). The module
uses only the Go standard library. Go is needed to build it; the resulting
executable needs installed Git, but no Node, npm, Python interpreter, manifest,
or project dependencies to inspect a Python-only repository.

## Build and invoke

The experimental module currently selects Go 1.27 or newer. This is a prototype
build constraint, not an approved Go-core toolchain support policy. Use an installed
trusted Go compiler and a writable cache, with automatic acquisition disabled:

```sh
cd experimental/go-core
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off go test ./...
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off go build -o /tmp/commitment-issues-go ./cmd/commitment-issues-go
/tmp/commitment-issues-go precommit --directory /path/to/repository --json
```

Use `--help` for the bounded CLI contract and `--version` for its experimental
identity. No hook installation is performed. The default directory is the
current directory, including a subdirectory inside a Git worktree. `--timeout`
sets one shared deadline from 1 ms through 30 seconds, defaulting to 30 seconds.
The executable does not accept a repository-supplied executable command.

## Supported checks and evidence

- `git.snapshot` captures the active index, including `GIT_INDEX_FILE`, and the
  current HEAD. It identifies staged changes by raw path, object ID and Git
  mode. A detached HEAD produces an advisory. An unborn branch is supported.
- `text.conflict-markers` scans the full contents of changed staged UTF-8 blobs
  for conventional conflict-marker lines, including CRLF and an initial UTF-8
  BOM. Unknown filename extensions receive the same text check. This is a
  heuristic: examples or documentation can contain intentional markers, and
  absence of markers is not syntax, merge, secret or semantic validation.
- `ecosystem.tools` explicitly reports skipped/unavailable. No Ruff, formatter,
  linter, test runner, parser, project plugin or build is executed. Python file
  classification is extension evidence only.

The checker reads blobs identified by the captured index; it never reads live
source to make a finding disappear. Untracked tests, unstaged source and local
tool configuration cannot satisfy checks. Deletions are counted without reading
deleted worktree paths. Renames are represented as deletion/addition or changed
paths, with no claim of semantic rename detection.

The snapshot is inspected without writing Git objects, the live index, refs,
source, hooks or configuration. A private temporary index is removed after
capture. Index and HEAD state are revalidated before returning the snapshot;
the result identifies that captured state and does not promise that another
process cannot change the repository after the check returns.

## Output and policy

`--json` emits one document and newline conforming to the existing
[JSON v1 schema](json-output.schema.json). New provenance and capability data
live under `checks[].details`; no new top-level field or enum is introduced.
`git.snapshot.details` includes `source: "index"`, `snapshotID`, `head`,
`branch`, `indexSHA256`, changed/deleted counts and bounded path/mode/object-ID
metadata. Finding details contain the exact path, 1-based line and blob ID;
source excerpts and Git subprocess stderr are not included.

All checks are advisory in this prototype. Exit 0 means allowed, including
findings or unavailable inspection. `status: "clean"` describes only completed
named prototype checks; `ecosystem.tools` still records its missing coverage.
Coverage gaps and snapshot failures are advisory/incomplete, never passed.
Invalid invocation exits 2. Cancellation, SIGINT/SIGTERM and deadline expiry
exit 130 with an incomplete result when the output stream remains writable.
Human output escapes repository-controlled path/control bytes. JSON retains
valid UTF-8 path identity. No `fun` tone, blocking option, or Node configuration
reader is added to this independent experimental command.

## Resource and compatibility boundaries

The initial bounds are 32 MiB of index bytes, 8 MiB of Git metadata, 512 changed
paths, 4,096 bytes per path, 2 MiB per blob and 16 MiB of total blob input.
Exceeding capture bounds makes inspection unavailable. Binary/NUL content,
invalid UTF-8 content and unsupported file modes are explicit text coverage
gaps. Symlink targets and submodules are never followed. Non-UTF-8 paths,
paths containing backslashes or colons, unmerged/split/sparse/intent-to-add or
assume-unchanged/skip-worktree index states, and unsupported index formats
are refused explicitly within the snapshot boundary. Bare/non-Git repositories
are unavailable. Detailed internal refusal reasons are not echoed verbatim to
the terminal because they may contain private paths or tool-controlled text.

Finding, file-metadata and coverage-gap lists each retain at most 64 entries,
with total counts/truncation indicators. Complete serialized output is bounded
at 4 MiB; an overflow produces one small unavailable result. Git processes
share the invocation deadline and have bounded captured output. These are
resource bounds for this implementation, not a sandbox for an untrusted Git
executable or a promise about adversarial operating-system behavior.

Only the selected installed Git executable is launched, using argument arrays.
Git routing environment is filtered; external diff, filesystem monitoring and
lazy network acquisition are disabled for inspection. No repository policy can
grant executable trust. Do not enable optional Ruff execution by accepting an
arbitrary command or silently resolving a package manager.

## Validation and next slice

Tests use disposable repositories and the compiled CLI, including Python-only
fixtures with Node/npm absent from runtime PATH. They check staged bad/live good
and staged good/live bad, alternate indexes, unusual filenames, unsupported
input, advisory semantics, deadline behavior and unchanged repository bytes.
Go statement coverage is recorded as evidence; it does not replace the existing
Node runtime requirement for 100% line/branch/function coverage. Native platform support
requires an executed artifact on that platform; cross-compilation alone is not
runtime evidence.

Next, settle the durable local trust/executable-binding contract and add a
strictly opt-in Ruff check/format-check adapter operating on captured input.
Version identity, bounded structured decoding, missing-tool behavior and
no-download tests must precede enabling it. Native macOS/Windows artifacts and
the Go-core coverage policy remain separate gates. Lifecycle, configuration migration,
fixes, test selection and publication remain later work.
