# Documentation index

This index separates documentation by audience and names the canonical source
for each kind of product information. User guides describe the supported v3
release. Maintainer and audit evidence remains public in the repository but is
not installed with the npm package unless users need it offline.

## Start here

- [Project overview and quickstart](../README.md)
- [Try it safely in a disposable repository](try-it-safely.md)
- [Before/after workflow and why it matters](why-before-ci.md)
- [Configuration and behavior](configuration.md) — canonical option, default,
  validation, and check behavior reference
- [FAQ and troubleshooting](faq.md)
- [Git terms in plain language](faq.md#git-terms-used-in-this-project) — working
  tree, staged changes, hooks, branches, and other words newcomers encounter
- [Migration guide](migration.md)
- [How commitment-issues works](how-it-works.md)

## Compatibility guides

- [Compatibility and installation support](compatibility.md) — canonical
  package-manager, Node, OS, shell, client, and lifecycle boundary
- [GUI Git-client release checklist](git-client-release-checklist.md) — manual
  VS Code, JetBrains, and GitHub Desktop evidence and deferral rules
- [Monorepos and workspaces](monorepo.md)
- [Yarn Berry](yarn-berry.md)
- [Framework recipes](framework-recipes.md)
- [CI provider recipes](ci-recipes.md)

These guides define environment-specific setup and boundaries. General options
belong in the configuration reference instead of being repeated in each guide.

## Public contracts and trust

- [External interface](external-interface.md) — commands, hooks, scripts, output,
  and exit behavior
- [JSON output](json-output.md) and
  [JSON Schema](json-output.schema.json)
- [Release verification](release-verification.md)
- [Security assurance case](security/assurance-case.md)
- [Current security review](security-review-2026-07.md)
- [Vulnerability history](vulnerability-history.md)
- [Project roles and sensitive access](project-roles.md)
- [Governance](../GOVERNANCE.md)
- [Security policy](../.github/SECURITY.md)

Historical reviews describe the named implementation snapshot they reviewed.
They are evidence, not living descriptions of later code.

## Maintainer and audit evidence

- [Definition of Done](definition-of-done.md) — change, release, promotion, and
  feature-complete maintenance-mode gates
- [Maintainer operations](maintainer-operations.md) — dependencies, repository
  health, package contents, and release housekeeping
- [Semantic project graph](semantic-graph.md) and
  [schema](semantic-graph.schema.json) — repository-only impact navigation,
  evidence, certainty, cache identity, and drift checks
- [Runtime coverage policy](branch-coverage.md)
- [Hook performance and scaling](performance.md)
- [CI performance baseline](ci-performance.md)
- [Scenario coverage](scenario-coverage.md)
- [Core CLI and Git behavior audit](audits/core-cli-git.md)
- [Security, secrets, paths, and subprocesses audit](audits/security-secrets-paths-subprocesses.md)
- [Test quality and meaningful coverage audit](audits/test-quality-and-meaningful-coverage.md)
- [Terminal UX and output architecture audit](audits/terminal-ux-and-output-architecture.md)
- [Package managers and cross-platform behavior audit](audits/package-managers-and-cross-platform.md)
- [CI/CD and GitHub Actions audit](audits/ci-cd-and-github-actions.md)
- [Release, packaging, and upgrades audit](audits/release-packaging-and-upgrades.md)
- [Documentation, governance, and promotional assets audit](audits/documentation-governance-and-promotional-assets.md)
- [Independent final verification preflight](audits/independent-final-verification.md)
- [Message-state gallery](message-states.md)
- [OpenSSF evidence map](openssf-best-practices.md)
- [Feature-planning archive](feature-ideas.md)
- [Adoption checklist](../ADOPTION.md)
- [Roadmap](../ROADMAP.md)

The scenario matrix and message-state gallery are repository evidence. Their
mechanically checkable parts are enforced by tests and maintainer tools; manual
limitations remain written down explicitly.

## Contribution guidance

- [Contributing](../.github/CONTRIBUTING.md)
- [Support](../.github/SUPPORT.md)
- [Code of Conduct](../.github/CODE_OF_CONDUCT.md)

When information overlaps, update the canonical document above and replace
secondary explanations with a short summary and link.
