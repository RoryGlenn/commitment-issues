// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowDirectory = path.join(root, ".github", "workflows");
const expectedWorkflows = [
  "ci.yml",
  "codeql.yml",
  "publish.yml",
  "render-demo.yml",
  "repo-health.yml",
  "scorecard.yml",
];
const slsaGenerator =
  "slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function workflowFiles() {
  return fs
    .readdirSync(workflowDirectory)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
}

function workflowJobBlocks(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const jobsStart = lines.findIndex((line) => line === "jobs:");
  assert.notEqual(jobsStart, -1, "workflow should define jobs");

  const blocks = [];
  let current;
  for (const line of lines.slice(jobsStart + 1)) {
    const job = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/u);
    if (job) {
      current = { name: job[1], lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks.map(({ name, lines: jobLines }) => ({
    name,
    source: jobLines.join("\n"),
  }));
}

function permissionEntries(source, indentation) {
  const prefix = " ".repeat(indentation);
  const lines = source.split(/\r?\n/u);
  const declaration = new RegExp(`^${prefix}permissions:(.*)$`, "u");
  const start = lines.findIndex((line) => declaration.test(line));
  if (start === -1) return null;

  const suffix = lines[start].match(declaration)?.[1].trim();
  assert.ok(
    suffix === "" || suffix === "{}",
    "permissions must use an audited block or an explicit empty map",
  );
  if (suffix === "{}") return {};

  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (line.startsWith(`${prefix}  #`)) continue;
    if (!line.startsWith(`${prefix}  `)) break;
    const entry = line.match(
      new RegExp(
        `^${prefix}  ([a-z-]+): (read|write|none)(?:\\s+#.*)?\\s*$`,
        "u",
      ),
    );
    assert.ok(
      entry,
      "permissions entries must use audited read/write/none values",
    );
    entries.push([entry[1], entry[2]]);
  }
  return Object.fromEntries(entries);
}

test("the audited workflow inventory stays explicit", () => {
  assert.deepEqual(workflowFiles(), expectedWorkflows);
  assert.equal(
    workflowFiles().filter((file) =>
      read(`.github/workflows/${file}`).includes("tools/check-dco-range.mjs"),
    ).length,
    1,
    "DCO should have one required workflow owner rather than a duplicate report",
  );
});

test("workflows keep a least-privilege, pinned action baseline", () => {
  const expectedJobPermissions = {
    "ci.yml": {
      codeql: {
        actions: "read",
        contents: "read",
        "security-events": "write",
      },
    },
    "codeql.yml": {
      analyze: {
        actions: "read",
        contents: "read",
        "security-events": "write",
      },
    },
    "publish.yml": {
      candidate: { contents: "read" },
      provenance: {
        actions: "read",
        contents: "write",
        "id-token": "write",
      },
      publish: { contents: "read", "id-token": "write" },
      "publish-release": { contents: "write" },
      validate: { contents: "read" },
    },
    "scorecard.yml": {
      scorecard: {
        contents: "read",
        "id-token": "write",
        "security-events": "write",
      },
    },
  };

  for (const file of workflowFiles()) {
    const workflow = read(`.github/workflows/${file}`);
    assert.deepEqual(
      permissionEntries(workflow, 0),
      { contents: "read" },
      `${file} should default to read-only repository contents`,
    );
    assert.doesNotMatch(
      workflow,
      /^\s*pull_request_target:\s*$/mu,
      `${file} must not execute pull-request code with a base-repository token`,
    );

    for (const [, action] of workflow.matchAll(/^\s*uses:\s+([^\s#]+)/gmu)) {
      if (action === "./.github/workflows/codeql.yml") {
        assert.equal(file, "ci.yml");
        continue;
      }
      if (action === slsaGenerator) {
        assert.equal(file, "publish.yml");
        continue;
      }
      assert.match(
        action,
        /@[0-9a-f]{40}$/u,
        `${file} should pin ${action} to a full commit SHA`,
      );
    }

    const actualJobPermissions = Object.fromEntries(
      workflowJobBlocks(workflow)
        .map(({ name, source }) => [name, permissionEntries(source, 4)])
        .filter(([, permissions]) => permissions !== null),
    );
    assert.deepEqual(
      actualJobPermissions,
      expectedJobPermissions[file] ?? {},
      `${file} job-level permissions should match the audited allowlist`,
    );
  }
});

test("permission shorthand cannot bypass the audited job allowlist", () => {
  for (const declaration of [
    "permissions: write-all",
    "permissions: { contents: write }",
  ]) {
    assert.throws(
      () => permissionEntries(`    ${declaration}`, 4),
      /permissions must use an audited block or an explicit empty map/u,
    );
  }
});

test("every checkout drops persisted GitHub credentials", () => {
  for (const file of workflowFiles()) {
    const workflow = read(`.github/workflows/${file}`);
    const checkoutSteps = [
      ...workflow.matchAll(
        /^\s{6}- (?:name:[^\n]+\n\s{8})?uses: actions\/checkout@[^\n]+\n((?:\s{8,}[^\n]*\n?)*)/gmu,
      ),
    ];

    for (const [, configuration] of checkoutSteps) {
      assert.match(
        configuration,
        /^\s{10}persist-credentials: false\s*$/mu,
        `${file} checkout should not leave a token in Git configuration`,
      );
    }
  }
});

test("every runnable job has a timeout and every workflow controls overlap", () => {
  for (const file of workflowFiles()) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(
      workflow,
      /^concurrency:\s*$/mu,
      `${file} should define a concurrency policy`,
    );

    for (const job of workflowJobBlocks(workflow)) {
      if (!/^ {4}runs-on:/mu.test(job.source)) continue;
      assert.match(
        job.source,
        /^ {4}timeout-minutes: [1-9][0-9]*\s*$/mu,
        `${file} job ${job.name} should have a timeout`,
      );
    }
  }
});

test("static quality work is single-lane and gates CI Success", () => {
  const workflow = read(".github/workflows/ci.yml");
  const jobs = new Map(
    workflowJobBlocks(workflow).map(({ name, source }) => [name, source]),
  );
  const quality = jobs.get("quality") ?? "";
  const check = jobs.get("check") ?? "";
  const migration = jobs.get("migration-lifecycle") ?? "";
  const aggregate = jobs.get("ci-success") ?? "";

  assert.match(quality, /run: npm run lint/u);
  assert.match(quality, /run: npm run format:check/u);
  assert.match(quality, /run: npm audit --audit-level=high/u);
  assert.match(quality, /ACTIONLINT_VERSION: 1\.7\.12/u);
  assert.match(
    quality,
    /ACTIONLINT_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8/u,
  );
  assert.match(
    quality,
    /run: actionlint -ignore 'unexpected key "queue" for "concurrency" section'/u,
  );
  assert.doesNotMatch(check, /npm run (?:lint|format:check)/u);
  assert.match(
    aggregate,
    /needs: \[dco, quality, check, pm-lifecycle, migration-lifecycle, codeql\]/u,
  );
  assert.match(migration, /runs-on: ubuntu-latest/u);
  assert.match(migration, /node-version: "24"/u);
  assert.match(
    migration,
    /run: node tools\/run-migration-lifecycle-test\.mjs npm/u,
  );
  assert.doesNotMatch(migration, /strategy:\s+fail-fast:/u);
  assert.match(aggregate, /needs\.quality\.result != 'success'/u);
  assert.match(
    aggregate,
    /needs\['migration-lifecycle'\]\.result != 'success'/u,
  );
  assert.match(aggregate, /needs\.codeql\.result != 'success'/u);
});

test("CodeQL is reusable and included in the required aggregate", () => {
  const ci = read(".github/workflows/ci.yml");
  const codeql = read(".github/workflows/codeql.yml");
  const codeqlJob =
    workflowJobBlocks(ci).find(({ name }) => name === "codeql")?.source ?? "";

  assert.match(codeql, /^\s+workflow_call:\s*$/mu);
  assert.doesNotMatch(codeql, /^\s+pull_request:\s*$/mu);
  assert.doesNotMatch(codeql, /^\s+push:\s*$/mu);
  assert.match(codeqlJob, /uses: \.\/\.github\/workflows\/codeql\.yml/u);
});

test("the required DCO job pins its Node runtime", () => {
  const workflow = read(".github/workflows/ci.yml");
  const dco =
    workflowJobBlocks(workflow).find(({ name }) => name === "dco")?.source ??
    "";

  assert.match(
    dco,
    /uses: actions\/setup-node@[0-9a-f]{40}[^\n]*\n\s+with:\s+node-version: "24"/su,
  );
});

test("package-manager matrix values never expand directly into shell code", () => {
  const workflow = read(".github/workflows/ci.yml");
  const lifecycle =
    workflowJobBlocks(workflow).find(({ name }) => name === "pm-lifecycle")
      ?.source ?? "";

  for (const manager of ["pnpm", "yarn", "bun"]) {
    assert.match(
      lifecycle,
      new RegExp(
        `if: matrix\\.pm == '${manager}'\\s+run: npm run test:lifecycle:${manager}`,
        "u",
      ),
    );
  }
  assert.doesNotMatch(lifecycle, /run:[^\n]*\$\{\{/u);

  const health = read(".github/workflows/repo-health.yml");
  const migration =
    workflowJobBlocks(health).find(({ name }) => name === "migration-lifecycle")
      ?.source ?? "";
  for (const manager of ["pnpm", "yarn", "bun"]) {
    const command =
      manager === "yarn"
        ? "npm run test:migration:yarn"
        : `node tools/run-migration-lifecycle-test.mjs ${manager}`;
    assert.match(
      migration,
      new RegExp(
        `if: matrix\\.pm == '${manager}'\\s+run: ${escapeRegExp(command)}`,
        "u",
      ),
    );
  }
  assert.doesNotMatch(migration, /run:[^\n]*\$\{\{/u);
});

test("weekly high-severity dependency findings fail visibly", () => {
  const workflow = read(".github/workflows/repo-health.yml");
  const auditStep = workflow.split("- name: Security advisory gate")[1] ?? "";

  assert.match(auditStep, /run: npm audit --audit-level=high/u);
  assert.doesNotMatch(auditStep, /continue-on-error:\s*true/u);
  assert.match(workflow, /run: npm test/u);
  assert.match(workflow, /run: npm run test:lifecycle:npm/u);
  assert.match(workflow, /pm: \[pnpm, yarn, bun\][\s\S]*?node-version: "24"/u);
  assert.match(workflow, /version: 10/u);
  assert.match(workflow, /bun-version: "1\.3\.14"/u);
  assert.doesNotMatch(workflow, /npm install --global yarn/u);
  assert.match(
    workflow,
    /if: matrix\.pm == 'yarn'\s+run: npm run test:migration:yarn/u,
  );
  assert.doesNotMatch(workflow, /run: npm run (?:lint|format:check)/u);
  assert.doesNotMatch(workflow, /run: npm pack --dry-run/u);
});

test("package publications use GitHub's maximum non-cancelling queue", () => {
  const workflow = read(".github/workflows/publish.yml");

  assert.match(
    workflow,
    /^\s+group: publish-\$\{\{ github\.event_name == 'push' && 'package' \|\| github\.ref \}\}\s*$/mu,
  );
  assert.match(workflow, /^\s+cancel-in-progress: false\s*$/mu);
  assert.match(workflow, /^\s+queue: max\s*$/mu);
  assert.doesNotMatch(workflow, /group: publish-\$\{\{ github\.ref \}\}/u);
});

test("publish shell scripts receive generated names through the environment", () => {
  const workflow = read(".github/workflows/publish.yml");

  assert.match(
    workflow,
    /name: Verify exact npm package lifecycle[\s\S]*?env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: npm run test:lifecycle:npm -- --tarball "\$TARBALL"/u,
  );
  assert.match(
    workflow,
    /name: Verify exact npm upgrade migration\s+env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: node tools\/run-migration-lifecycle-test\.mjs npm --tarball "\$TARBALL"/u,
  );
  assert.match(
    workflow,
    /name: Generate provenance subject\s+id: hash\s+env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: \|\s+hashes="\$\(sha256sum "\$TARBALL" \| base64 -w0\)"/su,
  );
  assert.match(
    workflow,
    /name: Classify release recovery state\s+id: recovery\s+env:[\s\S]*?TARBALL: \$\{\{ needs\.candidate\.outputs\.tarball \}\}\s+run: node tools\/release-recovery\.mjs --tarball "\$TARBALL"/su,
  );
  assert.match(
    workflow,
    /name: Publish to npm\s+if: steps\.recovery\.outputs\.publish_npm == 'true'\s+env:\s+TARBALL: \$\{\{ needs\.candidate\.outputs\.tarball \}\}\s+run: npm publish "\.\/\$TARBALL" --access public/su,
  );
  assert.doesNotMatch(
    workflow,
    /(?:--tarball|sha256sum|npm publish)[^\n]*\$\{\{ steps\.pack\.outputs\.tarball \}\}/u,
  );
});

test("Dependabot covers npm and workflow dependencies on a bounded cadence", () => {
  const dependabot = read(".github/dependabot.yml");
  assert.equal(
    [...dependabot.matchAll(/^\s*- package-ecosystem:\s*(\S+)/gmu)].length,
    2,
  );
  assert.match(dependabot, /- package-ecosystem: npm/u);
  assert.match(dependabot, /- package-ecosystem: github-actions/u);
  assert.equal(
    [...dependabot.matchAll(/^\s+interval: weekly\s*$/gmu)].length,
    2,
  );
  assert.equal(
    [...dependabot.matchAll(/^\s+default-days: 7\s*$/gmu)].length,
    2,
    "routine version updates should age for seven days; security updates bypass cooldown",
  );
  assert.match(dependabot, /open-pull-requests-limit: 5/u);
  assert.match(dependabot, /github-actions:\s+patterns:\s+- "\*"/su);
});

test("the public GitHub Actions recipe models the repository safety baseline", () => {
  const recipe = read("docs/ci-recipes.md");

  assert.match(recipe, /permissions:\s+contents: read/su);
  assert.match(recipe, /uses: actions\/checkout@[0-9a-f]{40} # v7/u);
  assert.match(recipe, /persist-credentials: false/u);
  assert.match(recipe, /uses: actions\/setup-node@[0-9a-f]{40} # v6/u);
  assert.doesNotMatch(recipe, /uses: actions\/(?:checkout|setup-node)@v\d/u);
});
