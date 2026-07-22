// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEMANTIC_GRAPH_CERTAINTIES,
  SEMANTIC_GRAPH_EDGE_TYPES,
  SEMANTIC_GRAPH_NODE_KINDS,
  SEMANTIC_GRAPH_PROVENANCES,
  SEMANTIC_GRAPH_SCHEMA_VERSION,
  buildSemanticGraph,
  formatSemanticQuery,
  querySemanticGraph,
  readRepositorySourceState,
  readSemanticGraphCache,
  resolveSemanticNode,
  semanticGraphCacheStatus,
  semanticGraphMetrics,
  validateSemanticGraph,
  writeSemanticGraphCache,
} from "../tools/lib/semantic-graph.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "tools", "semantic-graph.mjs");

function write(rootDir, relativePath, contents) {
  const target = path.join(rootDir, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

function filesBelow(rootDir, current = rootDir) {
  return fs
    .readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === ".git") return [];
      const absolutePath = path.join(current, entry.name);
      return entry.isDirectory()
        ? filesBelow(rootDir, absolutePath)
        : [path.relative(rootDir, absolutePath).split(path.sep).join("/")];
    })
    .sort((left, right) => left.localeCompare(right));
}

function fixtureSourceState(rootDir) {
  const trackedFiles = filesBelow(rootDir);
  const hash = crypto.createHash("sha256");
  let totalTrackedBytes = 0;
  for (const relativePath of trackedFiles) {
    const contents = fs.readFileSync(
      path.join(rootDir, ...relativePath.split("/")),
    );
    hash.update(relativePath);
    hash.update("\0");
    hash.update(contents);
    totalTrackedBytes += contents.length;
  }
  return {
    head: "1".repeat(40),
    fingerprint: hash.digest("hex"),
    dirty: false,
    trackedFiles,
    totalTrackedBytes,
    totalIndexableBytes: totalTrackedBytes,
  };
}

function createSemanticFixture() {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-semantic-"),
  );
  write(
    fixture,
    "package.json",
    `${JSON.stringify(
      {
        name: "semantic-fixture",
        version: "1.0.0",
        files: [
          "scripts/cli.mjs",
          "scripts/prepush.mjs",
          "scripts/lib/config.mjs",
          "scripts/lib/helper.mjs",
          "scripts/lib/hooks.mjs",
          "docs/configuration.md",
          "README.md",
          "LICENSE",
        ],
      },
      null,
      2,
    )}\n`,
  );
  write(
    fixture,
    "scripts/cli.mjs",
    `const COMMANDS = {
  prepush: {
    file: "prepush.mjs",
    visibility: "primary",
    summary: "Inspect a push",
  },
  hook: { file: null, visibility: "hidden" },
};
export { COMMANDS };
`,
  );
  write(
    fixture,
    "scripts/prepush.mjs",
    `import { helper } from "./lib/helper.mjs";
export function prepush() { return helper(); }
`,
  );
  write(
    fixture,
    "scripts/lib/helper.mjs",
    `import { cycle } from "./space 猫.mjs";
export function helper() { return cycle; }
export async function load(name) { return import(name); }
`,
  );
  write(
    fixture,
    "scripts/lib/space 猫.mjs",
    `import { helper } from "./helper.mjs";
export const cycle = typeof helper;
`,
  );
  write(
    fixture,
    "scripts/lib/hooks.mjs",
    `export const HOOK_SUBCOMMANDS = { "pre-push": "prepush" };
`,
  );
  write(
    fixture,
    "scripts/lib/config.mjs",
    `export const KNOWN_PRECOMMIT_CONFIG_KEYS = ["requireTests"];
export const KNOWN_COMMIT_MESSAGE_CONFIG_KEYS = ["enabled"];
`,
  );
  write(
    fixture,
    "test/prepush.test.mjs",
    `import { prepush } from "../scripts/prepush.mjs";
const requireTests = true;
const enabled = true;
export { enabled, prepush, requireTests };
`,
  );
  write(
    fixture,
    "docs/configuration.md",
    `# Configuration

Run \`commitment-issues prepush\`. The \`requireTests\` key controls test
discovery and \`enabled\` configures commit messages.

[Pre-push implementation](../scripts/prepush.mjs)
`,
  );
  write(
    fixture,
    "README.md",
    "# Fixture\n\nSee [configuration](docs/configuration.md).\n",
  );
  write(fixture, "LICENSE", "fixture\n");
  write(
    fixture,
    "tools/semantic-capabilities.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        capabilities: [
          {
            id: "push-inspection",
            label: "Push inspection",
            description: "Inspect the pushed range.",
            members: ["command:prepush", "hook:pre-push"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return fixture;
}

function initGitRepository(fixture) {
  const run = (args) =>
    execFileSync("git", args, {
      cwd: fixture,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  run(["init", "--initial-branch=main"]);
  run(["config", "user.name", "Semantic Graph Test"]);
  run(["config", "user.email", "semantic@example.com"]);
  run(["add", "--all"]);
  run(["commit", "-m", "fixture"]);
}

function buildFixtureGraph(fixture) {
  return buildSemanticGraph(fixture, {
    sourceState: fixtureSourceState(fixture),
  });
}

test("semantic graph compiles proven, inferred, and declared relationships", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const graph = buildFixtureGraph(fixture);
  const errors = validateSemanticGraph(graph).filter(
    (entry) => entry.severity === "error",
  );
  assert.deepEqual(errors, []);
  assert.equal(graph.schemaVersion, SEMANTIC_GRAPH_SCHEMA_VERSION);
  assert.deepEqual(
    graph.nodes.find((node) => node.id === "command:prepush"),
    {
      id: "command:prepush",
      kind: "command",
      label: "prepush",
      visibility: "primary",
      path: "scripts/prepush.mjs",
    },
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "command:prepush" &&
        edge.type === "implements" &&
        edge.to === "capability:push-inspection" &&
        edge.certainty === "declared",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "module:scripts/prepush.mjs" &&
        edge.type === "imports" &&
        edge.to === "module:scripts/lib/helper.mjs" &&
        edge.certainty === "proven" &&
        edge.provenance === "javascript-parser",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "module:scripts/prepush.mjs" &&
        edge.type === "tested-by" &&
        edge.to === "test:test/prepush.test.mjs",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "package:semantic-fixture" &&
        edge.type === "ships-in-package" &&
        edge.to === "module:scripts/prepush.mjs",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "config:commitMessage.enabled" &&
        edge.type === "documented-by" &&
        edge.to === "document:docs/configuration.md" &&
        edge.certainty === "inferred",
    ),
  );
  assert.ok(
    graph.diagnostics.some(
      (entry) => entry.code === "source.dynamic-import-unknown",
    ),
  );
  assert.deepEqual(semanticGraphMetrics(graph), {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    diagnostics: graph.diagnostics.length,
    bytes: Buffer.byteLength(`${JSON.stringify(graph, null, 2)}\n`),
  });
});

test("semantic graph reports unsupported and malformed source without guessing", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  write(fixture, "scripts/bad.mjs", "export {\n");
  write(fixture, "scripts/missing-target.mjs", 'import "./not-tracked.mjs";\n');
  write(fixture, "scripts/types.ts", "export const value: string = 'x';\n");

  const graph = buildFixtureGraph(fixture);
  assert.ok(
    graph.diagnostics.some(
      (entry) =>
        entry.code === "source.parse-failed" &&
        entry.path === "scripts/bad.mjs",
    ),
  );
  assert.ok(
    graph.diagnostics.some(
      (entry) =>
        entry.code === "source.relative-import-missing" &&
        entry.path === "scripts/missing-target.mjs",
    ),
  );
  assert.ok(
    graph.diagnostics.some(
      (entry) =>
        entry.code === "source.parser-unsupported" &&
        entry.path === "scripts/types.ts",
    ),
  );
  assert.equal(
    graph.edges.some((edge) => edge.from === "module:scripts/bad.mjs"),
    false,
  );
});

test("semantic graph keeps same-named workspace modules and tests distinct", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  write(
    fixture,
    "packages/a/src/index.mjs",
    "export const packageName = 'a';\n",
  );
  write(
    fixture,
    "packages/a/test/index.test.mjs",
    'import { packageName } from "../src/index.mjs";\nexport { packageName };\n',
  );
  write(
    fixture,
    "packages/b/src/index.mjs",
    "export const packageName = 'b';\n",
  );
  write(
    fixture,
    "packages/b/test/index.test.mjs",
    'import { packageName } from "../src/index.mjs";\nexport { packageName };\n',
  );
  write(fixture, "scripts/a.mjs", "export const duplicate = 'a';\n");
  write(fixture, "scripts/b.mjs", "export const duplicate = 'b';\n");

  const graph = buildFixtureGraph(fixture);
  for (const packageName of ["a", "b"]) {
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.from === `module:packages/${packageName}/src/index.mjs` &&
          edge.type === "tested-by" &&
          edge.to === `test:packages/${packageName}/test/index.test.mjs` &&
          edge.certainty === "proven",
      ),
    );
  }
  assert.throws(
    () => resolveSemanticNode(graph, "duplicate"),
    /query 'duplicate' is ambiguous/u,
  );
});

test("semantic graph validation rejects stale declarations and dangling edges", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const manifestPath = path.join(
    fixture,
    "tools",
    "semantic-capabilities.json",
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.capabilities[0].members.push("command:deleted");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const graph = buildFixtureGraph(fixture);
  graph.edges.push({
    from: "command:prepush",
    type: "imports",
    to: "module:missing.mjs",
    certainty: "certain",
    evidence: {},
  });
  const codes = validateSemanticGraph(graph).map((entry) => entry.code);
  assert.ok(codes.includes("manifest.member-missing"));
  assert.ok(codes.includes("graph.dangling-edge"));
  assert.ok(codes.includes("graph.invalid-certainty"));
  assert.ok(codes.includes("graph.invalid-provenance"));
  assert.ok(codes.includes("graph.missing-evidence"));

  graph.schemaVersion = 999;
  graph.source.fingerprint = "invalid";
  const identityCodes = validateSemanticGraph(graph).map((entry) => entry.code);
  assert.ok(identityCodes.includes("graph.unsupported-schema"));
  assert.ok(identityCodes.includes("graph.invalid-source-identity"));

  graph.nodes[0].kind = "mystery";
  graph.edges[0].type = "unknown";
  graph.source.totalIndexableBytes = -1;
  const shapeCodes = validateSemanticGraph(graph).map((entry) => entry.code);
  assert.ok(shapeCodes.includes("graph.invalid-node"));
  assert.ok(shapeCodes.includes("graph.invalid-edge"));
  assert.ok(shapeCodes.includes("graph.invalid-source"));
  assert.equal(validateSemanticGraph(null)[0].code, "graph.invalid-root");
  assert.ok(
    validateSemanticGraph({
      schemaVersion: SEMANTIC_GRAPH_SCHEMA_VERSION,
      source: {
        head: null,
        fingerprint: "1".repeat(64),
        dirty: false,
        trackedFileCount: 0,
        totalTrackedBytes: 0,
        totalIndexableBytes: 0,
      },
      diagnostics: [],
    }).some((entry) => entry.code === "graph.invalid-nodes"),
  );
});

test("focused semantic queries stay deterministic and report retrieval size", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const graph = buildFixtureGraph(fixture);

  assert.equal(resolveSemanticNode(graph, "prepush").id, "command:prepush");
  assert.equal(
    resolveSemanticNode(graph, "scripts/lib/helper.mjs").id,
    "module:scripts/lib/helper.mjs",
  );
  assert.throws(
    () => resolveSemanticNode(graph, "missing"),
    /No semantic graph node matches/u,
  );
  const result = querySemanticGraph(graph, "scripts/lib/helper.mjs", {
    depth: 2,
  });
  assert.equal(result.query.target, "module:scripts/lib/helper.mjs");
  assert.ok(result.retrieval.selectedFiles > 0);
  assert.ok(
    result.retrieval.selectedBytes < result.retrieval.totalIndexableBytes,
  );
  const human = formatSemanticQuery(result, "impact");
  assert.match(human, /^Semantic impact: scripts\/lib\/helper\.mjs/mu);
  assert.match(human, /imports \(incoming\):/u);
  assert.match(human, /Retrieval: \d+ files/u);
  const tree = formatSemanticQuery(
    querySemanticGraph(graph, "push-inspection", { depth: 2 }),
    "tree",
  );
  assert.match(tree, /^Semantic tree: Push inspection/mu);
  assert.match(tree, /- implements \(incoming\): prepush/u);
  assert.match(tree, / {2}- dispatches-to: scripts\/prepush\.mjs/u);
  assert.match(tree, /project-registry @ scripts\/cli\.mjs/u);
  assert.deepEqual(
    querySemanticGraph(graph, "scripts/lib/helper.mjs", { depth: 2 }),
    result,
  );
});

test("source fingerprints cover repeated tracked, staged, and worktree edits", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const helper = path.join(fixture, "scripts", "lib", "helper.mjs");

  const clean = readRepositorySourceState(fixture);
  fs.appendFileSync(helper, "// worktree one\n");
  const worktreeOne = readRepositorySourceState(fixture);
  fs.appendFileSync(helper, "// worktree two\n");
  const worktreeTwo = readRepositorySourceState(fixture);
  execFileSync("git", ["add", "scripts/lib/helper.mjs"], { cwd: fixture });
  const staged = readRepositorySourceState(fixture);

  assert.equal(clean.dirty, false);
  assert.equal(worktreeOne.dirty, true);
  assert.notEqual(clean.fingerprint, worktreeOne.fingerprint);
  assert.notEqual(worktreeOne.fingerprint, worktreeTwo.fingerprint);
  assert.notEqual(worktreeTwo.fingerprint, staged.fingerprint);
});

test("source fingerprints cover staged renames and deletions", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const clean = readRepositorySourceState(fixture);

  execFileSync(
    "git",
    ["mv", "scripts/lib/helper.mjs", "scripts/lib/renamed-helper.mjs"],
    { cwd: fixture },
  );
  const renamed = readRepositorySourceState(fixture);
  assert.notEqual(renamed.fingerprint, clean.fingerprint);
  assert.ok(renamed.trackedFiles.includes("scripts/lib/renamed-helper.mjs"));
  assert.equal(renamed.trackedFiles.includes("scripts/lib/helper.mjs"), false);

  execFileSync("git", ["commit", "-m", "rename helper"], { cwd: fixture });
  const renamedHead = readRepositorySourceState(fixture);
  execFileSync("git", ["rm", "scripts/lib/renamed-helper.mjs"], {
    cwd: fixture,
  });
  const deleted = readRepositorySourceState(fixture);
  assert.notEqual(deleted.fingerprint, renamedHead.fingerprint);
  assert.equal(
    deleted.trackedFiles.includes("scripts/lib/renamed-helper.mjs"),
    false,
  );
});

test("semantic cache is current only for its exact source identity", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const current = buildSemanticGraph(fixture);
  const cachePath = writeSemanticGraphCache(fixture, current);

  assert.equal(fs.existsSync(cachePath), true);
  assert.equal(readSemanticGraphCache(fixture).status, "present");
  assert.equal(semanticGraphCacheStatus(fixture, current).status, "present");
  fs.appendFileSync(
    path.join(fixture, "scripts", "prepush.mjs"),
    "// changed\n",
  );
  const changed = buildSemanticGraph(fixture);
  assert.equal(semanticGraphCacheStatus(fixture, changed).status, "stale");

  fs.writeFileSync(cachePath, "not json\n");
  assert.equal(readSemanticGraphCache(fixture).status, "invalid");
});

test("semantic cache rejects structurally invalid and altered current graphs", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const current = buildSemanticGraph(fixture);
  const cachePath = writeSemanticGraphCache(fixture, current);

  const invalid = structuredClone(current);
  invalid.schemaVersion = 999;
  fs.writeFileSync(cachePath, `${JSON.stringify(invalid)}\n`);
  assert.equal(semanticGraphCacheStatus(fixture, current).status, "invalid");

  const altered = structuredClone(current);
  altered.nodes[0].label = `${altered.nodes[0].label} changed`;
  fs.writeFileSync(cachePath, `${JSON.stringify(altered)}\n`);
  assert.equal(semanticGraphCacheStatus(fixture, current).status, "stale");
});

test("semantic cache refuses non-regular and linked cache paths", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const graph = buildSemanticGraph(fixture);
  const cache = readSemanticGraphCache(fixture);
  fs.mkdirSync(cache.path, { recursive: true });
  assert.throws(
    () => writeSemanticGraphCache(fixture, graph),
    /cache is not a regular file/u,
  );
  fs.rmSync(cache.path, { recursive: true, force: true });
  fs.rmSync(path.dirname(cache.path), { recursive: true, force: true });

  const linkedTarget = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-semantic-cache-"),
  );
  t.after(() => fs.rmSync(linkedTarget, { recursive: true, force: true }));
  try {
    fs.symlinkSync(linkedTarget, path.dirname(cache.path), "dir");
    assert.throws(
      () => writeSemanticGraphCache(fixture, graph),
      /cache directory is a symbolic link/u,
    );
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error?.code)) throw error;
  }
});

test("semantic graph CLI builds, queries, checks, and rejects stale caches", (t) => {
  const fixture = createSemanticFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  initGitRepository(fixture);
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: fixture,
      encoding: "utf8",
    });

  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Semantic project graph/u);

  const build = run(["build", "--json"]);
  assert.equal(build.status, 0, build.stderr);
  const built = JSON.parse(build.stdout);
  assert.equal(built.graph.schemaVersion, 1);
  assert.equal(built.metrics.nodes, built.graph.nodes.length);
  assert.ok(built.metrics.elapsedMs >= 0);
  assert.ok(built.metrics.peakRssBytes > 0);

  const tree = run(["tree", "--focus", "prepush", "--json"]);
  assert.equal(tree.status, 0, tree.stderr);
  assert.equal(JSON.parse(tree.stdout).query.target, "command:prepush");
  const impact = run(["impact", "scripts/lib/helper.mjs"]);
  assert.equal(impact.status, 0, impact.stderr);
  assert.match(impact.stdout, /Semantic impact/u);

  const check = run(["check", "--json"]);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).cache.status, "present");

  fs.appendFileSync(
    path.join(fixture, "scripts", "prepush.mjs"),
    "// stale cache\n",
  );
  const stale = run(["check", "--json"]);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).cache.status, "stale");

  const invalid = run(["tree"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /tree requires --focus/u);
  const unknown = run(["unknown"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown semantic graph command/u);

  const extraBuild = run(["build", "extra"]);
  assert.equal(extraBuild.status, 1);
  assert.match(extraBuild.stderr, /Unknown option or argument/u);
  const extraImpact = run(["impact", "prepush", "extra"]);
  assert.equal(extraImpact.status, 1);
  assert.match(extraImpact.stderr, /Unknown impact argument/u);
});

test("repository graph covers current commands, configuration, docs, and package files", () => {
  const graph = buildSemanticGraph(root);
  const errors = validateSemanticGraph(graph).filter(
    (entry) => entry.severity === "error",
  );
  assert.deepEqual(errors, []);
  assert.ok(
    graph.nodes.some((node) => node.id === "capability:push-inspection"),
  );
  assert.ok(
    graph.nodes.some((node) => node.id === "config:scanDebugArtifacts"),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.from === "package:commitment-issues" &&
        edge.type === "ships-in-package" &&
        edge.to === "module:scripts/prepush.mjs",
    ),
  );
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.type === "ships-in-package" && edge.to.includes("semantic-graph"),
    ),
    false,
  );
});

test("documented semantic graph schema stays aligned with implementation enums", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "semantic-graph.schema.json")),
  );
  assert.equal(
    schema.properties.schemaVersion.const,
    SEMANTIC_GRAPH_SCHEMA_VERSION,
  );
  assert.deepEqual(
    schema.$defs.edge.properties.certainty.enum,
    SEMANTIC_GRAPH_CERTAINTIES,
  );
  assert.deepEqual(
    schema.$defs.node.properties.kind.enum,
    SEMANTIC_GRAPH_NODE_KINDS,
  );
  assert.deepEqual(
    schema.$defs.edge.properties.type.enum,
    SEMANTIC_GRAPH_EDGE_TYPES,
  );
  assert.deepEqual(
    schema.$defs.edge.properties.provenance.enum,
    SEMANTIC_GRAPH_PROVENANCES,
  );
});
