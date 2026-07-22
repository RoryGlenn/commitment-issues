# Repository Health Reviews

A Repository Health Review (RHR) is a maintainer-led engineering
self-assessment. It is not an independent audit, certification, or compliance
claim. RHRs turn the reusable procedures from production-readiness review
[#101](https://github.com/RoryGlenn/commitment-issues/issues/101) and domains
[#130–#138](https://github.com/RoryGlenn/commitment-issues/issues/130) into a
repeatable process while keeping each run's evidence immutable.

GitHub Issues are the system of record. A Project may provide another view, but
starting, conducting, or closing a review never requires Jira, a GitHub
Project, or a hosted service.

## Records and terminology

- The [versioned control catalog](rhr-control-catalog-v1.json) owns stable
  objectives, scope, procedures, evidence, pass criteria, ownership, cadence,
  triggers, dependencies, automation status, and control links.
- A **run** is one dated use of a specific catalog version. It has an immutable
  ID such as `RHR-2026-Q3` and one parent GitHub issue.
- A **domain execution** is one linked issue generated for one catalog domain
  in one run. Stable instructions are copied from the named catalog version;
  observations and evidence belong only to that run.
- A **finding** is a bug, risk, or improvement discovered during a domain
  execution. A finding receives a separate issue when it is not fixed
  immediately.
- A **health result** is green, amber, or red. It describes repository health,
  not whether the review work is finished.

Never reopen, overwrite, or retitle an old RHR to represent a new assessment.
Historical parent, domain, and finding issues remain evidence for the exact
run and commit range they name.

## Roles

- The **RHR coordinator** selects the run ID, catalog version, baseline,
  trigger, scope, and reviewers; creates or resumes the issue set; and closes
  the parent after every domain and finding has a disposition.
- A **domain owner** performs the catalog procedure, records dated evidence,
  and files or links findings. The owner may delegate checks but remains
  responsible for the domain record.
- A **finding owner** records impact, target, disposition, remediation or risk
  acceptance, and verification.
- The **independent reviewer** performs `RHR-09` from a clean checkout and sets
  the final health recommendation without relying only on earlier summaries.
- The **repository administrator** supplies read-only evidence for live GitHub
  controls. Changes to rulesets, required checks, security settings, or other
  shared infrastructure remain separately authorized operations.

One person may hold more than one role in a single-maintainer project. The
issue record must still name which responsibility they are performing.

## Cadence and triggers

Run a full RHR quarterly while the project is changing rapidly, then at least
semiannually in a stable maintenance period. Automated controls continue in CI
and the weekly `Repository Health` workflow between human reviews.

Start a full or explicitly scoped event-driven RHR after a material change to:

- builds, test architecture, release or package identity, provenance, or
  publishing;
- supported Node.js, package managers, operating systems, shells, workspaces,
  IDEs, or Git clients;
- workflow permissions, required checks, repository ownership, maintainer
  access, rulesets, or security controls;
- process execution, secret handling, path or hook ownership, user-work
  mutation, or another security boundary; or
- public behavior, compatibility promises, governance, or maintenance scope.

A scoped RHR must name the included domains and explain why omitted domains are
unaffected. Dependencies in the catalog still apply. `RHR-09` verifies the
integrated scoped result before closure.

## Health ratings

- **Green:** no open Critical or High finding; required controls are effective;
  remaining lower-severity work has an owner and does not materially weaken the
  product promise.
- **Amber:** the review is complete, but a material limitation, unverified
  environment, accepted Medium risk, or scheduled remediation needs visible
  follow-up. The parent names the owner and revisit date or trigger.
- **Red:** a Critical or High finding, failed required control, undispositioned
  security or release risk, or loss of the product's safety promise requires
  immediate attention. A red review can still close once the assessment and
  dispositions are complete.

Do not keep a parent or domain open merely to represent amber or red health.
Use finding issues for remediation and the parent health rationale for the
current assessment.

## Catalog versioning

The catalog uses semantic versions:

- patch: wording or link corrections that do not change a procedure or result;
- minor: a backward-compatible control, evidence requirement, or trigger is
  added; and
- major: a control is removed, renamed, reordered incompatibly, or changes
  meaning in a way that prevents comparison with earlier runs.

Change the existing catalog file only while preparing an unreleased catalog
version. After a run references a version, preserve that file and add a new
versioned file for later changes. The generated issue bodies retain the stable
instructions used by their run, so a later catalog cannot rewrite historical
evidence.

The generator validates required fields, unique control IDs, dependency
targets, dependency cycles, automation ownership, and catalog version format
before it previews or creates anything.

## Start a review

1. Choose an unused ID such as `RHR-2026-Q3`. Event-driven names may use an
   uppercase suffix such as `RHR-2026-RELEASE`.
2. Fetch the intended baseline and run `git rev-parse HEAD`. Keep the complete
   40-character output.
3. Preview the complete parent and nine domain payloads. Preview is the default
   and does not access GitHub:

   ```sh
   node tools/rhr.mjs \
     --run-id RHR-2026-Q3 \
     --reviewer @RoryGlenn \
     --start-date 2026-07-21 \
     --baseline-sha 0123456789abcdef0123456789abcdef01234567 \
     --trigger "Quarterly review" \
     --scope "Full catalog" \
     --tool-version "npm=11.17.0"
   ```

4. Review the JSON preview for the run metadata, stable instructions, ordering,
   and accidental duplication. Save it as evidence if the run requires a
   formal setup review.
5. Create the issues only after the preview is correct by repeating the command
   with `--create`. The create path requires an authenticated GitHub CLI.

The generator takes three paginated snapshots of every open and closed issue
before writing, allowing GitHub's newly created records time to become
consistent. Hidden stable markers identify the parent and each
`(run ID, domain ID)` pair. An ordinary `--create` rerun reuses a complete run
but stops if the run appears partial; a briefly stale listing must never be
interpreted as permission to recreate domains.

For a confirmed interrupted run, inspect the parent, wait for GitHub to show
the issues that succeeded, then repeat the command with `--resume` instead of
`--create`. Resume creates only missing domains and refreshes the parent's
linked task list without replacing review evidence or checked tasks. If
duplicate marked issues already exist, the generator stops rather than
guessing which record is authoritative. Issues already closed explicitly as
duplicates are retained as history but excluded from the canonical run.

Use `--repo owner/name` only for an intentional fork or transferred repository.
Use `--catalog path/to/catalog.json` to select another compatible catalog
version explicitly. `--dry-run` is accepted when an explicit mode is useful;
it cannot be combined with `--create` or `--resume`.

## Conduct a review

Work in catalog dependency order. `RHR-01` and `RHR-02` may begin together;
test quality follows their settled contracts; UX and compatibility may then
run together; CI, release, documentation, and independent verification remain
sequential.

For each domain:

1. record actual start date and reviewer;
2. perform every procedure step or mark it not applicable with a reason;
3. record dated commands, results, commit SHAs, workflow run URLs, artifacts,
   live-setting read-backs, and manual observations;
4. do not treat an old link or passing percentage as proof that a check was
   rerun;
5. fix a small finding with its regression evidence or create a separate
   finding issue; and
6. record `pass` or `findings filed`, the final evidence commit, and completion
   date.

A domain closes when its checks were performed, evidence was recorded, and
every finding was fixed immediately or filed separately. It does not wait for
all linked remediation to finish.

## Findings and dispositions

Use the **RHR finding** issue form. Record:

- parent run and domain links;
- Critical, High, Medium, or Low severity;
- evidence, impact, and the affected baseline;
- owner and target date or milestone;
- one disposition: `scheduled`, `deferred`, `risk accepted`, `fixed during
review`, `duplicate`, or `not reproducible`;
- remediation commit or pull request and independent verification; and
- risk-acceptance owner, rationale, compensating control, and expiry date when
  accepted.

`maintenance` is the only required label, so the process works in a repository
without custom label administration. Generated titles include the run and
domain IDs; manual forms use `[RHR]`, `[RHR Domain]`, and `[RHR Finding]`
prefixes. Hidden generator markers provide the duplicate-safe identity.
Repositories may add `rhr`, `rhr-domain`, `rhr-finding`, `severity:*`, or
`disposition:*` labels as optional views; the issue fields, not those optional
labels, remain authoritative.

Severity means:

- **Critical:** active compromise, destructive data loss, or an unsafe release
  boundary requiring immediate containment;
- **High:** a practical security, release, installation, reversibility, or
  product-promise failure that blocks green health;
- **Medium:** material reliability, support, or maintenance risk with a bounded
  workaround or compensating control; and
- **Low:** localized quality or clarity gap with limited impact.

## Close and revisit a review

Close the parent when every included domain is complete and each finding is
fixed, assigned and scheduled, explicitly deferred, or risk accepted with an
owner and expiry. Before closure, record:

- completion date and final commit SHA;
- green, amber, or red plus a concise rationale;
- open finding counts and links by severity and disposition;
- unavailable or unverified evidence;
- relevant tool and runtime versions; and
- the next scheduled date or event-driven revisit trigger.

Later remediation updates and closes the finding issue. It may add a short link
back to the immutable RHR, but it does not rewrite the domain's original result
or retroactively change the parent health rating. A later RHR assesses current
health with a new ID and catalog version.

## Templates and optional views

The repository issue chooser provides forms for a parent run, domain execution,
and finding. Manual forms are recovery and one-off entry points; use the
generator for a complete run so catalog instructions and duplicate protection
remain synchronized.

GitHub task lists in the parent provide the required ordinary-Issues view. A
Project may group run, domain, and finding issues by run ID, severity,
disposition, or owner, but no closure rule depends on Project fields.

## Pilot protocol

The first generated run is a setup pilot. Before considering #179 complete:

1. generate its dry-run payload from catalog v1;
2. inspect every domain for missing identity, procedure, evidence, result,
   finding, and closure fields;
3. compare stable instructions across domains for accidental duplication;
4. verify interrupted-run and complete-rerun behavior with automated tests;
5. create the live parent and linked domains; and
6. record usability observations and any required follow-up in the parent or
   implementation pull request.

The pilot does not need to complete all nine health assessments before the RHR
system is usable. It must prove that an ordinary GitHub Issues run can be
created, navigated, resumed without duplicates, and populated without a
separate project-management system.
