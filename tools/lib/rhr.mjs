// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

const CATALOG_VERSION = /^\d+\.\d+\.\d+$/u;
const CONTROL_ID = /^RHR-\d{2}$/u;
const RUN_ID = /^RHR-\d{4}-(?:Q[1-4]|H[12]|[A-Z0-9][A-Z0-9-]{0,23})$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const AUTOMATION_STATUSES = new Set(["automated", "hybrid", "manual"]);
const DOMAIN_PROGRESS_START = "<!-- rhr:domains:start -->";
const DOMAIN_PROGRESS_END = "<!-- rhr:domains:end -->";
const RUN_MARKER =
  /^<!-- rhr:run=([^;\s]+);type=(parent|domain)(?:;domain=([^;\s]+))? -->$/mu;

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function singleLine(value, label) {
  const result = requiredString(value, label);
  if (/[\r\n<>]/u.test(result)) {
    throw new Error(
      `${label} must be one line and cannot contain angle brackets.`,
    );
  }
  return result;
}

function stringList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value.map((item, index) => singleLine(item, `${label}[${index}]`));
}

/** Collect every page from an API that uses a fixed page size. */
export async function collectIssuePages(requestPage, pageSize = 100) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await requestPage(page);
    if (!Array.isArray(batch)) {
      throw new Error(`GitHub issue page ${page} was not an array.`);
    }
    issues.push(...batch);
    if (batch.length < pageSize) return issues;
  }
}

function validDate(value, label) {
  const result = singleLine(value, label);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!DATE.test(result) || Number.isNaN(parsed.valueOf())) {
    throw new Error(`${label} must be a real date in YYYY-MM-DD format.`);
  }
  if (parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${label} must be a real date in YYYY-MM-DD format.`);
  }
  return result;
}

function validateLinks(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  return value.map((link, index) => {
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      throw new Error(`${label}[${index}] must be an object.`);
    }
    return {
      label: singleLine(link.label, `${label}[${index}].label`),
      target: singleLine(link.target, `${label}[${index}].target`),
    };
  });
}

function assertAcyclic(domains) {
  const dependencies = new Map(
    domains.map((domain) => [domain.id, domain.dependencies]),
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) {
      throw new Error(`Catalog dependency cycle includes ${id}.`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }

  for (const domain of domains) visit(domain.id);
}

/**
 * Validate and normalize a versioned RHR control catalog.
 *
 * @param {unknown} value Parsed catalog value.
 * @returns {object} Normalized catalog.
 */
export function validateCatalog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Catalog must be an object.");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("Catalog schemaVersion must be 1.");
  }
  const catalogVersion = singleLine(value.catalogVersion, "catalogVersion");
  if (!CATALOG_VERSION.test(catalogVersion)) {
    throw new Error("catalogVersion must use semantic versioning.");
  }
  const repository = singleLine(value.repository, "repository");
  if (!REPOSITORY.test(repository)) {
    throw new Error("repository must use owner/name format.");
  }
  const sourceIssues = stringList(value.sourceIssues, "sourceIssues");
  if (!Array.isArray(value.domains) || value.domains.length === 0) {
    throw new Error("domains must be a non-empty array.");
  }

  const domains = value.domains.map((domain, index) => {
    const label = `domains[${index}]`;
    if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
      throw new Error(`${label} must be an object.`);
    }
    const id = singleLine(domain.id, `${label}.id`);
    if (!CONTROL_ID.test(id)) {
      throw new Error(`${label}.id must match RHR-NN.`);
    }
    const dependencies = Array.isArray(domain.dependencies)
      ? domain.dependencies.map((item, dependencyIndex) =>
          singleLine(item, `${label}.dependencies[${dependencyIndex}]`),
        )
      : null;
    if (!dependencies) {
      throw new Error(`${label}.dependencies must be an array.`);
    }
    const automation = domain.automation;
    if (
      !automation ||
      typeof automation !== "object" ||
      Array.isArray(automation)
    ) {
      throw new Error(`${label}.automation must be an object.`);
    }
    const status = singleLine(automation.status, `${label}.automation.status`);
    if (!AUTOMATION_STATUSES.has(status)) {
      throw new Error(
        `${label}.automation.status must be automated, hybrid, or manual.`,
      );
    }
    const cadence = domain.cadence;
    if (!cadence || typeof cadence !== "object" || Array.isArray(cadence)) {
      throw new Error(`${label}.cadence must be an object.`);
    }

    return {
      id,
      title: singleLine(domain.title, `${label}.title`),
      objective: requiredString(domain.objective, `${label}.objective`),
      scope: stringList(domain.scope, `${label}.scope`),
      procedure: stringList(domain.procedure, `${label}.procedure`),
      requiredEvidence: stringList(
        domain.requiredEvidence,
        `${label}.requiredEvidence`,
      ),
      passCriteria: stringList(domain.passCriteria, `${label}.passCriteria`),
      owner: singleLine(domain.owner, `${label}.owner`),
      cadence: {
        normal: singleLine(cadence.normal, `${label}.cadence.normal`),
        triggers: stringList(cadence.triggers, `${label}.cadence.triggers`),
      },
      dependencies,
      automation: {
        status,
        continuousEvidence: stringList(
          automation.continuousEvidence,
          `${label}.automation.continuousEvidence`,
        ),
        manualEvidence: stringList(
          automation.manualEvidence,
          `${label}.automation.manualEvidence`,
        ),
      },
      links: validateLinks(domain.links, `${label}.links`),
    };
  });

  const ids = new Set();
  for (const domain of domains) {
    if (ids.has(domain.id)) {
      throw new Error(`Catalog contains duplicate domain ${domain.id}.`);
    }
    ids.add(domain.id);
  }
  for (const domain of domains) {
    for (const dependency of domain.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`${domain.id} has unknown dependency ${dependency}.`);
      }
      if (dependency === domain.id) {
        throw new Error(`${domain.id} cannot depend on itself.`);
      }
    }
  }
  assertAcyclic(domains);

  return {
    schemaVersion: 1,
    catalogVersion,
    repository,
    title: singleLine(value.title, "title"),
    sourceIssues,
    domains,
  };
}

/**
 * Validate and normalize immutable run metadata.
 *
 * @param {unknown} value Run metadata.
 * @param {object} catalog Validated catalog.
 * @returns {object} Normalized run metadata.
 */
export function validateRun(value, catalog) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Run metadata must be an object.");
  }
  const runId = singleLine(value.runId, "runId");
  if (!RUN_ID.test(runId)) {
    throw new Error(
      "runId must match RHR-YYYY-QN, RHR-YYYY-HN, or RHR-YYYY-NAME.",
    );
  }
  const baselineSha = singleLine(value.baselineSha, "baselineSha");
  if (!COMMIT_SHA.test(baselineSha)) {
    throw new Error("baselineSha must be a full 40-character commit SHA.");
  }
  const repository = singleLine(
    value.repository ?? catalog.repository,
    "repository",
  );
  if (!REPOSITORY.test(repository)) {
    throw new Error("repository must use owner/name format.");
  }
  const suppliedVersions = Array.isArray(value.toolVersions)
    ? value.toolVersions.map((item, index) =>
        singleLine(item, `toolVersions[${index}]`),
      )
    : [];
  const toolVersions = [
    `Node.js ${process.version}`,
    `RHR catalog ${catalog.catalogVersion}`,
    ...suppliedVersions,
  ];

  return {
    runId,
    repository,
    reviewer: singleLine(value.reviewer, "reviewer"),
    startDate: validDate(value.startDate, "startDate"),
    baselineSha,
    trigger: singleLine(value.trigger, "trigger"),
    scope: singleLine(value.scope, "scope"),
    toolVersions: [...new Set(toolVersions)],
  };
}

export function parentTitle(run) {
  return `[${run.runId}] Repository Health Review`;
}

export function domainTitle(run, domain) {
  return `[${run.runId}][${domain.id}] ${domain.title}`;
}

function bulletList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

function nestedBulletList(values) {
  return values.map((value) => `  - ${value}`).join("\n");
}

function checklist(values) {
  return values.map((value) => `- [ ] ${value}`).join("\n");
}

function links(values) {
  return values.map((link) => `- [${link.label}](${link.target})`).join("\n");
}

function issueReference(issue) {
  return issue?.url ? `[#${issue.number}](${issue.url})` : "_planned_";
}

function domainProgress(catalog, domainIssues, previous = "") {
  const previousLines = new Map();
  for (const line of previous.split("\n")) {
    const id = line.match(/`(RHR-\d{2})`/u)?.[1];
    if (id) previousLines.set(id, line);
  }
  return catalog.domains
    .map((domain) => {
      const issue = domainIssues.get(domain.id);
      const previousLine = previousLines.get(domain.id);
      if (
        previousLine &&
        (issue
          ? previousLine.includes(`[#${issue.number}]`)
          : previousLine.includes("_planned_"))
      ) {
        return previousLine;
      }
      return `- [ ] ${issueReference(issue)} \`${domain.id}\` — ${domain.title}`;
    })
    .join("\n");
}

export function renderParentBody(run, catalog, domainIssues = new Map()) {
  const domains = domainProgress(catalog, domainIssues);

  return `<!-- rhr:run=${run.runId};type=parent -->
This issue is the immutable parent record for **${run.runId}**. Do not reuse it for a later review.

## Run identity

- **Run ID:** \`${run.runId}\`
- **Control catalog:** v${catalog.catalogVersion}
- **Start date:** ${run.startDate}
- **Completion date:** _Pending_
- **Baseline commit:** \`${run.baselineSha}\`
- **Final commit:** _Pending_
- **Reviewer:** ${run.reviewer}
- **Trigger:** ${run.trigger}
- **Scope:** ${run.scope}
- **Health result:** _Pending — set exactly one of green, amber, or red at closure_

### Tool and runtime versions

${bulletList(run.toolVersions)}

## Domain progress

${DOMAIN_PROGRESS_START}
${domains}
${DOMAIN_PROGRESS_END}

## Findings and dispositions

- [ ] Every discovered finding is fixed immediately or linked as a separate issue.
- [ ] Every open finding has an owner and one disposition: scheduled, deferred, or risk accepted.
- [ ] Every risk acceptance names an owner and expiry date.
- [ ] Critical and High findings are called out in the final health rationale.

## Closure record

- **Health rationale:** _Pending_
- **Open finding summary:** _Pending_
- **Revisit date or trigger:** _Pending_

The review is complete when every domain was assessed and every finding has a disposition. Findings do not need to be remediated before this parent closes, and an amber or red review can still be complete.
`;
}

export function mergeParentDomainProgress(body, catalog, domainIssues) {
  if (typeof body !== "string") {
    throw new Error("Existing RHR parent body is unavailable.");
  }
  const start = body.indexOf(DOMAIN_PROGRESS_START);
  const end = body.indexOf(DOMAIN_PROGRESS_END);
  if (
    start < 0 ||
    end <= start ||
    body.indexOf(DOMAIN_PROGRESS_START, start + 1) >= 0 ||
    body.indexOf(DOMAIN_PROGRESS_END, end + 1) >= 0
  ) {
    throw new Error(
      "Existing RHR parent has missing or ambiguous domain-progress markers; refusing to overwrite it.",
    );
  }
  const contentStart = start + DOMAIN_PROGRESS_START.length;
  const previous = body.slice(contentStart, end).trim();
  const replacement = `\n${domainProgress(catalog, domainIssues, previous)}\n`;
  return `${body.slice(0, contentStart)}${replacement}${body.slice(end)}`;
}

export function renderDomainBody(run, catalog, domain, parentIssue) {
  const dependencies =
    domain.dependencies.length === 0
      ? "- None; this domain may begin immediately."
      : domain.dependencies.map((id) => `- \`${id}\``).join("\n");

  return `<!-- rhr:run=${run.runId};type=domain;domain=${domain.id} -->
Parent review: ${issueReference(parentIssue)}

## Execution identity

- **Run ID:** \`${run.runId}\`
- **Domain ID:** \`${domain.id}\`
- **Catalog version:** v${catalog.catalogVersion}
- **Owner:** ${domain.owner}
- **Reviewer:** ${run.reviewer}
- **Started:** _Pending_
- **Completed:** _Pending_
- **Baseline commit:** \`${run.baselineSha}\`
- **Final evidence commit:** _Pending_
- **Domain result:** _Pending — pass or findings filed_

## Objective

${domain.objective}

## Scope

${bulletList(domain.scope)}

## Procedure

${checklist(domain.procedure)}

## Required evidence

${checklist(domain.requiredEvidence)}

## Pass criteria

${checklist(domain.passCriteria)}

## Cadence and triggers

- **Normal cadence:** ${domain.cadence.normal}
- **Event-driven triggers:**
${nestedBulletList(domain.cadence.triggers)}

## Dependencies

${dependencies}

## Automation ownership

- **Status:** ${domain.automation.status}
- **Continuous evidence:**
${nestedBulletList(domain.automation.continuousEvidence)}
- **Manual evidence:**
${nestedBulletList(domain.automation.manualEvidence)}

## Control references

${links(domain.links)}

## Run evidence and exceptions

Record dated commands, GitHub runs/settings, artifacts, observations, and any scope exception here. A link without a result is not evidence that the check was rerun.

## Findings

- [ ] No findings were discovered, or every finding is linked below as a separate issue with severity, owner, disposition, verification, and expiring risk acceptance when applicable.

## Domain closure

- [ ] Every procedure step was performed or explicitly marked not applicable with rationale.
- [ ] Required evidence is recorded for this run rather than copied from an earlier run.
- [ ] Every finding is fixed immediately or filed separately.
- [ ] Result and completion date are recorded.

This domain may close once its assessment and finding filing are complete; remediation can continue in the linked finding issues.
`;
}

/** Parse the stable identity marker from an RHR issue body. */
export function parseIssueIdentity(body) {
  if (typeof body !== "string") return null;
  const match = body.match(RUN_MARKER);
  if (!match) return null;
  const [, runId, type, domainId] = match;
  if (!RUN_ID.test(runId)) return null;
  if (type === "parent" && domainId === undefined) {
    return { runId, type };
  }
  if (type === "domain" && CONTROL_ID.test(domainId ?? "")) {
    return { runId, type, domainId };
  }
  return null;
}

export function indexRunIssues(issues, runId) {
  let parent = null;
  const domains = new Map();
  for (const issue of issues) {
    if (issue.state === "closed" && issue.stateReason === "duplicate") {
      continue;
    }
    const identity = parseIssueIdentity(issue.body);
    if (!identity || identity.runId !== runId) continue;
    if (identity.type === "parent") {
      if (parent) {
        throw new Error(
          `${runId} already has multiple parent issues (#${parent.number} and #${issue.number}).`,
        );
      }
      parent = issue;
      continue;
    }
    const previous = domains.get(identity.domainId);
    if (previous) {
      throw new Error(
        `${runId}/${identity.domainId} already has multiple domain issues (#${previous.number} and #${issue.number}).`,
      );
    }
    domains.set(identity.domainId, issue);
  }
  return { parent, domains };
}

export function previewRhrRun(run, catalog) {
  const parent = {
    title: parentTitle(run),
    body: renderParentBody(run, catalog),
    labels: ["maintenance"],
  };
  return {
    mode: "dry-run",
    repository: run.repository,
    runId: run.runId,
    parent,
    domains: catalog.domains.map((domain) => ({
      id: domain.id,
      title: domainTitle(run, domain),
      body: renderDomainBody(run, catalog, domain, null),
      labels: ["maintenance"],
    })),
  };
}

function assertExistingIdentity(issue, run, catalog, domain = null) {
  const fields = [
    `**Run ID:** \`${run.runId}\``,
    domain
      ? `**Catalog version:** v${catalog.catalogVersion}`
      : `**Control catalog:** v${catalog.catalogVersion}`,
    `**Baseline commit:** \`${run.baselineSha}\``,
    `**Reviewer:** ${run.reviewer}`,
  ];
  for (const field of fields) {
    if (!issue.body?.includes(field)) {
      const record = domain ? `${run.runId}/${domain.id}` : run.runId;
      throw new Error(
        `Existing ${record} issue #${issue.number} conflicts with the requested immutable run metadata.`,
      );
    }
  }
}

/**
 * Create or safely resume one RHR run through a small issue gateway.
 *
 * @param {object} run Validated run.
 * @param {object} catalog Validated catalog.
 * @param {object} gateway Issue list/create/update adapter.
 * @param {{resume?: boolean}} [options] Explicit partial-run recovery mode.
 * @returns {Promise<object>} Creation summary.
 */
export async function createRhrRun(
  run,
  catalog,
  gateway,
  { resume = false } = {},
) {
  const existing = indexRunIssues(await gateway.listIssues(), run.runId);
  const created = [];
  const reused = [];
  let parent = existing.parent;

  if (!parent && existing.domains.size > 0) {
    throw new Error(
      `${run.runId} has domain issues but no parent; refusing to guess how to recover it.`,
    );
  }
  if (resume && !parent) {
    throw new Error(
      `${run.runId} has no parent issue; --resume is only for a confirmed interrupted run.`,
    );
  }
  if (parent) {
    assertExistingIdentity(parent, run, catalog);
    for (const domain of catalog.domains) {
      const issue = existing.domains.get(domain.id);
      if (issue) assertExistingIdentity(issue, run, catalog, domain);
    }
  }
  const missingDomains = catalog.domains.filter(
    (domain) => !existing.domains.has(domain.id),
  );
  if (parent && missingDomains.length > 0 && !resume) {
    throw new Error(
      `${run.runId} appears partial (${missingDomains.map((domain) => domain.id).join(", ")} missing). ` +
        "GitHub listings can be briefly stale after creation; inspect the parent, wait for consistency, then use --resume only for a confirmed interrupted run.",
    );
  }

  if (!parent) {
    parent = await gateway.createIssue({
      title: parentTitle(run),
      body: renderParentBody(run, catalog),
      labels: ["maintenance"],
    });
    created.push(parent);
  } else {
    reused.push(parent);
  }

  const domainIssues = new Map(existing.domains);
  for (const domain of catalog.domains) {
    let issue = domainIssues.get(domain.id);
    if (!issue) {
      issue = await gateway.createIssue({
        title: domainTitle(run, domain),
        body: renderDomainBody(run, catalog, domain, parent),
        labels: ["maintenance"],
      });
      domainIssues.set(domain.id, issue);
      created.push(issue);
    } else {
      reused.push(issue);
    }
  }

  const parentBody = mergeParentDomainProgress(
    parent.body,
    catalog,
    domainIssues,
  );
  if (parentBody !== parent.body) {
    await gateway.updateIssue(parent.number, { body: parentBody });
    parent = { ...parent, body: parentBody };
  }

  return { parent, domainIssues, created, reused };
}
