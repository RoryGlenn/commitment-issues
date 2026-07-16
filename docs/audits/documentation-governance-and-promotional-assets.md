# Documentation, Governance, and Promotional Assets Audit

This is the completion report for
[Audit 8 workstream #137](https://github.com/RoryGlenn/commitment-issues/issues/137).

Review date: 2026-07-16

Evidence commit:
[`db3ccf039c625764e8eabe6d6c23589d42ef07b8`](https://github.com/RoryGlenn/commitment-issues/commit/db3ccf039c625764e8eabe6d6c23589d42ef07b8)

Reviewers and roles:

- Codex assisted the repository inventory, contradiction, link, command,
  visual, security-claim, workflow, and external-metadata review.
- Rory Glenn is the repository owner and maintainer; final approval is recorded
  by review and merge of the pull request that lands this report.

## Verdict

The repository-controlled Audit 8 scope is complete at the evidence commit.
Public repository documentation, governance and security policy, packaged
documentation, generated visual evidence, and launch material agree with the
merged implementation and its supported boundary. Every concrete repository
finding is fixed and merged.

This verdict does not claim that owner-only third-party settings are complete.
The stale OpenSSF profile description remains an explicit owner-authenticated
external action in #199, npm account controls remain gated by #195, and the
current full external-fork trigger remains gated by #180. Those items have an
owner, exact next action, and dated evidence; Audit 9 and launch readiness must
continue to treat them as unresolved external controls.

## Inventory and method

Every tracked public-facing or policy surface was assigned to one of these
groups and compared with the implementation, packed artifact, tests, and live
external state:

- product entry points: README, package and release metadata, changelog,
  roadmap, adoption guidance, and launch copy;
- user documentation: configuration, external interface, JSON, compatibility,
  package-manager, monorepo, migration, framework, CI, FAQ, message-state,
  performance, removal, and troubleshooting material;
- contributor and governance material: contribution policy, templates,
  security policy, support, code of conduct, license, DCO, CODEOWNERS,
  governance, project roles, maintenance, and release procedures;
- assurance and audit evidence: scenario coverage, security assurance,
  vulnerability history, OpenSSF evidence, definition of done, and Audit 1-8
  reports;
- visual and promotional material: committed SVG states and flowcharts,
  generated demo GIF and tape source, logo/hero assets, social preview, and Show
  HN launch copy; and
- external claims: npm package and attestations, GitHub topics and security
  controls, OpenSSF Best Practices profile and badge, workflow badges, and
  public links.

Documented commands were run where practical. Repository-relative Markdown
links were resolved against the source and exact npm package boundary. The
external pass checked 130 unique URLs with no definite failures; npm's package
page rejected automation, so the registry CLI independently confirmed published
version 3.3.2. Generated assets were compared with their sources and visually
inspected rather than accepted from filenames or successful commands alone.
The detailed progress inventory is retained on
[#137](https://github.com/RoryGlenn/commitment-issues/issues/137#issuecomment-4982542515).

## Acceptance-criterion results

### Public documents, governance, badges, links, and assets

- The tracked-file and public-surface inventory is complete at `db3ccf0`.
- All retained Markdown documents are linked from `docs/index.md`.
- Repository-relative links in the shipped package resolve against the exact
  `npm pack` manifest and are rechecked after installation. #141 separately
  owns a future repository-wide local-link maintenance tool.
- Live repository topics exactly match the launch list: `developer-tools`,
  `eslint`, `git-hooks`, `husky`, `lint-staged`, `pre-commit`, and `prettier`.
- The live OpenSSF project and badge still report Passing (tiered percentage
  193), but its description still names the removed Husky/lint-staged runtime
  architecture. [Issue #199](https://github.com/RoryGlenn/commitment-issues/issues/199#issuecomment-4993419466)
  records the exact replacement wording and owner-authenticated read-back gate;
  this report does not repeat the stale description as a current claim.

### Commands and output match current behavior

- Quickstart, setup, dry-run, hooks, doctor, fix, removal, package-manager, and
  release-verification commands were reconciled with executable scripts and
  packed lifecycle tests.
- Human examples follow the single-box and terminal trust-boundary contracts;
  structured examples follow the exact JSON schema and semantic-value contract.
- The message-state inventory renders all 42 live scenarios, and generator
  equality tests keep committed SVGs synchronized with their sources.
- Compatibility claims match required Linux, macOS, Windows, Node, npm, pnpm,
  Yarn Classic, Yarn Berry, Bun, and packed-shell evidence. GUI Git-client and
  unsupported Plug'n'Play boundaries remain explicitly manual.

### Unsupported claims and governance/security gaps

| Finding                                            | Severity                     | Final disposition                                                                                                              |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Polynomial Husky-path normalization (#197)         | High                         | Fixed by PR #198, merged as `0704b1e`; CodeQL finding fixed.                                                                   |
| Global Yarn bootstrap outside the lockfile (#201)  | Medium                       | Fixed by PR #202, merged as `87ceda1`; bootstrap is integrity-locked.                                                          |
| Linked legacy `.husky` cleanup (#203)              | High                         | Fixed by PR #205, merged as `cec595e`; links and replacements are preserved.                                                   |
| Linked mutable project files (#206)                | High                         | Fixed by PR #208, merged as `7e433b0`; descriptor and identity regressions pass.                                               |
| Repository-controlled terminal controls (#207)     | Medium                       | Fixed by PR #209, merged as `ac605f5`; human output escapes controls while JSON preserves values.                              |
| Stale repository documentation claims              | Low/Medium                   | Fixed by PR #200 (`859c045`) and the focused child PRs above.                                                                  |
| Historical security-review baseline (#99)          | Medium assurance gap         | Refreshed by PR #218, merged as `db3ccf0`, against integrated commit `e7d096d`.                                                |
| CodeQL alert merge protection (#177)               | Configuration gate           | Active in ruleset `18531369`; PRs #216/#217 prove blocked and clean paths.                                                     |
| Stale OpenSSF Husky/lint-staged description (#199) | Low external metadata        | Open owner-only action with exact wording and dated Passing-badge read-back; no repository claim depends on the stale text.    |
| npm publication settings (#195)                    | Medium external release gate | Repository OIDC evidence is complete; authenticated publisher, 2FA, and token-policy read-back remains open.                   |
| Current external-fork graph (#180)                 | Medium external validation   | Read-only/no-secret/fail-closed evidence is recorded; a legitimate new revision must exercise the added Berry and shell lanes. |

Non-milestone enhancements remain separate from launch claims: #141 owns future
repository-link automation, #175 owns lifecycle test-structure refactoring,
and #212 owns Windows very-large-argv batching. Their deferral does not broaden
the currently documented support boundary.

### Assets and promotional material

No generated asset changed during the final Audit 8 repair series, so assets
were not regenerated merely to create activity. Verification instead proved
that the checked-in generator output remains exact and visually valid:

- `test/visual-assets.test.mjs` reproduces committed SVGs and checks accessible
  names, descriptions, light/dark flowcharts, and demo-source invariants;
- `test/demo-visual-comparison.test.mjs` checks the deterministic rendered demo
  against its baseline with bounded frame alignment and volatile-region masks;
- the 26.04-second demo sequence was inspected for command accuracy, terminal
  dimensions, pacing, cropping, and readability; and
- the live 1280x640 social preview was inspected for current branding and
  legibility.

The issue ledger records that inspection and the absence of any asset finding
requiring a new render.

## Verification record

Local verification on the report branch:

- focused metadata, packed-link, release-metadata, message-state, and visual
  tests: passed;
- full runtime suite: 860 tests passed;
- line, branch, and function coverage: 100%;
- `npm run lint` and `npm run format:check`: passed;
- `npm run states`: all 42 scenarios rendered;
- `npm run release:validate`: v3.3.2 metadata is consistent;
- `npm pack --dry-run --json --ignore-scripts`: closed package allowlist and
  packed Markdown links passed;
- `npm audit --audit-level=high`: zero vulnerabilities; and
- `git diff --check`: passed.

Hosted [required CI on integrated `main`](https://github.com/RoryGlenn/commitment-issues/actions/runs/29511127093)
repeated the Linux/macOS/Windows Node matrix, coverage, packed shells,
npm/pnpm/Yarn Classic/Yarn Berry/Bun lifecycles, migration, CodeQL, DCO, static
quality, and `CI Success` on `db3ccf0`. The final report PR must repeat that gate
and record the documented sole-maintainer review exception if no second eligible
reviewer is available.

## Remaining manual or organizational requirements

| Requirement                                            | Owner                                | Exact remaining action                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm package settings and credential disposition (#195) | Rory Glenn                           | Use an owner-authenticated npm session to verify the trusted publisher, blank environment binding, 2FA/token policy, and obsolete-credential disposition; record only privacy-bounded evidence. |
| OpenSSF project description (#199)                     | Rory Glenn                           | Save the prepared native-hook wording in project 13528, then verify the public JSON no longer names Husky/lint-staged and the badge remains Passing.                                            |
| External-fork graph (#180)                             | External contributor plus Rory Glenn | Let a legitimate fork revision trigger current CI, approve it under the first-time-contributor policy, and record the complete green/fail-closed result without mutating an unrelated branch.   |
| Independent final verification (#138)                  | Independent verification pass        | Run from a clean clone after prerequisites and verify the integrated repository and live external controls.                                                                                     |
| Release and Show HN (#78)                              | Rory Glenn                           | Publish and post only after the release gate and independent verification are complete.                                                                                                         |

## Closure checklist

- [x] The evidence commit is merged `main`, not a PR head.
- [x] PRs #208 and #209 are merged and their documentation/tests appear in the
      named tree.
- [x] #99 is complete against the same or a later merged commit.
- [x] Every acceptance criterion links direct repository or external evidence.
- [x] Every concrete finding is fixed or has an explicit owner/manual
      disposition that does not overclaim launch readiness.
- [x] Generated assets are unchanged and their source/equality/visual checks
      pass.
- [ ] Required checks and maintainer review pass on the final report PR.
- [ ] #137 links this merged report and accurately unblocks #138.

Audit 8 is complete only after the last two checklist items are satisfied by
the report PR and its merged evidence.
