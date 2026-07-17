# Independent Final Verification — Audit 9

This report records the independently repeated preflight and final candidate
disposition for
[Audit 9 issue #138](https://github.com/RoryGlenn/commitment-issues/issues/138).

Review date: 2026-07-16

Initial integrated baseline:
[`2c65e26d3d01536aa5f76c8566bd68f0c77d08a0`](https://github.com/RoryGlenn/commitment-issues/commit/2c65e26d3d01536aa5f76c8566bd68f0c77d08a0)

Final packed-content baseline:
[`279c78ff7ae0bab64ed7b295e65c430ef7ccc84d`](https://github.com/RoryGlenn/commitment-issues/commit/279c78ff7ae0bab64ed7b295e65c430ef7ccc84d)

Coordination baseline:
[`ad8f54dda8b7247ab14970c3132c58351f3234af`](https://github.com/RoryGlenn/commitment-issues/commit/ad8f54dda8b7247ab14970c3132c58351f3234af)

Reviewer: Codex performed the independent checkout, source/diff review,
commands, artifact verification, live-control read-backs, and visual inspection.
Rory Glenn remains the repository owner and release authority.

## Verdict

**Final Audit 9: pass with explicit GUI-client deferral. The v3.4.0 candidate
is ready for release authorization.**

No new product defect or undispositioned Critical/High finding was found. The
clean integrated source, runtime coverage, exact source-snapshot artifact,
package-manager and migration lifecycles, locally available shells, hosted
matrix, adversarial suites, performance tiers, documentation, visual assets,
live GitHub controls, published v3.3.2 provenance, and the final v3.4.0
candidate all passed.

The external-fork, npm, and OpenSSF controls tracked in #180, #195, and #199
were completed on 2026-07-16. The maintainer explicitly accepted the bounded
risk of releasing without four unavailable desktop UI checks. Those rows are
classified as unsupported/unverified environments, not as passes, and
post-launch issue #231 owns their execution. The compatibility documentation
does not claim verified support for those clients.

| Gate                                                              | Classification                        | Current evidence or remaining action                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#180](https://github.com/RoryGlenn/commitment-issues/issues/180) | External-fork validation              | Completed 2026-07-16: PR #227 proved the current graph, read-only/no-secret execution, unsigned fail-closed behavior, signed green aggregate, and CodeQL upload. |
| [#195](https://github.com/RoryGlenn/commitment-issues/issues/195) | Owner-authenticated npm configuration | Completed 2026-07-16: publisher identity, absent Environment claim, 2FA/token policy, and zero-token inventory verified.                                         |
| [#199](https://github.com/RoryGlenn/commitment-issues/issues/199) | Owner-authenticated OpenSSF metadata  | Completed 2026-07-16: native-hook description is public; JSON reports `badge_level: passing` and tiered percentage 193.                                          |
| [GUI Git-client checklist](../git-client-release-checklist.md)    | Explicitly deferred UI validation     | Unverified for v3.4.0: VS Code, one JetBrains client, GitHub Desktop macOS, and GitHub Desktop Windows are tracked after launch in #231.                         |

The completed #195 evidence is recorded in the Audit 7 report and sensitive
access-review record. Its 3.4.0 release preflight passed without creating or
changing any version, tag, Release, registry entry, or publication. The
completed #199 evidence is recorded in the Audit 8 report; the public profile
updated on 2026-07-16 and retained its Passing badge. The completed #180
evidence is recorded in the Audit 6 report and external PR #227.

The final packed-content baseline declares version 3.4.0. PR #232 narrowed the
GUI support claims before release and merged at verified, DCO-compliant commit
`279c78f`. One clean detached checkout packed the final candidate once outside
the checkout:

| Property                 | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Filename                 | `commitment-issues-3.4.0.tgz`                                                                     |
| Packed-content source    | `279c78ff7ae0bab64ed7b295e65c430ef7ccc84d`                                                        |
| SHA-256                  | `6c9d3f13d1848d36c20e232436efaf9ee77a8d13f8ea39d086297ae97081fc56`                                |
| SHA-1                    | `8c3e4dbcd631ea504f2287a29c9289a2e2338644`                                                        |
| SHA-512 integrity        | `sha512-s4K7a+vetXgyxCsMZb75/sIo6NJeLDxzr+e0zX0HxiP5q6LiDR7Xx65kOtnwbRqraZt1Mx77W1EUV6/MDXUK8A==` |
| Compressed/unpacked size | 147,251 / 532,577 bytes                                                                           |
| Manifest                 | 54 reviewed files; no bundled dependencies                                                        |

Those exact bytes passed npm 11.17.0, pnpm 11.9.0, Yarn Classic 1.22.22,
Yarn Berry 4.17.0 with `nodeLinker: node-modules`, macOS `/bin/sh`, and Zsh
packed lifecycles. The first local Berry attempt stopped before product
execution because its integrity-pinned CLI fixture had not been installed in
the fresh checkout; installing that reviewed fixture with `npm ci
--ignore-scripts`, auditing it, and rerunning the same tarball passed. The
detached checkout remained clean.

PR #232 CI run
[29552695508](https://github.com/RoryGlenn/commitment-issues/actions/runs/29552695508)
passed the full required graph. Post-merge main CI run
[29552910864](https://github.com/RoryGlenn/commitment-issues/actions/runs/29552910864)
and OpenSSF Scorecard run
[29552910827](https://github.com/RoryGlenn/commitment-issues/actions/runs/29552910827)
passed at `279c78f`. The final inventory contains 276 tracked paths with
SHA-256 `acf72eb2f8c7190ad6ce2d423f1e3c3ded979bbcee9f55fa7acf6dcd03579ca5`.

No `v3.4.0` tag, npm package, GitHub Release, or publication existed at the
final evidence read-back. `npm run release:preflight -- 3.4.0` confirmed the
version and tag were available everywhere, and release metadata validation
passed. Published-asset identity, registry attestations, SLSA provenance, and
the clean registry install are necessarily post-publication release checks;
they remain owned by the publish workflow and release-verification guide, not
silently represented as pre-release evidence.

## Initial independent checkout and inventory

The verification used a new clone from the canonical HTTPS remote, outside all
implementation worktrees. No cache, dependency directory, configuration, or
artifact was copied into it.

| Evidence                       | Result                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| Remote                         | `https://github.com/RoryGlenn/commitment-issues.git`               |
| `HEAD`                         | `2c65e26d3d01536aa5f76c8566bd68f0c77d08a0`                         |
| Initial/final worktree         | clean and equal to `origin/main`                                   |
| `git fsck --full`              | passed                                                             |
| Tracked paths                  | 274                                                                |
| Tracked-path inventory SHA-256 | `907b1f1a6024404d238260c4ac76d1cd488a4628252de3b80ebcaa12461959b6` |
| Submodules                     | none                                                               |
| Local host                     | macOS Darwin 25.5.0, arm64                                         |
| Local tools                    | Node 26.4.0, npm 11.17.0, Git 2.55.0                               |

Every tracked path was assigned to one exclusive verification surface:

| Surface                                   |   Files | Independent evidence                                                             |
| ----------------------------------------- | ------: | -------------------------------------------------------------------------------- |
| Shipped runtime and hooks                 |      31 | Full tests, 100% runtime coverage, exact-tarball lifecycles, adversarial review  |
| Tests and fixtures                        |      64 | Assertion review, full/focused runs, no local skip/todo/focus result             |
| Lifecycle, release, and maintenance tools |      17 | Manager/migration/shell/performance/release runs and focused policy tests        |
| Workflow automation                       |       7 | actionlint, CI policy tests, live required graph and settings read-back          |
| Documentation and governance              |      57 | Metadata, local/external links, claim reconciliation, live-control comparison    |
| Assets and promotion                      |      89 | Generator equality, SSIM comparison, sampled-frame and social-preview inspection |
| Metadata and configuration                |       9 | Lock/package/release metadata, package allowlist, audit and provenance checks    |
| **Total**                                 | **274** | No unassigned tracked path                                                       |

There is no build or typecheck command: the shipped implementation is native
ESM JavaScript with no compilation step. Those gates are not applicable rather
than silently omitted.

## Integrated audit-range review

The range from `ad8f54d` through `2c65e26` contains 46 commits and changes 155
files with 20,886 insertions and 2,908 deletions. It includes Audits 1–8 and
their focused security, lifecycle, release, terminal, compatibility, CI, and
documentation repairs.

- `git diff --check` passed across the complete range.
- No merge marker, TODO/FIXME/HACK marker, focused test, or unconditional
  skipped test was found. Two permission tests contain platform-conditional
  skips; neither skipped on the macOS verifier, and non-POSIX permission
  semantics remain covered by hosted Windows behavior.
- Workflow-action pins, permissions, checkout credentials, timeouts,
  concurrency, DCO ownership, and the single SLSA semantic-tag exception match
  the audited allowlist.
- Native-hook statements are current. Remaining Husky/lint-staged mentions are
  comparisons, migration/history, preservation tests, or repository topics.
  The external OpenSSF description now matches the native-hook model.
- Runtime helpers remain single-purpose across configuration, safe filesystem
  writes, hook ownership, process execution, terminal escaping, and JSON
  semantics. No merge-resolution loss or conflicting replacement abstraction
  was found.

GitHub verifies 45 of the 46 commits in the coordination range. The one
unsigned commit is the historical roadmap commit `265d2e6`, which is itself the
documented prospective DCO baseline. The repository DCO tool passed for every
commit after that baseline through `2c65e26`.

## Static, runtime, coverage, and message-state results

| Check                              | Result                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                           | 269 packages installed; zero vulnerabilities                                                                                                     |
| `npm run lint`                     | passed                                                                                                                                           |
| `npm run format:check`             | passed                                                                                                                                           |
| actionlint 1.7.12                  | official macOS ARM archive and checksum manifest verified; workflow check passed with only the documented `concurrency.queue` schema suppression |
| `npm audit --audit-level=high`     | zero vulnerabilities                                                                                                                             |
| `npm run release:validate`         | v3.3.2 metadata internally consistent                                                                                                            |
| `COMMITMENT_ISSUES=0 npm test`     | 860 passed; 0 failed, skipped, todo, or cancelled                                                                                                |
| `npm run test:coverage`            | 100% lines, branches, and functions for every shipped runtime file                                                                               |
| `npm run coverage:check`           | README badge current; no write required                                                                                                          |
| `npm run states`                   | all 42 scenarios exited as expected and honored the one-box contract                                                                             |
| focused security/release suite     | 326 passed                                                                                                                                       |
| focused metadata/link/visual suite | 90 passed                                                                                                                                        |
| prebuilt npm lifecycle             | passed                                                                                                                                           |

The exact Linux actionlint archive checksum and execution also passed in
[integrated CI run 29512980481](https://github.com/RoryGlenn/commitment-issues/actions/runs/29512980481).
The local Docker CLI had no running daemon, so the native verified actionlint
asset was used locally rather than claiming a Linux container run.

## Initial source-snapshot artifact

The source tree was packed once outside the checkout and those exact bytes were
reused for every locally run lifecycle, migration, and shell command.

| Property                 | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Filename                 | `commitment-issues-3.3.2.tgz`                                                                     |
| SHA-256                  | `0ab2b451a7fe32371bdfb324441c5a13a68498680618d5165f4ee79523e43730`                                |
| SHA-1                    | `6f32637d87133bf10a5cfc93ef896f0ecc3a64fb`                                                        |
| SHA-512 integrity        | `sha512-kNaw8zHWFFODq0fTjHSe9E6EgN1lZDAnG/oTMnqYEmtQpFpzJK8k28Jkt0MFDb5Q+fjrz1o4noibsKLHRXX5Uw==` |
| Compressed/unpacked size | 147,040 / 532,007 bytes                                                                           |
| Manifest                 | 54 reviewed files; no bundled dependencies                                                        |

The manifest contains only the runtime, reviewed user documentation, license,
changelog, package metadata, and six README assets. Runtime import closure,
executable bin mode, non-executable file modes, package budgets, and packed
Markdown links passed. Repository-only audits, tools, tests, fixtures,
workflows, and promotional sources are absent as intended.

`npm run release:preflight -- 3.3.2` rejected the local tag, remote tag, GitHub
Release, and npm-version collisions. A maintainer-selected new version and its
reviewed changelog/version commit are required before this snapshot can become
an exact release candidate.

## Package-manager, migration, shell, and performance evidence

Every manager used the same local source-snapshot SHA-256:

| Manager      | Version                            | Packed lifecycle | Historical migrations                                 |
| ------------ | ---------------------------------- | ---------------- | ----------------------------------------------------- |
| npm          | 11.17.0                            | passed           | 2.5.1, 3.2.0, and 3.3.2 passed                        |
| pnpm         | 10.34.5                            | passed           | 2.5.1, 3.2.0, and 3.3.2 passed                        |
| Yarn Classic | 1.22.22                            | passed           | 2.5.1, 3.2.0, and 3.3.2 passed                        |
| Yarn Berry   | 4.17.0, `nodeLinker: node-modules` | passed           | covered by current lifecycle; PnP remains unsupported |
| Bun          | 1.3.14                             | passed           | 2.5.1, 3.2.0, and 3.3.2 passed                        |

The first Yarn migration attempt stopped before product execution because the
fresh host had no `yarn` command. After adding exact Yarn 1.22.22 to the
isolated tool prefix, the complete migration passed. This is retained as an
environment setup result, not hidden as a product failure.

macOS `/bin/sh` and Zsh passed locally against the exact source snapshot with a
stripped `PATH`. Integrated run 29512980481 independently passed Linux
`/bin/sh`, Bash, Fish, macOS `/bin/sh`, Zsh, Windows PowerShell, and Command
Prompt. Hosted jobs pack and retain their own platform artifact; their hashes
must not be described as the local source-snapshot bytes.

Performance on the recorded macOS host:

| Tier          | Fixture                             | Discovery |                                    Hook time | Result |
| ------------- | ----------------------------------- | --------: | -------------------------------------------: | ------ |
| smoke         | 4 source/test pairs, 9 staged files |  0.758 ms |     precommit 679.198 ms; prepush 215.832 ms | pass   |
| large         | 250 pairs, 501 staged files         | 13.424 ms | precommit 2,773.198 ms; prepush 2,084.922 ms | pass   |
| argv pressure | 1,000 pairs, 2,001 staged files     | 55.437 ms |                discovery/argument model only | pass   |

All host budgets passed. [#212](https://github.com/RoryGlenn/commitment-issues/issues/212)
remains the explicit post-launch Windows very-large-argv batching boundary;
POSIX success is not treated as Windows proof.

## Security and failure-path verification

The 326-test focused adversarial run covered linked/replaced hook roots,
legacy `.husky`, package/config/gitignore descriptors, identity changes,
permissions, dry-run refusal, hostile paths/refs/config/Git output, terminal
controls, JSON round trips, malformed patches, secret-scan failure, push-base
failure, spawn/timeout/signal cleanup, Git environment stripping, local-tool
resolution, dirty/amended/pushed-history refusals, uninstall ownership, DCO,
release ancestry, metadata, recovery, collisions, digests, and immutable tags.

All passed with no skipped case. The current live alert snapshot contains:

- zero open CodeQL alerts;
- zero open Dependabot alerts;
- zero open secret-scanning alerts; and
- one owner-visible Low OpenSSF Scorecard CI-Tests alert #11, which reports 27
  of 28 recent merged PRs with detected CI.

Alert #11 is accepted rolling historical evidence, not a confirmed product
vulnerability: the current ruleset strictly requires `CI Success`, and every
Audit 9 baseline job passed. It should age out as the recent-PR window advances.

## Documentation, links, and visual evidence

- All 51 tracked Markdown documents have resolving repository-relative file or
  directory links.
- 148 unique public Markdown destinations were fetched: 147 succeeded. The npm
  package page returned an automation-only 403; registry CLI metadata,
  signatures, attestations, tarball, and clean installation independently
  verified its underlying claims.
- Message-state SVG generation exactly reproduced committed assets; flowchart
  themes and accessibility metadata passed.
- The 26.04-second 1000×760 demo passed deterministic SSIM comparison. Sampled
  frames at 3, 8, 13, 18, and 24 seconds were readable, correctly cropped, and
  showed the documented install/init, advisory commit, fix, and push flow.
- The live 1280×640 GitHub social preview was downloaded through the repository
  API and visually inspected. It remains legible and consistent with the
  committed 1280×720 source art.
- The OpenSSF project JSON reports the owner-authenticated native-hook
  description, `updated_at: 2026-07-16T20:44:46.606Z`, `badge_level: passing`,
  and tiered percentage 193. That completes the #199 external metadata gate.

## Live repository and release controls

At the evidence timestamp:

- main ruleset `18531369` is active with deletion/non-fast-forward protection,
  linear history, one approval, latest-push approval, stale-review dismissal,
  resolved threads, strict `CI Success`, and CodeQL tool-error plus High-or-
  higher security-alert blocking;
- tag rulesets `18965736` and `18965738` restrict `v*` creation to release
  authority and forbid updates/deletions without bypass;
- Actions default to read permissions, cannot approve reviews, and require
  first-time-contributor approval for fork runs;
- private vulnerability reporting is enabled; there are no deploy keys; one
  active integration webhook matches the privacy-bounded access record;
- repository topics exactly match the seven launch topics; and
- integrated main CI run 29512980481 is green across the full required graph.

The natural external PR [#166](https://github.com/RoryGlenn/commitment-issues/pull/166)
remains behind at `e5942d4`. Its last run used a read-only token with no secrets
and passed the then-current OS/Node, manager, migration, and CodeQL lanes, then
failed closed on its unsigned commit and unformatted contributor guide.
Maintainer-controlled external [PR #227](https://github.com/RoryGlenn/commitment-issues/pull/227)
then completed the current graph: unsigned run `29546132668` failed only DCO and
the aggregate, while signed run `29546490643` attempt 2 passed all 34 required
jobs. Both stages reported read-only contents and metadata with no secret
source; CodeQL uploaded successfully. No contributor branch was mutated.

## Published v3.3.2 baseline

The published baseline is distinct from the final v3.4.0 candidate.

| Evidence                   | Result                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| npm/GitHub tarball SHA-256 | both `01cbf76a27b0bc82d4334021a067fcd34ad7a62aa0ec9c6044efe78c5932551e`                                |
| GitHub SLSA asset SHA-256  | `c6c53fbe957343869f40854760c57222a55cd90f70b3f467e3cbd9b3bec70420`                                     |
| Byte comparison            | npm and GitHub tarballs identical                                                                      |
| npm SHA-512 integrity      | matched registry metadata                                                                              |
| npm signature audit        | 91 dependency signatures and 13 attestations verified; none invalid or missing                         |
| package attestation        | publish and SLSA bundles present; repo, `publish.yml`, `refs/tags/v3.3.2`, and commit `57ac737` match  |
| generic SLSA verification  | passed with verifier 2.7.1 against expected repo and tag                                               |
| release workflow           | [run 29194551447](https://github.com/RoryGlenn/commitment-issues/actions/runs/29194551447), successful |
| GitHub Release             | immutable, non-draft, two expected assets                                                              |
| tag ancestry               | `57ac737` is an ancestor of current canonical `main`                                                   |
| clean registry install     | `commitment-issues@3.3.2` installed; CLI help/version passed                                           |

The initial verifier had no npm owner session, so the first trusted-publisher
and token-policy reads returned E401. The later owner-authenticated #195 review
verified the expected publisher identity, no GitHub Environment claim, required
2FA/token policy, and zero active access tokens. No credential identifiers or
account details are copied into this report.

## Remaining issue and pull-request classification

There were 49 open issues at the snapshot. Every one is classified below. The
named assignee owns an issue where present; otherwise the repository maintainer
owns triage until assignment.

### Launch and verification gates

The controls tracked by #180, #195, and #199 are complete. This report and its
post-merge read-back complete #138, after which parent audit tracker #101 may
close. [#78](https://github.com/RoryGlenn/commitment-issues/issues/78) remains
open for the distinct publication and launch actions. No post-launch issue was
promoted into the frozen launch gate.

### Accepted post-launch maintenance or bounded debt

[#141](https://github.com/RoryGlenn/commitment-issues/issues/141),
[#142](https://github.com/RoryGlenn/commitment-issues/issues/142),
[#143](https://github.com/RoryGlenn/commitment-issues/issues/143),
[#144](https://github.com/RoryGlenn/commitment-issues/issues/144),
[#157](https://github.com/RoryGlenn/commitment-issues/issues/157),
[#168](https://github.com/RoryGlenn/commitment-issues/issues/168),
[#175](https://github.com/RoryGlenn/commitment-issues/issues/175),
[#179](https://github.com/RoryGlenn/commitment-issues/issues/179),
[#204](https://github.com/RoryGlenn/commitment-issues/issues/204),
[#212](https://github.com/RoryGlenn/commitment-issues/issues/212), and
[#231](https://github.com/RoryGlenn/commitment-issues/issues/231) are
scheduled maintenance, test-structure, documentation, CI-efficiency,
recurring-review, dependency, platform-pressure, or explicitly deferred GUI
validation work. Each has a bounded issue and none invalidates the narrowed
documented support boundary.

### Intentionally deferred features and contributor tasks

[#81](https://github.com/RoryGlenn/commitment-issues/issues/81),
[#84](https://github.com/RoryGlenn/commitment-issues/issues/84),
[#86](https://github.com/RoryGlenn/commitment-issues/issues/86),
[#105](https://github.com/RoryGlenn/commitment-issues/issues/105),
[#106](https://github.com/RoryGlenn/commitment-issues/issues/106),
[#107](https://github.com/RoryGlenn/commitment-issues/issues/107),
[#108](https://github.com/RoryGlenn/commitment-issues/issues/108),
[#109](https://github.com/RoryGlenn/commitment-issues/issues/109),
[#110](https://github.com/RoryGlenn/commitment-issues/issues/110),
[#111](https://github.com/RoryGlenn/commitment-issues/issues/111),
[#112](https://github.com/RoryGlenn/commitment-issues/issues/112),
[#113](https://github.com/RoryGlenn/commitment-issues/issues/113),
[#114](https://github.com/RoryGlenn/commitment-issues/issues/114),
[#115](https://github.com/RoryGlenn/commitment-issues/issues/115),
[#116](https://github.com/RoryGlenn/commitment-issues/issues/116),
[#117](https://github.com/RoryGlenn/commitment-issues/issues/117),
[#118](https://github.com/RoryGlenn/commitment-issues/issues/118),
[#119](https://github.com/RoryGlenn/commitment-issues/issues/119),
[#120](https://github.com/RoryGlenn/commitment-issues/issues/120),
[#121](https://github.com/RoryGlenn/commitment-issues/issues/121),
[#122](https://github.com/RoryGlenn/commitment-issues/issues/122),
[#123](https://github.com/RoryGlenn/commitment-issues/issues/123),
[#124](https://github.com/RoryGlenn/commitment-issues/issues/124),
[#125](https://github.com/RoryGlenn/commitment-issues/issues/125),
[#126](https://github.com/RoryGlenn/commitment-issues/issues/126),
[#127](https://github.com/RoryGlenn/commitment-issues/issues/127),
[#128](https://github.com/RoryGlenn/commitment-issues/issues/128),
[#145](https://github.com/RoryGlenn/commitment-issues/issues/145),
[#146](https://github.com/RoryGlenn/commitment-issues/issues/146),
[#147](https://github.com/RoryGlenn/commitment-issues/issues/147),
[#148](https://github.com/RoryGlenn/commitment-issues/issues/148),
[#149](https://github.com/RoryGlenn/commitment-issues/issues/149), and
[#165](https://github.com/RoryGlenn/commitment-issues/issues/165) are optional
product, tutorial, adapter, presentation, staging, or policy expansions. They
remain post-launch under the stop rule. The security label on #122 describes a
future transactional-staging feature; it is not a vulnerability in a shipped
command.

Two pull requests remain open. External [PR #166](https://github.com/RoryGlenn/commitment-issues/pull/166)
belongs to #118 and #180 and is dispositioned above. Feature
[PR #129](https://github.com/RoryGlenn/commitment-issues/pull/129) belongs to
#116, is behind, has requested changes and failing checks, and is intentionally
outside the launch milestone. Neither is an unmerged launch implementation.

## Commands executed

The verification ran the following command families from the clean clone. The
manager, migration, and local shell commands all received the same explicit
`--tarball` path.

```text
git fsck --full
git diff --check ad8f54d..2c65e26
npm ci
npm run lint
npm run format:check
npm audit --audit-level=high
npm run release:validate
COMMITMENT_ISSUES=0 npm test
npm run test:coverage
npm run coverage:check
npm run states
npm pack --silent --pack-destination <outside-checkout>
npm pack --dry-run --json --ignore-scripts
npm run test:lifecycle:{npm,pnpm,yarn,yarn-berry,bun} -- --tarball <exact.tgz>
node tools/run-migration-lifecycle-test.mjs {npm,pnpm,yarn,bun} --tarball <exact.tgz>
npm run test:shell-compat -- {sh,zsh} --tarball <exact.tgz>
npm run benchmark:hooks -- --tier smoke
npm run benchmark:hooks -- --tier large --enforce-budgets
npm run benchmark:hooks -- --tier argv-pressure --enforce-budgets
node --test <focused security/release files>
node --test <focused metadata/link/visual files>
npm run release:preflight -- 3.3.2
npm audit signatures --include-attestations
slsa-verifier verify-artifact <v3.3.2.tgz> --provenance-path <bundle> --source-uri github.com/RoryGlenn/commitment-issues --source-tag v3.3.2
```

The final v3.4.0 affected read-back added these commands against the same exact
tarball path:

```text
git diff --check ad8f54dda8b7247ab14970c3132c58351f3234af..279c78ff7ae0bab64ed7b295e65c430ef7ccc84d
node tools/check-dco-range.mjs 5d82371bc399472587ce73a582e4deaf24636483 279c78ff7ae0bab64ed7b295e65c430ef7ccc84d
npm ci
npm pack --json --pack-destination <outside-checkout>
shasum -a 256 <exact-3.4.0.tgz>
npm run test:lifecycle:{npm,pnpm,yarn,yarn-berry} -- --tarball <exact-3.4.0.tgz>
npm run test:shell-compat -- {sh,zsh} --tarball <exact-3.4.0.tgz>
npm run release:validate -- --tag v3.4.0
npm run release:preflight -- 3.4.0
```

## Completion conditions

Audit 9's repository, external-control, exact-candidate, classification, and
reporting criteria are satisfied. No Critical/High blocker or undispositioned
audit finding remains. The unexecuted GUI-client rows are explicitly unverified
and owned by #231; they are not release claims or launch gates.

After this repository-only report change merges, repeat the packed digest and
green-main read-back. Because `docs/audits/` is excluded from the npm package,
the report merge must reproduce SHA-256
`6c9d3f13d1848d36c20e232436efaf9ee77a8d13f8ea39d086297ae97081fc56`.
Close #138 and #101 only after that read-back. Creating `v3.4.0` remains a
separate, explicit release authorization; the tag, npm publication, provenance,
GitHub Release, and post-publication verification must still follow the release
workflow and immutable-tag rules.
