# Project Roles and Sensitive Access

This document is the current membership, access, and sensitive-authority
record. Role authority and responsibilities are defined once in
[Governance](../GOVERNANCE.md). It records public account handles and access
decisions only; never add email addresses, credentials, secret names or values,
private-report identities, or other unnecessary personal data.

## Current project members

| Member     | GitHub                                     | Role(s)                                       | Sensitive authority                                                                                                                                                           |
| ---------- | ------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rory Glenn | [@RoryGlenn](https://github.com/RoryGlenn) | Maintainer, release manager, security contact | Repository ownership and administration, rulesets, Actions and environment settings, private security reports and advisories, npm ownership and publishing, release authority |

## Time-bounded contributor access

The following non-maintainers retain direct write access only while completing
their current assigned work:

| Account                                                      | GitHub access | Approved purpose and evidence                                                                                           | Recheck or remove by                   |
| ------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [@tdkchandler](https://github.com/tdkchandler)               | Write         | Implement assigned [issue #141](https://github.com/RoryGlenn/commitment-issues/issues/141) on its existing topic branch | Issue closure or **2026-08-15**, first |
| [@rahul-aravind-opti](https://github.com/rahul-aravind-opti) | Write         | Implement assigned [issue #142](https://github.com/RoryGlenn/commitment-issues/issues/142)                              | Issue closure or **2026-08-15**, first |

GitHub personal-account repositories do not offer organization-style custom
roles. Their [collaborator permission](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)
is technically broader than this project's approved scope: it permits topic
branch pushes, merge-affecting reviews, pull-request merges, and GitHub Release
management. These contributors are approved only to push assigned topic
branches, maintain their assigned issue, open pull requests, and provide
requested reviews. They are not maintainers and are not authorized to merge,
create or edit releases, create version tags, change release workflows outside
a reviewed pull request, or act for the project on npm or private security
reports.

The active `main` and `v*` rulesets technically enforce the most important
parts of that policy. The remaining broader GitHub Release capability is an
accepted, time-bounded limitation of keeping this repository under a personal
account. Remove direct access when the assignment ends. If ongoing contributors
need narrower custom roles, move the repository to an organization instead of
normalizing excess personal-repository access.

## Sensitive resources

Sensitive project resources include:

- GitHub repository administration;
- branch protection and repository rules;
- GitHub Actions workflow administration;
- GitHub Actions secrets and environment settings;
- GitHub Security Advisories and private vulnerability reports;
- npm package ownership and publishing access;
- GitHub Release creation and version tags;
- CODEOWNERS and policy files;
- deploy keys, webhooks, and dependency/security settings.

## Effective authority matrix

| Resource or action                           | Effective technical authority                                                                                                                                                                                                                                                  | Approved authority and control                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository administration and rulesets       | `@RoryGlenn` is the sole owner/admin. Direct collaborators have write, not admin.                                                                                                                                                                                              | Rory only. Active rulesets are publicly inspectable; only the owner/admin may change their rules or bypass lists.                                                                                                                                                                                 |
| `main` changes and merges                    | Write collaborators can review and can technically merge a compliant pull request. The active [`main`](https://github.com/RoryGlenn/commitment-issues/rules/18531369) ruleset has admin-only bypass.                                                                           | Rory performs merges under [Governance](../GOVERNANCE.md). Normal changes require one independent approval, approval of the latest push, resolved threads, strict `CI Success`, and linear history. The documented sole-maintainer exception is the only routine admin bypass.                    |
| `v*` release tags                            | [`release-tag-authority`](https://github.com/RoryGlenn/commitment-issues/rules/18965736) permits creation only through the admin bypass. [`immutable-release-tags`](https://github.com/RoryGlenn/commitment-issues/rules/18965738) blocks updates and deletion with no bypass. | Rory alone may create a new version tag after reviewed release preparation. No human or app may routinely move or delete a consumed version tag.                                                                                                                                                  |
| GitHub Actions, secrets, and environments    | Rory administers Actions settings, repository/environment secrets, and the current non-release `copilot` environment. Workflow tokens receive only each job's declared permissions.                                                                                            | Contributors may propose workflow changes through reviewed pull requests and run only GitHub-permitted workflows. The default workflow token is read-only and cannot approve pull requests. Release jobs receive narrowly scoped OIDC or `contents` permission only after an authorized `v*` tag. |
| GitHub Releases                              | Personal-repository write collaborators can manage mutable Releases. Current published Releases are immutable; the release workflow creates the reviewed version release using a job token.                                                                                    | Rory and the release workflow only. Contributors must not create or edit Releases. The admin-only version-tag rule prevents a contributor from initiating the npm publication workflow, and immutability prevents later changes to published release assets.                                      |
| npm package                                  | The public registry lists `roryglenn` as the sole package owner. `.github/workflows/publish.yml` uses GitHub OIDC rather than a stored npm token and stages exact candidates for maintainer 2FA approval; the latest published baseline has provenance.                        | Rory controls package ownership, 2FA approval, and registry settings. Before each release, verify the trusted publisher remains stage-only, direct OIDC publish remains disabled, traditional tokens remain disallowed, and no automation token exists.                                           |
| Private vulnerability reports                | Private vulnerability reporting is enabled. Repository ownership, not collaborator write, controls security-advisory and private-report administration on this personal repository.                                                                                            | Rory is the sole security contact and coordinates reports under [Security](../.github/SECURITY.md). Contributors receive no private report details unless explicitly added to one advisory for a documented need.                                                                                 |
| Deploy keys, webhooks, and security settings | Rory is the sole owner/admin. The 2026-07-15 review found no deploy keys and one active integration webhook; no credential or endpoint detail is recorded here.                                                                                                                | Rory only. Review the continued need and least privilege of integrations without copying sensitive configuration into the repository.                                                                                                                                                             |

## Recurring access review

**Owner:** Rory Glenn, repository owner.

**Cadence:** monthly, before every release, and immediately after any membership,
permission, release-process, security-process, or suspected-credential change.

For each review:

1. List direct collaborators and compare every permission with this roster,
   approved purpose, assigned work, and review deadline.
2. Remove direct access when assigned work ends. Prefer public forks and pull
   requests; retain write only when a documented active task needs direct topic
   branches.
3. Inspect the live `main` and `v*` rulesets, including enforcement, target
   patterns, rules, and bypass actors. Confirm version-tag creation remains
   admin-only and update/deletion remains blocked without bypass.
4. Review Actions enablement, allowed actions, default token permissions,
   workflow approval policy, repository secrets, environments, and release-job
   permissions. Record counts or dispositions, never secret names or values.
5. Confirm all published GitHub Releases remain immutable and that only the
   reviewed tag workflow creates version releases.
6. Confirm npm owners by handle, then use the owner-authenticated package UI to
   check the trusted publisher repository, workflow filename, optional
   environment, stage-publish-only permission, disabled direct publish,
   publishing-access policy, and unused tokens.
7. Verify private vulnerability reporting, secret scanning, push protection,
   dependency alerts, deploy keys, and webhooks remain intentionally configured.
8. Add a dated result below with reviewer, evidence sources, each access
   decision, exceptions, follow-ups, and the next scheduled review. Do not add
   credentials, emails, private-report identities, or integration endpoints.

## Review record

### 2026-07-16 — npm release-control follow-up

- **Review owner:** Rory Glenn.
- **Evidence sources:** owner-authenticated npm CLI web authorization,
  privacy-bounded trusted-publisher and package-access read-backs, a sanitized
  account-token count, the checked-in release workflow, and the 3.4.0 release
  preflight. No credential, token identifier, email address, or account detail
  is recorded here.
- **Trusted publisher:** GitHub Actions names
  `RoryGlenn/commitment-issues` and `publish.yml`, has no Environment claim,
  and permits package publication. The checked-in workflow matches that
  identity, uses `id-token: write`, and contains no npm token or release
  Environment binding.
- **Publishing access:** package publishing was set to `mfa=publish`, requiring
  2FA and preventing traditional automation tokens from overriding it. The npm
  account uses `auth-and-writes` 2FA.
- **Credentials:** the privacy-bounded account-token inventory returned zero
  tokens, so there was no obsolete publishing credential to revoke or
  separately disposition.
- **Outcome:** the owner-only control in
  [issue #195](https://github.com/RoryGlenn/commitment-issues/issues/195) is
  satisfied. `npm run release:preflight -- 3.4.0` passed after the review. No
  package version, tag, GitHub Release, registry version, or publication was
  created or changed.
- **Next scheduled review:** before the 3.4.0 release, or **2026-08-15** if no
  release occurs first.

### 2026-07-15

- **Review owner:** Rory Glenn.
- **Evidence sources:** live GitHub collaborator, ruleset, Actions, environment,
  release, private-reporting, security-setting, deploy-key, and webhook APIs;
  the public npm owner and attestation metadata; the checked-in release workflow;
  and the current assigned-issue/topic-branch state.
- **Repository access:** one owner/admin (`@RoryGlenn`) and two direct write
  collaborators. `@tdkchandler` is assigned #141 and has an active topic
  branch; `@rahul-aravind-opti` is assigned #142. Retain both only for those
  active assignments and recheck at issue closure or 2026-08-15, whichever is
  earlier.
- **Rules:** the active `main` ruleset has repository-admin bypass and the
  documented review/status controls. Active `v*` rules permit creation only by
  repository admin and prohibit update/deletion with no bypass.
- **Actions and environments:** Actions are enabled; the default workflow token
  is read-only and cannot approve pull requests. The only environment is
  `copilot`, with no protection rules or secrets, and the release workflow does
  not use it. No repository, Dependabot, Codespaces, or environment secrets
  were present.
- **Releases and npm:** all ten current GitHub Releases report immutable. The
  registry lists only the `roryglenn` owner, and v3.3.2 exposes npm provenance.
  The npm CLI was not owner-authenticated and no browser session was available,
  so the exact trusted-publisher and publishing-access settings remain the
  manual owner release gate tracked in
  [issue #195](https://github.com/RoryGlenn/commitment-issues/issues/195).
- **Security and integrations:** private vulnerability reporting, secret
  scanning, push protection, and Dependabot security updates are enabled. No
  deploy keys were present. One active integration webhook remains configured;
  its endpoint and other sensitive configuration were intentionally not copied.
- **Outcome:** no access was removed. The two write grants are documented as
  time-bounded contributor access, not maintainer, release, npm, repository
  administration, or security-report authority. Personal-repository Release
  permissions remain the residual capability to monitor.
- **Next scheduled review:** **2026-08-15**, or earlier at the next release or
  any access/process change.

## Review continuity and temporary exception

The project currently has one trusted maintainer and no separately authorized
backup for repository administration, npm publishing, or private security
reports. The two time-bounded contributors above do not provide that sensitive
continuity. This is a documented risk, not evidence of two-person coverage.

Prospective enforcement was adopted on **2026-07-10** at commit
[`81a9e412bc347f01300df62505ee378284646d15`](https://github.com/RoryGlenn/commitment-issues/commit/81a9e412bc347f01300df62505ee378284646d15).
After the documented one-time exception in
[issue #160](https://github.com/RoryGlenn/commitment-issues/issues/160), the
first operational audit baseline was **2026-07-12**, commit
[`265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5`](https://github.com/RoryGlenn/commitment-issues/commit/265d2e6c9c12349a1c06fa8a9a6c6d3ac957e6d5).
The separately recorded malformed-trailer exception in
[issue #221](https://github.com/RoryGlenn/commitment-issues/issues/221) moves
the current operational audit baseline to **2026-07-16**, commit
[`495d25a2dcfea5f4ee7857fed2b3a1d845ca9a19`](https://github.com/RoryGlenn/commitment-issues/commit/495d25a2dcfea5f4ee7857fed2b3a1d845ca9a19).
Normal changes use pull requests and the live ruleset's independent approval
requirement. Until a second trusted reviewer or maintainer is added, Rory Glenn
may use the admin bypass for an otherwise green pull request only under the
temporary exception in [Governance](../GOVERNANCE.md). The pull request must
record the exception; DCO, `CI Success`, and resolved-thread requirements still
apply.

Continuity actions:

- recruit and onboard a second trusted reviewer or maintainer without naming a
  person before they accept the role;
- grant only the minimum access needed for that person's responsibilities,
  including the repository permission needed for their approval to satisfy the
  live ruleset;
- review GitHub, npm, Actions, release, and security-report coverage on the
  recurring cadence above; and
- update this roster immediately when backup coverage exists, then retire the
  single-maintainer exception.
