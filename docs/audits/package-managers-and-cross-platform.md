# Package Managers and Cross-Platform Behavior Audit

This is the implementation and completion-evidence report for
[audit workstream #134](https://github.com/RoryGlenn/commitment-issues/issues/134).
The canonical user-facing boundary is the
[compatibility and installation support guide](../compatibility.md); this
report records how that boundary was chosen, which defects were repaired, and
which evidence still has to come from the pull request's hosted matrix.

## Status

The implementation and hosted verification completed in
[PR #176](https://github.com/RoryGlenn/commitment-issues/pull/176), closing the
original workstream. The later #100 follow-up adds independent Yarn Berry
4.17.0 `node-modules` evidence without changing the historical Classic lanes.

No Critical or High finding remains. Eight concrete Medium findings and three
Low findings were fixed. A later release audit added pinned cross-version
upgrade evidence; automatic in-place downgrade remains explicitly unsupported
with a documented manual rollback. Yarn Berry 4.17.0 with
`nodeLinker: node-modules` is now supported through its dedicated #100 fixture;
Plug'n'Play remains explicitly unsupported. The later #83 follow-up adds
focused shell CI and a manual GUI release gate rather than treating shell or
client support as implied by package-manager coverage.

## Scope inventory

The audit classified all 239 tracked files present at its start. Files outside
the groups below were inspected for package-manager commands, install-time
behavior, runtime syntax, or public compatibility claims; they did not define
an additional portability surface.

| Group                       | Inventory and public behavior in scope                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package metadata            | `package.json`, `package-lock.json`, packed-file allowlist, bin mapping, engines, lifecycle scripts, runtime and peer dependencies                                                                                                  |
| Published runtime           | 28 measured modules after this audit: CLI dispatch, project-local hook bodies, package-manager detection and recovery commands, runtime guard, Git/config/tool subprocesses, and human/JSON output                                  |
| Installation and repair     | Packed local dependency install, manager-native local execution, `init`, repeated `init`, consumer-owned `prepare`, fresh-clone reinstall, scripts-disabled install, explicit `doctor` repair, and foreign hook/script preservation |
| Git lifecycle               | Pre-commit, commit-msg, and pre-push hooks executed by real Git from repository roots and nested workspaces; linked-worktree common hooks                                                                                           |
| Workspace behavior          | Root and nested workspaces, root-owned configuration, package-level scripts, manager root flags, manager lockfiles, and removal from the root                                                                                       |
| Removal                     | Product-owned configuration/hook cleanup, custom/foreign state preservation, manager-native package removal, local-bin disappearance, and lockfile preservation                                                                     |
| CI and automation           | npm matrix; pnpm, Yarn, and Bun lifecycle matrix; exact minimum Node lane; package-manager pins; coverage, metadata, and lifecycle assertions                                                                                       |
| Documentation and templates | README, compatibility, monorepo, Yarn, migration, framework, FAQ, architecture, configuration, external-interface, launch copy, bug template, changelog, and documentation index                                                    |
| Tests                       | 44 top-level test files plus the nested lifecycle fixture; unit, metadata, subprocess, real-Git, packaging, and end-to-end packed-artifact evidence                                                                                 |

The package has no TypeScript build, compiler target, native add-on, or
transpilation step. TypeScript is therefore a consumer ESLint/configuration
concern, not a package-runtime target to matrix separately.

## Compatibility and evidence matrix

“Required CI” below means the lane is a merge gate added or retained by this
change; it becomes CI-verified only when the pull request observes a passing
run. “Local” records this audit host. “Unverified” and “unsupported” are not
positive compatibility claims.

### Package managers and Node.js

| Environment                                   | Classification                        | Exact evidence boundary                                                                                                     |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| npm                                           | Supported; required CI plus local     | Packed lifecycle on Ubuntu, macOS, and Windows at Node 22.11.0 and 24; local macOS at Node 26.4.0/npm 11.17.0               |
| pnpm 10                                       | Supported; required CI                | Packed lifecycle on all three OSes at Node 24 and Ubuntu at Node 22.11.0; additional local macOS lifecycle with pnpm 11.9.0 |
| Yarn Classic 1.22.22                          | Supported; required CI                | Packed lifecycle on all three OSes at Node 24 and Ubuntu at Node 22.11.0                                                    |
| Bun 1.3.14                                    | Supported; required CI                | Packed lifecycle on all three OSes at Node 24 and Ubuntu at Node 22.11.0                                                    |
| Yarn Berry 4.17.0, `nodeLinker: node-modules` | Supported; required CI                | Dedicated packed lifecycle on all three OSes at Node 24 and Ubuntu at Node 22.11.0; clone repair uses explicit `doctor`     |
| Yarn Plug'n'Play                              | Unsupported                           | The runtime contract requires a project-local `node_modules/.bin` entry                                                     |
| Global installation                           | Unsupported                           | Generated hooks intentionally use only the project-local bin                                                                |
| Registry-downloading one-shot execution       | Unsupported                           | All documented and tested runners prohibit or avoid registry fallback                                                       |
| Node 22.11.0                                  | Supported minimum; required CI        | Exact floor runs the full suite and packed lifecycle; baseline peers use ESLint 9/Prettier 3                                |
| Node 24                                       | Supported; required CI                | Full npm suite and every supported package-manager lifecycle; ESLint 10/Prettier 3                                          |
| Node 26.4.0                                   | Locally verified, admitted by engines | Full suite and packed npm lifecycle on the audit host; not a separate required CI claim                                     |
| Other Node versions at or above the floor     | Admitted but not separately verified  | The declared `>=22.11.0` range applies; only named lanes carry distinct evidence                                            |
| Node below 22.11.0                            | Unsupported                           | Product-owned CLI diagnostic exits before command dispatch                                                                  |

### Operating systems, shells, IDEs, and Git clients

| Environment                             | Classification         | Exact evidence boundary                                                                                              |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Ubuntu                                  | Required CI            | npm at Node 22.11.0/24; pnpm 10, Yarn Classic 1.22.22, Yarn Berry 4.17.0, and Bun 1.3.14 at Node 22.11.0/24          |
| macOS                                   | Required CI plus local | npm at Node 22.11.0/24; other supported managers at Node 24; local zsh/npm and zsh/pnpm evidence at Node 26.4.0      |
| Windows                                 | Required CI            | npm at Node 22.11.0/24; other supported managers at Node 24; real Git executes hooks through its bundled POSIX shell |
| POSIX `sh` / Git for Windows shell      | Required CI            | Generated `#!/bin/sh` hooks run during real commits and pushes                                                       |
| Bash                                    | Required CI follow-up  | #83 launches the exact packed artifact through the full offline scenario on Linux; hooks themselves remain `sh`      |
| PowerShell                              | Required CI follow-up  | #83 launches the exact packed artifact and real Git lifecycle on Windows                                             |
| Zsh                                     | Required CI plus local | #83 launches the exact packed artifact on macOS; the audit also recorded local npm/pnpm evidence                     |
| Fish and direct Command Prompt launch   | Required CI follow-up  | #83 gives each target its own packed-artifact commit/push/doctor/uninstall lane                                      |
| VS Code, JetBrains IDEs, GitHub Desktop | Manual release gate    | #83 adds a candidate-specific checklist; Git must inherit usable Node and project-local-bin paths                    |

## Lifecycle and artifact coverage

Every supported manager runs the same end-to-end harness against the exact
tarball produced by `npm pack`; an install command alone does not count as a
pass. The harness uses the manager's local-only execution surface and strips
the outer npm user agent so manager detection is not accidentally faked.

| Scenario                                   | Evidence or narrowed boundary                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Packed local install                       | Installs the exact tarball plus peer tools at a workspace root and launches the installed CLI                                                                                              |
| Manager-native execution                   | `npx --no-install`, `pnpm exec`, `yarn run`, or `bunx --no-install`; no download can hide a missing bin                                                                                    |
| Real hooks                                 | Performs checked commits and a push from nested workspaces; requires distinct pre-commit, commit-msg, and pre-push output from those Git operations                                        |
| Existing project scripts and hooks         | Packed harness composes an existing `prepare` and preserves workspace scripts; focused real-repository `init`, `doctor`, and `uninstall` tests prove foreign/custom hooks remain untouched |
| Repeated setup                             | Runs `init` twice and checks idempotent project metadata and hooks                                                                                                                         |
| Fresh-clone reinstall                      | Confirms the consumer-owned composed `prepare` recreates clone-local hooks                                                                                                                 |
| Lifecycle scripts disabled                 | `--ignore-scripts` leaves hooks absent while the local CLI works; explicit `doctor` and a later normal install both repair them                                                            |
| Workspaces and lockfiles                   | Uses root and nested packages, manager-specific root flags, manager workspace scripts, and the manager's lockfile                                                                          |
| Uninstall                                  | Previews and performs product cleanup, then removes the dependency with the selected manager, verifies the bin is gone, and keeps the lockfile                                             |
| Forward upgrades across published versions | Immutable v2.5.1, v3.2.0, and v3.3.2 fixtures gate npm on Ubuntu/Node 24; publish reuses its exact tarball and weekly health extends coverage to pnpm, Yarn, and Bun                       |
| In-place downgrade                         | Unsupported; the manual path runs current `uninstall`, restores a pinned target manifest/lockfile and peers, then runs the target `init` and `doctor`                                      |

The package itself no longer declares `preinstall`, `install`, `postinstall`,
or `prepare`, so adding it as a dependency does not execute package-owned
install code. `init` still adds or composes a consumer-owned quiet `prepare`
repair. This distinction makes scripts-disabled behavior predictable while
retaining normal clone repair for configured projects.

## Findings and dispositions

Line references identify the reviewed implementation snapshot. Runtime defects
received failing regressions before their smallest reliable fixes; evidence and
documentation gaps were converted into executable assertions before completion.

| Severity | Finding, file-and-line evidence, and impact                                                                                                                                                                                                                                                  | Disposition                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | Generated hooks prepended `node_modules/.bin` to `PATH` and then called a bare command, so removal of the local dependency could execute an unrelated global binary. Runtime boundary: `scripts/lib/hooks.mjs:62-92`; regression: `test/hooks.test.mjs:141-178`.                             | Fixed: hooks invoke only the explicit project-local bin, self-neutralize when it is absent, and retain exact old bodies only for safe upgrade recognition at `scripts/lib/hooks.mjs:99-133`. |
| Medium   | The minimum Node version was metadata-only, so lenient managers could launch on an unsupported runtime without a product diagnostic. Runtime: `scripts/lib/runtime.mjs:9-52`, dispatcher: `scripts/cli.mjs:33-36`; regression: `test/runtime.test.mjs:12-54`.                                | Fixed: the CLI checks the declared floor before dispatch and emits one actionable nonzero diagnostic.                                                                                        |
| Medium   | Unpinned peer bootstrap commands could resolve ESLint 10, whose dependency tree does not run at exact Node 22.11.0. Peer boundary: `package.json:109-115`; lifecycle selection: `scripts/ci-lifecycle-smoke.mjs:25-35`; metadata regression in `test/metadata.test.mjs`.                     | Fixed: docs and recovery hints select ESLint 9/Prettier 3 at the floor, the harness pins `globals@^17`, and peer metadata supports tested ESLint 9 and 10 majors.                            |
| Medium   | pnpm and Yarn workspace-root recovery/removal hints omitted their required root flags. Runtime: `scripts/lib/package-manager.mjs:24-46,96-137`; regression: `test/package-manager.test.mjs:90-115,160-185`.                                                                                  | Fixed: workspace detection drives `--workspace-root` or `--ignore-workspace-root-check` for add/remove guidance.                                                                             |
| Medium   | The non-npm lifecycle matrix covered only Ubuntu/Node 24, below the support boundary implied by the docs. Matrix: `.github/workflows/ci.yml:89-138`; regression: `test/metadata.test.mjs:96-115`.                                                                                            | Fixed: pnpm, Yarn, and Bun now gate all three OSes at Node 24 and Ubuntu at exact Node 22.11.0, with manager versions pinned.                                                                |
| Medium   | The lifecycle harness inherited npm identity, invoked Yarn through npm tooling, and allowed Bun's runner to fetch, weakening package-manager evidence. Harness: `scripts/ci-lifecycle-smoke.mjs:158-244`; end-to-end hint assertion: `scripts/ci-lifecycle-smoke.mjs:644-656`.               | Fixed: manager-native local-only runners, a scrubbed environment, version logging, and manager-specific recovery assertions.                                                                 |
| Medium   | A successful Git commit/push did not prove advisory hooks executed, and repeated `init` was asserted only by unit tests. A skipped/no-op hook set could therefore pass the packed lifecycle. Harness evidence: `scripts/ci-lifecycle-smoke.mjs:609-617,663-717`.                             | Fixed: every manager runs `init` twice, and real Git operations must expose distinct pre-commit, commit-msg, and pre-push results.                                                           |
| Medium   | Scripts-disabled installation had no lifecycle evidence, so clone repair and CLI availability were conflated. Harness regression and recovery: `scripts/ci-lifecycle-smoke.mjs:719-755`.                                                                                                     | Fixed: the packed harness proves absent hooks, a working local CLI, explicit doctor recovery, and later lifecycle-enabled repair.                                                            |
| Low      | Public support text broadened the exact Bun 1.3.14 CI pin to all of Bun 1.3. Current boundary: `docs/compatibility.md:12-20`; CI pin: `.github/workflows/ci.yml:127-133`; regression: `test/metadata.test.mjs:117-134`.                                                                      | Fixed: every support surface names Bun 1.3.14, and metadata tests reject a broader `Bun 1.3` claim.                                                                                          |
| Low      | The external contract said missing local bins made hooks exit silently, while generated hooks intentionally emit one bounded skip notice. Contract: `docs/external-interface.md:91-104`; behavior: `scripts/lib/hooks.mjs:87-89`; regression in `test/metadata.test.mjs`.                    | Fixed: the contract now names the explicit local-bin invocations, stderr notice, and successful fail-open exit.                                                                              |
| Low      | The published package declared a root `prepare`, causing package managers to classify dependency installation as executing package code even though consumer repair belongs to initialized projects. Metadata regression in `test/metadata.test.mjs`; package scripts: `package.json:56-82`. | Fixed: removed package-owned dependency install lifecycle scripts; consumer-owned composed repair remains covered end to end.                                                                |

## Explicit deferrals and unsupported areas

These are closure dispositions, not hidden follow-up work:

- At this audit snapshot, [#83](https://github.com/RoryGlenn/commitment-issues/issues/83)
  owned the unverified Fish, direct Command Prompt, and GUI-client boundary.
  Its later focused follow-up adds required packed shell lanes and a separate
  manual GUI-client release checklist without rewriting the original local
  verification record below.
- [#96](https://github.com/RoryGlenn/commitment-issues/issues/96) added pinned
  forward-upgrade evidence for the Husky boundary, previous minor, and latest
  published baseline. It deliberately did not turn automatic reverse migration
  into a support claim; rollback uses cleanup and a pinned reinstall.
- [#100](https://github.com/RoryGlenn/commitment-issues/issues/100) adds the
  dedicated Yarn Berry 4.17.0 `nodeLinker: node-modules` fixture; Plug'n'Play
  remains unsupported.
- [#175](https://github.com/RoryGlenn/commitment-issues/issues/175) owns turning
  the lifecycle harness into a more fully featured test architecture. The
  strengthened harness remains an intentionally separate packed integration
  gate rather than entering the runtime coverage denominator.
- [#125](https://github.com/RoryGlenn/commitment-issues/issues/125) remains a
  future staging enhancement and does not change the current local-install
  compatibility boundary.

## CI, tests, and documentation changed

- Added exact minimum-Node and unsupported-runtime regression coverage.
- Expanded required pnpm/Yarn Classic/Yarn Berry/Bun lanes across OSes and
  added exact-minimum Ubuntu lanes with fixed manager versions.
- Strengthened the shared packed lifecycle harness with local-only execution,
  manager identity isolation, paths containing spaces and Unicode,
  scripts-disabled repair, workspace-aware hints, actual dependency removal,
  bin disappearance, lockfile preservation, repeated setup, and observable
  pre-commit/commit-msg/pre-push execution through real Git.
- Added a separate cross-version lifecycle: npm/Ubuntu/Node 24 is required for
  pull requests, the release workflow consumes its exact tarball, and weekly
  health covers pnpm, Yarn Classic, and Bun without expanding the fresh-install
  harness.
- Added behavioral proof that generated hooks never execute a global fallback.
- Added metadata gates for the peer/tool matrix, CI matrix, exact Bun support,
  the hook contract, dependency-install script absence, packed docs, and public
  command examples.
- Added the canonical compatibility guide and narrowed README, FAQ, monorepo,
  Yarn, migration, framework, architecture, launch, bug-template, and changelog
  claims to match it.

## Verification record

Local verification used macOS 26.5.2, zsh, Node 26.4.0, npm 11.17.0, pnpm
11.9.0, and Git 2.55.0. Yarn, Bun, Fish, and PowerShell were not installed
locally, so their evidence is deliberately assigned to hosted CI or left
unverified above.

| Command                                            | Result                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red-first targeted regressions                     | Hook global fallback, workspace-root hints, minimum-runtime module, CI matrix, peer ranges, and package install-script metadata all failed before their fixes |
| `npm run lint`                                     | Passed                                                                                                                                                        |
| `npm run format:check`                             | Passed                                                                                                                                                        |
| `npm test`                                         | 705/705 passed                                                                                                                                                |
| `npm run test:coverage`                            | 705/705 passed; 100% lines, branches, and functions across 28 runtime modules                                                                                 |
| `npm run coverage:check`                           | Passed; 705/705 tests, 100% runtime coverage, and the README badge is current                                                                                 |
| `npm run states`                                   | 42/42 live scenarios rendered with expected exits and at most one box                                                                                         |
| `npm run test:lifecycle:npm`                       | Passed the final packed lifecycle, including observable installed-hook execution through real Git                                                             |
| `npm run test:lifecycle:pnpm`                      | Passed the same final flow locally with pnpm 11.9.0                                                                                                           |
| `npx --yes node@20.19.4 scripts/cli.mjs --version` | Expected exit 1 with `Node.js 22.11.0 or newer is required; found 20.19.4.`                                                                                   |
| `npm pack --dry-run --json --ignore-scripts`       | 59 files; 143,153-byte tarball; 520,301 bytes unpacked                                                                                                        |
| `npm audit`                                        | Passed with 0 vulnerabilities across 268 dependencies                                                                                                         |
| `git diff --check`                                 | Passed                                                                                                                                                        |
| Expanded hosted package-manager/OS matrix          | Pending pull-request CI; required before workstream closure                                                                                                   |

## Conclusion and closure gate

Audit 5/9 closed after PR #176's required npm, pnpm, Yarn Classic, and Bun jobs
passed. The separately tracked #100 follow-up now extends the required matrix
to Yarn Berry without rewriting that original closure evidence.
