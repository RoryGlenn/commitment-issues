// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  createRhrRun,
  indexRunIssues,
  mergeParentDomainProgress,
  parseIssueIdentity,
  previewRhrRun,
  renderDomainBody,
  renderParentBody,
  validateCatalog,
  validateRun,
} from "../tools/lib/rhr.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "docs", "rhr-control-catalog-v1.json");
const cli = path.join(root, "tools", "rhr.mjs");
const fullSha = "0123456789abcdef0123456789abcdef01234567";

function rawCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

function catalog() {
  return validateCatalog(rawCatalog());
}

function run(overrides = {}) {
  const validatedCatalog = catalog();
  return validateRun(
    {
      runId: "RHR-2026-Q3",
      reviewer: "@RoryGlenn",
      startDate: "2026-07-21",
      baselineSha: fullSha,
      trigger: "Quarterly review",
      scope: "Full catalog",
      toolVersions: ["npm=11.17.0"],
      ...overrides,
    },
    validatedCatalog,
  );
}

test("catalog v1 preserves the nine production-readiness domains", () => {
  const validated = catalog();

  assert.equal(validated.catalogVersion, "1.0.0");
  assert.equal(validated.repository, "RoryGlenn/commitment-issues");
  assert.deepEqual(
    validated.domains.map((domain) => domain.id),
    Array.from(
      { length: 9 },
      (_, index) => `RHR-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  assert.deepEqual(
    validated.sourceIssues.map((url) => Number(url.split("/").at(-1))),
    [101, 130, 131, 132, 133, 134, 135, 136, 137, 138],
  );
  for (const domain of validated.domains) {
    assert.ok(domain.objective.length > 20, domain.id);
    assert.ok(domain.scope.length > 0, domain.id);
    assert.ok(domain.procedure.length > 0, domain.id);
    assert.ok(domain.requiredEvidence.length > 0, domain.id);
    assert.ok(domain.passCriteria.length > 0, domain.id);
    assert.ok(domain.owner, domain.id);
    assert.ok(domain.cadence.normal, domain.id);
    assert.ok(domain.cadence.triggers.length > 0, domain.id);
    assert.ok(domain.automation.continuousEvidence.length > 0, domain.id);
    assert.ok(domain.automation.manualEvidence.length > 0, domain.id);
    assert.ok(domain.links.length > 0, domain.id);
  }
  assert.deepEqual(validated.domains[2].dependencies, ["RHR-01", "RHR-02"]);
  assert.deepEqual(
    validated.domains[8].dependencies,
    validated.domains.slice(0, 8).map((domain) => domain.id),
  );
});

test("catalog validation rejects drift, unknown dependencies, and cycles", () => {
  const duplicate = rawCatalog();
  duplicate.domains[1].id = duplicate.domains[0].id;
  assert.throws(() => validateCatalog(duplicate), /duplicate domain RHR-01/u);

  const missingEvidence = rawCatalog();
  missingEvidence.domains[0].requiredEvidence = [];
  assert.throws(
    () => validateCatalog(missingEvidence),
    /requiredEvidence must be a non-empty array/u,
  );

  const unknown = rawCatalog();
  unknown.domains[0].dependencies = ["RHR-99"];
  assert.throws(() => validateCatalog(unknown), /unknown dependency RHR-99/u);

  const cycle = rawCatalog();
  cycle.domains[0].dependencies = ["RHR-03"];
  assert.throws(() => validateCatalog(cycle), /dependency cycle/u);
});

test("run validation requires immutable, unambiguous identity fields", () => {
  const validated = run();
  assert.equal(validated.runId, "RHR-2026-Q3");
  assert.equal(validated.repository, "RoryGlenn/commitment-issues");
  assert.deepEqual(validated.toolVersions.slice(1), [
    "RHR catalog 1.0.0",
    "npm=11.17.0",
  ]);

  assert.throws(() => run({ runId: "2026-Q3" }), /runId must match/u);
  assert.throws(() => run({ baselineSha: "abc123" }), /40-character/u);
  assert.throws(() => run({ startDate: "2026-02-30" }), /real date/u);
  assert.throws(
    () => run({ trigger: "quarterly\n<!-- forged -->" }),
    /one line/u,
  );
  assert.throws(() => run({ repository: "not-a-repository" }), /owner\/name/u);
});

test("rendered issues separate stable controls, run evidence, and health", () => {
  const validatedCatalog = catalog();
  const validatedRun = run();
  const parent = renderParentBody(validatedRun, validatedCatalog);
  const domain = renderDomainBody(
    validatedRun,
    validatedCatalog,
    validatedCatalog.domains[0],
    { number: 500, url: "https://github.com/example/repo/issues/500" },
  );

  assert.deepEqual(parseIssueIdentity(parent), {
    runId: "RHR-2026-Q3",
    type: "parent",
  });
  assert.deepEqual(parseIssueIdentity(domain), {
    runId: "RHR-2026-Q3",
    type: "domain",
    domainId: "RHR-01",
  });
  assert.match(parent, /green, amber, or red/u);
  assert.match(parent, /amber or red review can still be complete/u);
  assert.match(parent, /Every open finding has an owner and one disposition/u);
  assert.match(domain, /Required evidence is recorded for this run/u);
  assert.match(domain, /filed separately/u);
  assert.match(domain, /#500/u);
  assert.match(domain, /- \*\*Continuous evidence:\*\*\n {2}- npm test/u);

  const checkedParent = parent.replace(
    "- [ ] _planned_ `RHR-01`",
    "- [x] [#501](https://github.com/example/repo/issues/501) `RHR-01`",
  );
  const merged = mergeParentDomainProgress(
    checkedParent.replace(
      "**Health rationale:** _Pending_",
      "**Health rationale:** Reviewed",
    ),
    validatedCatalog,
    new Map([
      [
        "RHR-01",
        { number: 501, url: "https://github.com/example/repo/issues/501" },
      ],
    ]),
  );
  assert.match(merged, /- \[x\] \[#501\]/u);
  assert.match(merged, /\*\*Health rationale:\*\* Reviewed/u);
  assert.throws(
    () =>
      mergeParentDomainProgress("manual parent", validatedCatalog, new Map()),
    /refusing to overwrite/u,
  );

  const preview = previewRhrRun(validatedRun, validatedCatalog);
  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.domains.length, 9);
  assert.ok(
    preview.domains.every((item) => item.labels.includes("maintenance")),
  );
});

test("issue identities reject malformed markers and duplicate records", () => {
  assert.equal(parseIssueIdentity(null), null);
  assert.equal(
    parseIssueIdentity("<!-- rhr:run=invalid;type=parent -->"),
    null,
  );
  assert.equal(
    parseIssueIdentity(
      "<!-- rhr:run=RHR-2026-Q3;type=domain;domain=invalid -->",
    ),
    null,
  );

  const body = "<!-- rhr:run=RHR-2026-Q3;type=parent -->";
  assert.throws(
    () =>
      indexRunIssues(
        [
          { number: 1, body },
          { number: 2, body },
        ],
        "RHR-2026-Q3",
      ),
    /multiple parent issues/u,
  );

  const domainBody = "<!-- rhr:run=RHR-2026-Q3;type=domain;domain=RHR-01 -->";
  assert.throws(
    () =>
      indexRunIssues(
        [
          { number: 3, body: domainBody },
          { number: 4, body: domainBody },
        ],
        "RHR-2026-Q3",
      ),
    /multiple domain issues/u,
  );

  assert.deepEqual(
    indexRunIssues(
      [
        { number: 3, body: domainBody, state: "open" },
        {
          number: 4,
          body: domainBody,
          state: "closed",
          stateReason: "duplicate",
        },
      ],
      "RHR-2026-Q3",
    ).domains.get("RHR-01").number,
    3,
  );
});

test("creation resumes partial runs and complete reruns without duplicates", async () => {
  const validatedCatalog = catalog();
  const validatedRun = run();
  const issues = [];
  const createdPayloads = [];
  const updates = [];
  const gateway = {
    async listIssues() {
      return structuredClone(issues);
    },
    async createIssue(payload) {
      createdPayloads.push(payload);
      const number = 500 + issues.length;
      const issue = {
        number,
        title: payload.title,
        body: payload.body,
        url: `https://github.com/example/repo/issues/${number}`,
        state: "open",
      };
      issues.push(issue);
      return structuredClone(issue);
    },
    async updateIssue(number, payload) {
      updates.push({ number, payload });
      const issue = issues.find((item) => item.number === number);
      issue.body = payload.body;
      return structuredClone(issue);
    },
  };

  const first = await createRhrRun(validatedRun, validatedCatalog, gateway);
  assert.equal(first.created.length, 10);
  assert.equal(first.reused.length, 0);
  assert.equal(issues.length, 10);
  assert.match(issues[0].body, /#501/u);
  assert.match(issues[0].body, /#509/u);

  const second = await createRhrRun(validatedRun, validatedCatalog, gateway);
  assert.equal(second.created.length, 0);
  assert.equal(second.reused.length, 10);
  assert.equal(issues.length, 10);
  assert.equal(createdPayloads.length, 10);
  assert.equal(updates.length, 1);

  const interruptedIssues = issues.slice(0, 2);
  let additionalCreates = 0;
  const resumeGateway = {
    async listIssues() {
      return structuredClone(interruptedIssues);
    },
    async createIssue(payload) {
      additionalCreates += 1;
      const number = 700 + additionalCreates;
      const issue = {
        number,
        title: payload.title,
        body: payload.body,
        url: `https://github.com/example/repo/issues/${number}`,
      };
      interruptedIssues.push(issue);
      return structuredClone(issue);
    },
    async updateIssue(number, payload) {
      const issue = interruptedIssues.find((item) => item.number === number);
      issue.body = payload.body;
    },
  };
  await assert.rejects(
    createRhrRun(validatedRun, validatedCatalog, resumeGateway),
    /appears partial.*--resume/u,
  );
  assert.equal(additionalCreates, 0);

  const resumed = await createRhrRun(
    validatedRun,
    validatedCatalog,
    resumeGateway,
    { resume: true },
  );
  assert.equal(resumed.created.length, 8);
  assert.equal(resumed.reused.length, 2);
  assert.equal(additionalCreates, 8);
});

test("creation refuses a reused run ID with conflicting immutable metadata", async () => {
  const validatedCatalog = catalog();
  const originalRun = run();
  const parent = {
    number: 800,
    title: "existing",
    body: renderParentBody(originalRun, validatedCatalog),
    url: "https://github.com/example/repo/issues/800",
  };
  const gateway = {
    async listIssues() {
      return [parent];
    },
    async createIssue() {
      assert.fail("a conflicting run must not create issues");
    },
    async updateIssue() {
      assert.fail("a conflicting run must not update issues");
    },
  };

  await assert.rejects(
    createRhrRun(
      run({ baselineSha: "fedcba9876543210fedcba9876543210fedcba98" }),
      validatedCatalog,
      gateway,
    ),
    /conflicts with the requested immutable run metadata/u,
  );
});

test("resume mode requires an existing parent", async () => {
  const gateway = {
    async listIssues() {
      return [];
    },
    async createIssue() {
      assert.fail("resume without a parent must not create issues");
    },
  };
  await assert.rejects(
    createRhrRun(run(), catalog(), gateway, { resume: true }),
    /no parent issue/u,
  );
});

test("the CLI defaults to an offline dry-run and rejects unsafe arguments", () => {
  const args = [
    cli,
    "--run-id",
    "RHR-2026-Q3",
    "--reviewer",
    "@RoryGlenn",
    "--start-date",
    "2026-07-21",
    "--baseline-sha",
    fullSha,
    "--trigger",
    "Quarterly review",
    "--scope",
    "Full catalog",
  ];
  const preview = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });
  assert.equal(preview.status, 0, preview.stderr);
  const payload = JSON.parse(preview.stdout);
  assert.equal(payload.mode, "dry-run");
  assert.equal(payload.domains.length, 9);

  const conflicting = spawnSync(
    process.execPath,
    [...args, "--dry-run", "--create"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(conflicting.status, 1);
  assert.match(conflicting.stderr, /mutually exclusive/u);

  const unknown = spawnSync(process.execPath, [...args, "--write"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown option: --write/u);
});

test("GitHub forms preserve parent, domain, and finding record fields", () => {
  const forms = new Map(
    ["rhr_parent.yml", "rhr_domain.yml", "rhr_finding.yml"].map((file) => [
      file,
      yaml.load(
        fs.readFileSync(
          path.join(root, ".github", "ISSUE_TEMPLATE", file),
          "utf8",
        ),
      ),
    ]),
  );

  for (const [file, form] of forms) {
    assert.deepEqual(form.labels, ["maintenance"], file);
    assert.ok(Array.isArray(form.body), file);
    assert.ok(form.body.length > 5, file);
  }
  const ids = (form) => form.body.map((item) => item.id).filter(Boolean);
  assert.deepEqual(ids(forms.get("rhr_parent.yml")), [
    "run-id",
    "catalog-version",
    "start-date",
    "completion-date",
    "baseline",
    "final-commit",
    "reviewer",
    "trigger-scope",
    "versions",
    "domains",
    "health",
    "closure",
  ]);
  assert.ok(ids(forms.get("rhr_domain.yml")).includes("evidence"));
  assert.ok(ids(forms.get("rhr_domain.yml")).includes("findings"));
  assert.ok(ids(forms.get("rhr_finding.yml")).includes("severity"));
  assert.ok(ids(forms.get("rhr_finding.yml")).includes("disposition"));
  assert.ok(ids(forms.get("rhr_finding.yml")).includes("acceptance"));
  assert.ok(ids(forms.get("rhr_finding.yml")).includes("remediation"));
});
