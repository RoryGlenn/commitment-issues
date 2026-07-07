---
name: github-governance
description: "Repository governance, CI gating, Dependabot, and security config for commitment-issues. USE WHEN: editing branch protection or the 'main' ruleset; changing required status checks or the CI Success gate; tuning .github/workflows/ci.yml or the matrix; updating Dependabot grouping; triaging a Dependabot PR that fails CI; managing community-health files, labels, security features, or the roadmap Project. Covers the ruleset id + gh api update flow, why CI Success is the single required check, and the .github/-not-root tarball rule."
---

# GitHub Governance, CI Gating & Dependabot

Repo `RoryGlenn/commitment-issues`, default branch `main`. Governance is intentional and interlocking — change one piece with the others in mind.

## Operational safety

Branch protection, rulesets, required checks, and security toggles are **shared-infrastructure** changes. Confirm with the owner before mutating them, and prefer a read-back to verify. Never weaken protection (drop required checks, allow force-push, enable non-linear merges) as a shortcut to land a change.

## Community-health files live in `.github/`, not the repo root

They are deliberately kept out of the repo root so they stay out of the npm tarball — `package.json` `files` only ships `scripts/`, `assets/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`. The same rule is why `.github/skills/` and `.github/copilot-instructions.md` don't ship either. Present:

`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `CODEOWNERS`, `dependabot.yml`, `PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/{bug_report,feature_request,question,config}.yml`.

If you add a new root-level community file, verify it isn't shipped with `npm pack --dry-run`, or move it under `.github/`.

## Branch protection = a **ruleset**, not legacy branch protection

- Protection for `main` is **ruleset id `18531369`** (name `"main"`, targets `~DEFAULT_BRANCH`). It is **not** legacy branch protection — edit the ruleset, not the old settings page.
- Rules: `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` (0 required approvals; `allowed_merge_methods` = squash + rebase only, to preserve linear history), and `required_status_checks` (single context `CI Success`, non-strict).
- Bypass: `{ actor_type: "RepositoryRole", actor_id: 5, bypass_mode: "always" }` = repo **Admin** (owner). Base role IDs: Read=1, Triage=2, Write=3, Maintain=4, Admin=5.
- Update by PUTting a full ruleset JSON:
  ```bash
  gh api --method PUT repos/RoryGlenn/commitment-issues/rulesets/18531369 --input ruleset.json
  ```
  Then read it back and confirm `current_user_can_bypass == "always"` for the owner.

## The single required check: `CI Success`

- The one required status context is the aggregate job **`CI Success`** in [`.github/workflows/ci.yml`](../../workflows/ci.yml): `needs: [check, pm-smoke]`, `if: always()`, and it `exit 1`s if any needed job's result is `failure` or `cancelled`.
- Requiring this **one** context keeps the required-checks list stable even as the test matrix changes. So: add/remove matrix legs freely, but do **not** rename the `CI Success` job (or add a new required job) without updating ruleset `18531369` to match.
- The matrix `check` job runs on `{ubuntu, macos, windows} × Node {22.22.1, 24}` with `HUSKY: 0`, running `lint`, `format:check`, `test`, `prepublishOnly` (packaging smoke), and `test:coverage` only on ubuntu + Node 24. `pm-smoke` runs the pnpm/yarn/bun lifecycle smokes. (`HUSKY: 0` is why tests must strip it from subprocess env — see the `testing-and-coverage` skill.)

## Dependabot ([`.github/dependabot.yml`](../../dependabot.yml))

- Weekly (Monday), two ecosystems: `npm` (dir `/`) and `github-actions`. `open-pull-requests-limit: 5` each; `dependencies` label (actions PRs also get `ci`).
- Grouping: `dev-minor-and-patch` and `prod-minor-and-patch` batch low-risk npm bumps; `github-actions` batches all action bumps (`patterns: ["*"]`).
- **Major** version bumps are intentionally **not** grouped → they arrive as **individual** PRs. Some (e.g. `eslint` 9→10, `@eslint/js` 9→10) are **expected to fail CI** because they're breaking — the `CI Success` gate correctly blocks them. That's the system working, not a bug to force-merge. Handle the breaking change (or close the PR), don't bypass the gate.

## Security features (enabled)

Private vulnerability reporting, Dependabot alerts, and automated security fixes are on. They were enabled via:

```bash
gh api --method PUT repos/RoryGlenn/commitment-issues/{private-vulnerability-reporting,vulnerability-alerts,automated-security-fixes}
```

## Labels & roadmap

- Non-default labels in use: `dependencies`, `ci`, `security`, `roadmap`.
- Roadmap is **user Project #3** "commitment-issues roadmap" (public, linked to the repo). `gh project` needs the `project` token scope: `gh auth refresh -s project` (answer **N** to the git-credential reconfigure prompt). `gh project edit` uses `--description` (not `--short-description`).

## gh CLI gotcha

`gh run view --json ... --jq` (and other read commands) can still spawn a pager and hang a non-interactive terminal on the alternate screen buffer. **`export GH_PAGER=cat`** before gh read commands in a scripted/agent session. `gh` is already authenticated here.
