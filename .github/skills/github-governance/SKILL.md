---
name: github-governance
description: "Repository governance, CI gating, Dependabot, and security config for commitment-issues. USE WHEN: editing branch protection or the 'main' ruleset; changing required status checks or the CI Success gate; tuning .github/workflows/ci.yml or the matrix; updating Dependabot grouping; triaging a Dependabot PR that fails CI; managing community-health files, labels, security features, or the roadmap Project. Covers live ruleset discovery + gh api update flow, why CI Success is the single required check, and the exact package-allowlist boundary for repository-only guidance."
---

# GitHub Governance, CI Gating & Dependabot

Repo `RoryGlenn/commitment-issues`, default branch `main`. Governance is intentional and interlocking — change one piece with the others in mind.

## Operational safety

Branch protection, rulesets, required checks, and security toggles are **shared-infrastructure** changes. Confirm with the owner before mutating them, and prefer a read-back to verify. Never weaken protection (drop required checks, allow force-push, enable non-linear merges) as a shortcut to land a change.

## Community health and agent guidance

Community-health files live in `.github/`. The root [`AGENTS.md`](../../../AGENTS.md)
is the deliberate repository-wide agent-discovery entrypoint; detailed skills
and Copilot guidance remain in `.github/`. `package.json` uses an exact file
allowlist rather than broad directory entries, so neither location is included
in the npm tarball. Present:

`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `CODEOWNERS`, `dependabot.yml`, `PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/{bug_report,feature_request,question,config}.yml`.

If you add repository-only guidance anywhere, verify it is absent from
`npm pack --dry-run`. Do not broaden the package allowlist merely to avoid
listing a new runtime file explicitly.

## Branch protection = a **ruleset**, not legacy branch protection

- Protection for `main` is the active ruleset named `"main"`, targeting
  `~DEFAULT_BRANCH`. At the 2026-07-18 audit its id was `18531369`, but resolve
  and read the live ruleset before every mutation. It is **not** legacy branch
  protection — edit the ruleset, not the old settings page.
- Rules: `deletion`, `non_fast_forward`, `required_linear_history`,
  `pull_request`, `required_status_checks`, and `code_scanning`.
- Pull requests require **1 approval**, dismiss stale approvals after a push,
  require approval of the most recent push by someone other than the pusher,
  require all review threads to be resolved, and allow squash + rebase only.
- Required status checks are **strict** and use the single context
  `CI Success`, so the branch must be current with `main` before merge.
- Bypass: `{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }` = repo **Admin** (owner). Base role IDs: Read=1, Triage=2, Write=3, Maintain=4, Admin=5.
- Resolve the live id, save and review the complete current payload, then update
  by PUTting a full ruleset JSON:
  ```bash
  gh api repos/RoryGlenn/commitment-issues/rulesets \
    --jq '.[] | select(.name == "main" and .enforcement == "active") | .id'
  gh api repos/RoryGlenn/commitment-issues/rulesets/<verified-live-id>
  gh api --method PUT \
    repos/RoryGlenn/commitment-issues/rulesets/<verified-live-id> \
    --input ruleset.json
  ```
  Then read it back and verify every rule, bypass actor, and required status
  context. Do not copy an older checked-in snapshot over live settings.

The sole-maintainer admin bypass is governed by [`GOVERNANCE.md`](../../../GOVERNANCE.md):
normal changes still use a pull request; the temporary exception requires a
green, signed, auditable PR; and direct pushes are reserved for incidents where
the normal path cannot safely be used.

## The single required check: `CI Success`

- The one required status context is the aggregate job **`CI Success`** in [`.github/workflows/ci.yml`](../../workflows/ci.yml). The classifier, DCO, and quality must always succeed. Only an exact, internally consistent pure-documentation add/modify result may leave the OS/Node tests, npm lifecycle, shell compatibility, non-npm package-manager lifecycle, migration lifecycle, and CodeQL skipped; that route still runs the focused documentation, metadata, schema, link, asset, release, formatting, badge-freshness, and policy checks in `quality`. Every deletion/rename/copy, other category, mixed change, unknown path, shallow or missing history, diff failure, unsupported status, executable editor configuration, and missing/failed classifier output launches the full graph. On that route, every dependency must report explicit `success`. The Windows test-shard lanes and npm lifecycle lanes remain separate and parallel after classification.
- Pull requests execute `tools/classify-ci-changes.mjs` from the immutable base commit, not from the proposed fork/head tree. If that trusted source is unavailable (including the initial rollout), the job emits a fixed full-route decision. Extraction or execution failures leave no trusted outputs, which still launches the full graph and makes `CI Success` fail.
- Requiring this **one** context keeps the required-checks list stable even as the test matrix changes. So: add/remove matrix legs freely, but do **not** rename the `CI Success` job (or add a new required job) without updating the active `main` ruleset to match.
- `dco` checks every pull-request commit and every commit on `main` after the
  operational baseline `495d25a2dcfea5f4ee7857fed2b3a1d845ca9a19`.
  [`tools/check-dco-range.mjs`](../../../tools/check-dco-range.mjs) is the
  shared checker. Pull requests use the true merge base so fork PRs and
  branches behind the latest `main` tip audit only their unique commits;
  `main` pushes and manual audits require the immutable baseline to remain an
  ancestor. The required CI job is the single DCO workflow owner; do not add a
  duplicate report. Never advance the baseline to silence a failure.
- The single-lane `quality` job runs actionlint 1.7.12 from a checksum-verified release archive, rejects high-severity dependency advisories, runs lint plus formatting, and owns the focused documentation/metadata policy suite on Ubuntu/Node 24. It has no classifier dependency, so it runs for every pull request.
- The OS/Node evidence covers `{ubuntu, macos, windows} × Node {22.11.0, 24}` with `COMMITMENT_ISSUES: 0`. Ubuntu runs the complete suite under the two unsharded 100% coverage gates, and Node 24 also verifies badge freshness. macOS runs the complete suite unsharded on both Node lines. Windows divides the same top-level test-file set between the complementary native Node shards `1/2` and `2/2` on each Node line; together they assign every file exactly once. The packed npm lifecycle integration remains represented once per OS/Node combination and runs in separate Windows jobs so it stays parallel with the shards. `pm-lifecycle` runs pnpm 10, Yarn Classic 1.22.22, Yarn Berry 4.17.0 with `nodeLinker: node-modules`, and Bun 1.3.14 on all three OSes at Node 24 plus exact-minimum-Node lanes on Ubuntu. (`COMMITMENT_ISSUES=0` skips generated hooks — tests must strip it and legacy `HUSKY` from subprocess env; see the `testing-and-coverage` skill.)
- The `codeql` job calls the scheduled/manual CodeQL workflow as a reusable
  workflow. `CI Success` therefore blocks merges on analysis failures without
  adding another required status context. The separate live `code_scanning`
  rule evaluates the alerts produced by a successful analysis.
- The active `main` ruleset has enforced `CodeQL` tool-severity `errors` and security
  severity `high_or_higher` since 2026-07-16. Its full read-back preserved every
  deletion, history, review, required-check, and admin-bypass control. The rule
  is:
  ```json
  {
    "type": "code_scanning",
    "parameters": {
      "code_scanning_tools": [
        {
          "tool": "CodeQL",
          "alerts_threshold": "errors",
          "security_alerts_threshold": "high_or_higher"
        }
      ]
    }
  }
  ```
  Disposable [PR #216](https://github.com/RoryGlenn/commitment-issues/pull/216)
  proved the negative path: analysis completed, then the ruleset's `CodeQL`
  check failed on an Error/Critical command-injection alert and kept the PR
  blocked. Clean [PR #217](https://github.com/RoryGlenn/commitment-issues/pull/217)
  passed both CodeQL analysis and the ruleset's alert check. GitHub excludes
  merge-queue groups and Dependabot PRs analyzed by default setup; this
  repository currently uses advanced setup and no merge queue. Roll back by
  restoring the captured full payload with only the `code_scanning` rule
  removed; never remove required CodeQL from `CI Success`.

## Dependabot ([`.github/dependabot.yml`](../../dependabot.yml))

- Weekly (Monday), two ecosystems: `npm` (dir `/`) and `github-actions`. Routine releases have a seven-day cooldown; security updates bypass it. `open-pull-requests-limit: 5` each; `dependencies` label (actions PRs also get `ci`).
- Grouping: `dev-minor-and-patch` and `prod-minor-and-patch` batch low-risk npm bumps; `github-actions` batches all action bumps (`patterns: ["*"]`).
- **Major** version bumps are intentionally **not** grouped → they arrive as **individual** PRs. Some (e.g. `eslint` 9→10, `@eslint/js` 9→10) are **expected to fail CI** because they're breaking — the `CI Success` gate correctly blocks them. That's the system working, not a bug to force-merge. Handle the breaking change (or close the PR), don't bypass the gate.

## Security features

At the 2026-07-18 audit, private vulnerability reporting, Dependabot alerts,
Dependabot security updates, automated security fixes, secret scanning, and
secret-scanning push protection were enabled. Read the live repository and
security endpoints before reporting or changing their state:

```bash
gh api repos/RoryGlenn/commitment-issues --jq .security_and_analysis
gh api repos/RoryGlenn/commitment-issues/private-vulnerability-reporting
gh api --include repos/RoryGlenn/commitment-issues/vulnerability-alerts
gh api repos/RoryGlenn/commitment-issues/automated-security-fixes
```

Enabling or disabling a security feature is a separate mutating action; do not
copy a historical PUT command without rechecking the requested target state.

## Labels & roadmap

- Treat the live label list as authoritative; do not infer that the four labels
  used by automation and roadmap work are the complete set:
  ```bash
  gh api repos/RoryGlenn/commitment-issues/labels --paginate --jq '.[].name'
  ```
- Roadmap is **user Project #3** "commitment-issues roadmap" (public, linked to
  the repo). Read-only `gh project view` needs `read:project`; edits need
  `project`. Refresh the narrow scope required for the operation (answer **N**
  to the git-credential reconfigure prompt). `gh project edit` uses
  `--description` (not `--short-description`).

## GitHub CLI gotcha

When `gh` is available, `gh run view --json ... --jq` (and other read commands)
can still spawn a pager and hang a non-interactive terminal on the alternate
screen buffer. Set `GH_PAGER=cat` before scripted reads and verify
authentication instead of assuming it. Prefer the connected GitHub app when
it covers the operation.
