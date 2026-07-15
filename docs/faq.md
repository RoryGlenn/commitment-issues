# FAQ and troubleshooting

This page answers common adoption and recovery questions. The complete option
table lives in [Configuration and behavior](configuration.md), and public
command/output compatibility lives in the
[external interface](external-interface.md).

## Is this a replacement for Husky or lint-staged?

Yes, for the workflow it covers. `commitment-issues` owns native Git hook wiring
and staged ESLint/Prettier fixes without a separate hook manager. It adds
advisory-first checks, safe fix helpers, related push-time tests, and `doctor`
repair. Versions before 3.0 used Husky and lint-staged; `init` recognizes and
migrates the exact legacy wiring it owns.

## What happens by default, and when can it block?

After `init`, commits inspect staged files for lint, formatting, missing-test,
secret, branch, and commit-shape findings. Pushes run related tests in advisory
mode when matching files exist. Findings warn without blocking by default, and
routine success/no-op hook output stays quiet.

Blocking is separate and explicit for protected branches, secrets, push-time
tests, and optional commit-message linting. Local hooks remain bypassable with
Git's standard `--no-verify`; policy that must be universal belongs in CI or
server-side protection. See the [configuration reference](configuration.md)
for every enforcement switch.

## Why is advisory-first the default?

A new local hook should not unexpectedly stop an established workflow. Teams
can observe findings, tune exemptions, and enable only the gates they trust.
Automatic changes remain separate commands, so a warning does not rewrite a
working tree or commit.

## What does `init` change?

`init` can add package scripts, advisory push configuration, a self-repairing
`prepare` command, native Git hooks, and common cache/dependency ignores. It
preserves project-owned scripts, custom hooks, foreign `core.hooksPath`
configurations, dependencies, source files, and lockfiles. Use
`npx --no-install commitment-issues init --dry-run` for the exact proposed diff.

The full ownership and precedence rules are documented under
[What `init` changes](configuration.md#what-init-changes).

## Is it safe to run `init` more than once?

Yes. It is idempotent: known generated setup is refreshed, healthy setup is
left alone, and unrecognized project-owned content is preserved.

## How do I repair or coexist with custom hooks?

Run `npm run doctor`. It repairs generated wiring it owns and reports custom or
foreign hooks that require manual integration.

To compose manually, add the corresponding executable command line to the
custom hook:

```sh
commitment-issues precommit
commitment-issues prepush "$@"
commitment-issues commit-msg "$1"
```

Comments, printed examples, and non-executable POSIX hooks do not count as active
wiring.

## Will it change code or commits automatically?

Hook checks are read-only. Changes happen only after an explicit fix command:

```bash
npm run fix:staged
npm run commit:fix
```

`fix:staged` refuses files with overlapping staged and unstaged changes.
`commit:fix` refuses dirty tracked worktrees, pushed commits, and repository
states it cannot inspect safely. Resolve the condition named in the refusal and
retry; do not bypass a safety check merely to force an amend.

## How are related tests selected?

The tool looks next to a changed source file, in an adjacent `__tests__`
directory, and in top-level `test` or `tests` directories. For example,
`src/foo.ts` can match `test/foo.test.ts`.

Use `testExempt` for intentional exceptions, `requireTests: false` to disable
the presence check, and `runStagedTests: true` to execute related tests during
commit. `init` enables advisory related tests for pushes. Test-runner examples
and exact matching behavior live in
[Configuration and behavior](configuration.md#unit-test-heuristics).

## How do I use Jest, Vitest, or another runner?

Set `testCommand` to an argument array that accepts test paths. It is explicit
repository-owned configuration and executes without a shell. An array beginning
with `npx` opts into that executable's own package-resolution and possible
network behavior. Install the runner locally or select its offline/no-install
mode when the hook must remain network-isolated.

## Will missing tools be downloaded automatically?

No. Built-in ESLint, Prettier, and optional commitlint integrations resolve only
project-local binaries. Hooks report a missing tool and the detected package
manager's install command; fix commands fail because they cannot claim the
requested fix succeeded. There is no implicit `npx`, global lookup, registry
request, or install fallback.

## How do I enable commit-message linting?

Install project-local commitlint and its rules, set
`commitMessage.enabled: true`, then run `init` or `doctor` to wire the hook.
`blockOnFailure` is a second opt-in. The tool does not bundle commitlint or
invent a Conventional Commits policy. See
[Optional commit-message linting](configuration.md#optional-commit-message-linting).

## Where can configuration live?

Use `package.json` → `precommitChecks`, a repository-root
`.commitmentrc.json`, or both. Standalone keys override matching package keys;
unmatched package keys remain active. Both sources are JSON and are validated
without importing project code. See
[Configuration files and precedence](configuration.md#configuration-files-and-precedence).

## Does it collect telemetry or upload repository data?

No. The package has no telemetry, hosted service, repository upload, or runtime
phone-home request. It reads local Git/project state and runs local tools.
Installing dependencies, performing `git push`, or selecting a network-capable
`testCommand` can use the network independently. The
[security assurance case](https://github.com/RoryGlenn/commitment-issues/blob/main/docs/security/assurance-case.md)
defines the complete trust boundary.

## What projects and package managers are supported?

The supported v3 product targets JavaScript and TypeScript projects running
Node.js >=22.11.0. Local installs through npm, pnpm 10, Yarn Classic 1.22.22,
and Bun 1.3.14 are supported. TypeScript file discovery is built in, while parsing
and lint rules remain owned by the project's ESLint setup.

Yarn Berry with `nodeLinker: node-modules` is provisional until
[#100](https://github.com/RoryGlenn/commitment-issues/issues/100) adds dedicated
evidence; Plug'n'Play is unsupported. Global installs are unsupported because
hooks intentionally invoke the project-local bin. Install once at a monorepo
root and use root-owned configuration/tools. See the
[compatibility](compatibility.md), [Yarn Berry](yarn-berry.md),
[monorepo](monorepo.md), and [framework](framework-recipes.md) guides for the
tested boundaries.

## Which shells and GUI Git clients are supported?

The main matrix runs on Ubuntu, macOS, and Windows. Generated hooks are POSIX
`sh`; Git for Windows uses its bundled shell. Node.js and the local binary must
still be reachable in the environment inherited by Git.

Dedicated coverage for every shell and GUI client is not complete. Until
[#83](https://github.com/RoryGlenn/commitment-issues/issues/83) closes, the
project does not claim blanket Bash, Zsh, Fish, PowerShell, Command Prompt, VS
Code, JetBrains, or GitHub Desktop compatibility.

## Should I use this in CI?

Keep CI authoritative. Local hooks improve feedback latency but can be bypassed
or absent. Run normal lint, formatting, and test commands directly in CI and set
`COMMITMENT_ISSUES=0` when installs should skip local hook behavior. See the
[CI recipes](ci-recipes.md).

## How do I show success messages or playful wording?

Set `hookOutput: "normal"` to show routine hook success/info boxes. Set
`tone: "fun"` for relationship-themed advisory text. Neither setting changes
checks, safety decisions, JSON, or exit codes. The complete public gallery is
maintained in the repository's
[message-state documentation](https://github.com/RoryGlenn/commitment-issues/blob/main/docs/message-states.md).

## How can I verify a release?

Follow [Release verification](release-verification.md) to compare the npm and
GitHub tarballs, verify npm signatures/attestations, and validate the attached
SLSA provenance against the artifact digest and source tag.

## How do I remove it?

Run removal while the package is still installed:

```bash
npx --no-install commitment-issues uninstall --dry-run
npx --no-install commitment-issues uninstall
npm remove commitment-issues
```

The uninstaller removes exact generated scripts, configuration, and owned hook
bodies. It preserves customized hooks/scripts, shared ignores, ESLint, Prettier,
the lockfile, and anything whose ownership cannot be proven.

## Why is Node.js 22.11.0 the minimum?

Node.js 22.11.0 is the first Node 22 LTS release and the minimum exercised by
the CI matrix. Node 24 is tested as well. Older runtimes are outside the
supported release contract.
