// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";

export const SEMANTIC_GRAPH_SCHEMA_VERSION = 1;
export const SEMANTIC_GRAPH_CERTAINTIES = Object.freeze([
  "proven",
  "tool-reported",
  "declared",
  "inferred",
  "unknown",
]);
export const SEMANTIC_GRAPH_NODE_KINDS = Object.freeze([
  "capability",
  "command",
  "config-key",
  "document",
  "file",
  "hook",
  "module",
  "package",
  "symbol",
  "test",
]);
export const SEMANTIC_GRAPH_EDGE_TYPES = Object.freeze([
  "configured-by",
  "dispatches-to",
  "documented-by",
  "exports",
  "generates",
  "implements",
  "imports",
  "ships-in-package",
  "tested-by",
]);
export const SEMANTIC_GRAPH_PROVENANCES = Object.freeze([
  "documentation",
  "javascript-parser",
  "package-manifest",
  "project-registry",
  "project-tool",
  "semantic-manifest",
  "test-convention",
]);

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const PARSEABLE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs"]);
const CACHE_DIRECTORY = "commitment-issues";
const CACHE_FILENAME = `semantic-graph-v${SEMANTIC_GRAPH_SCHEMA_VERSION}.json`;
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;

function normalizePath(file) {
  return file.split(path.sep).join("/").replace(/^\.\//u, "");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function diagnostic(code, message, options = {}) {
  return {
    code,
    message,
    severity: options.severity ?? "warning",
    ...(options.path ? { path: options.path } : {}),
    ...(options.line ? { line: options.line } : {}),
  };
}

function gitBuffer(root, args) {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: root,
    encoding: null,
    maxBuffer: GIT_OUTPUT_LIMIT,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : "";
    throw new Error(
      `Git could not ${args.join(" ")}${detail ? `: ${detail}` : "."}`,
      { cause: result.error },
    );
  }
  return result.stdout ?? Buffer.alloc(0);
}

function nulPaths(output) {
  if (output.length === 0) return [];
  if (output.at(-1) !== 0) {
    throw new Error("Git returned a malformed NUL-delimited pathname list.");
  }
  return output
    .subarray(0, -1)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .sort((left, right) => left.localeCompare(right));
}

function hashTrackedPath(hash, root, relativePath) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  hash.update("path\0");
  hash.update(relativePath);
  hash.update("\0");
  try {
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      hash.update("symlink\0");
      hash.update(fs.readlinkSync(absolutePath));
    } else if (stats.isFile()) {
      hash.update("file\0");
      hash.update(fs.readFileSync(absolutePath));
    } else {
      hash.update(`unsupported:${stats.mode}\0`);
    }
  } catch (error) {
    hash.update(error?.code === "ENOENT" ? "missing\0" : "unreadable\0");
  }
}

/**
 * Read the complete tracked repository identity used by graph generation.
 * HEAD and both diffs distinguish index/worktree state, while content hashing
 * catches repeated edits that keep the same porcelain status shape.
 *
 * @param {string} root - Repository root.
 * @returns {{head: string|null, fingerprint: string, dirty: boolean, trackedFiles: string[], totalTrackedBytes: number, totalIndexableBytes: number}}
 */
export function readRepositorySourceState(root) {
  const headResult = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  const head =
    headResult.status === 0 && typeof headResult.stdout === "string"
      ? headResult.stdout.trim()
      : null;
  const trackedFiles = nulPaths(
    gitBuffer(root, ["ls-files", "--cached", "-z"]),
  );
  const stagedDiff = gitBuffer(root, [
    "diff",
    "--cached",
    "--binary",
    "--no-ext-diff",
  ]);
  const worktreeDiff = gitBuffer(root, ["diff", "--binary", "--no-ext-diff"]);
  const hash = crypto.createHash("sha256");
  hash.update(
    `schema:${SEMANTIC_GRAPH_SCHEMA_VERSION}\0head:${head ?? "unborn"}\0`,
  );
  hash.update("staged\0");
  hash.update(stagedDiff);
  hash.update("\0worktree\0");
  hash.update(worktreeDiff);

  let totalTrackedBytes = 0;
  let totalIndexableBytes = 0;
  for (const relativePath of trackedFiles) {
    hashTrackedPath(hash, root, relativePath);
    try {
      const absolutePath = path.join(root, ...relativePath.split("/"));
      const stats = fs.lstatSync(absolutePath);
      if (stats.isFile()) {
        totalTrackedBytes += stats.size;
        const contents = fs.readFileSync(absolutePath);
        if (!contents.includes(0)) totalIndexableBytes += contents.length;
      }
    } catch {
      // Missing/deleted paths are represented in the fingerprint above.
    }
  }

  return {
    head,
    fingerprint: hash.digest("hex"),
    dirty: stagedDiff.length > 0 || worktreeDiff.length > 0,
    trackedFiles,
    totalTrackedBytes,
    totalIndexableBytes,
  };
}

function nodeKind(relativePath) {
  const extension = path.posix.extname(relativePath);
  if (
    SOURCE_EXTENSIONS.has(extension) &&
    (/(^|\/)(test|tests|__tests__)\//u.test(relativePath) ||
      /\.(?:test|spec)\.[^.]+$/u.test(relativePath))
  ) {
    return "test";
  }
  if (relativePath.endsWith(".md")) return "document";
  if (SOURCE_EXTENSIONS.has(path.posix.extname(relativePath))) return "module";
  return "file";
}

function nodeIdForPath(relativePath) {
  return `${nodeKind(relativePath)}:${relativePath}`;
}

function evidence(relativePath, line, detail) {
  return {
    path: relativePath,
    ...(line ? { line } : {}),
    detail,
  };
}

function propertyName(property) {
  if (!property || property.type !== "Property") return null;
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  return typeof property.key.value === "string" ? property.key.value : null;
}

function literalString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node?.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function staticObjectProperty(object, name) {
  if (object?.type !== "ObjectExpression") return null;
  const property = object.properties.find(
    (entry) => propertyName(entry) === name,
  );
  return property?.type === "Property" ? property.value : null;
}

function variableInitializer(program, name) {
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === name) {
        return declarator.init;
      }
    }
  }
  return null;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range") continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value.type === "string") {
      walk(value, visit);
    }
  }
}

function exportedNames(statement) {
  if (statement.type === "ExportDefaultDeclaration") return ["default"];
  if (statement.type !== "ExportNamedDeclaration") return [];
  const names = [];
  const declaration = statement.declaration;
  if (declaration?.id?.type === "Identifier") names.push(declaration.id.name);
  if (declaration?.type === "VariableDeclaration") {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === "Identifier") names.push(declarator.id.name);
    }
  }
  for (const specifier of statement.specifiers) {
    if (specifier.exported?.type === "Identifier")
      names.push(specifier.exported.name);
    else if (typeof specifier.exported?.value === "string") {
      names.push(specifier.exported.value);
    }
  }
  return [...new Set(names)];
}

function parseSource(source, relativePath, diagnostics) {
  try {
    return parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      loc: true,
      range: true,
      ecmaFeatures: { jsx: true },
    });
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "source.parse-failed",
        `Could not parse ${relativePath}: ${error.message}`,
        { path: relativePath, line: error.lineNumber },
      ),
    );
    return null;
  }
}

function resolveRelativeModule(fromPath, specifier, trackedSet) {
  if (!specifier.startsWith(".")) return null;
  const base = normalizePath(
    path.posix.normalize(
      path.posix.join(path.posix.dirname(fromPath), specifier),
    ),
  );
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) =>
      path.posix.join(base, `index${extension}`),
    ),
  ];
  return candidates.find((candidate) => trackedSet.has(candidate)) ?? null;
}

function addSortedUnique(array, value, key) {
  if (!array.some((entry) => key(entry) === key(value))) array.push(value);
}

function addNode(nodes, node, diagnostics) {
  const existing = nodes.get(node.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(node)) {
    diagnostics.push(
      diagnostic(
        "graph.conflicting-node",
        `Node ${node.id} has conflicting definitions.`,
        {
          severity: "error",
        },
      ),
    );
    return;
  }
  nodes.set(node.id, node);
}

function addEdge(edges, edge) {
  addSortedUnique(
    edges,
    edge,
    (entry) => `${entry.from}\0${entry.type}\0${entry.to}\0${entry.certainty}`,
  );
}

function addModuleRelationships({
  ast,
  relativePath,
  nodes,
  edges,
  trackedSet,
  diagnostics,
}) {
  const sourceId = nodeIdForPath(relativePath);
  for (const statement of ast.body) {
    for (const name of exportedNames(statement)) {
      const id = `symbol:${relativePath}#${name}`;
      addNode(
        nodes,
        {
          id,
          kind: "symbol",
          label: name,
          path: relativePath,
          line: statement.loc?.start.line ?? 1,
        },
        diagnostics,
      );
      addEdge(edges, {
        from: sourceId,
        type: "exports",
        to: id,
        certainty: "proven",
        provenance: "javascript-parser",
        evidence: evidence(
          relativePath,
          statement.loc?.start.line,
          "ES module export",
        ),
      });
    }
  }

  walk(ast, (node) => {
    let specifier = null;
    let detail = null;
    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      (node.type === "ExportNamedDeclaration" && node.source)
    ) {
      specifier = literalString(node.source);
      detail = node.type.startsWith("Export")
        ? "static re-export"
        : "static import";
    } else if (node.type === "ImportExpression") {
      specifier = literalString(node.source);
      detail =
        specifier === null
          ? "dynamic import with a computed target"
          : "dynamic import with a literal target";
      if (specifier === null) {
        diagnostics.push(
          diagnostic(
            "source.dynamic-import-unknown",
            `${relativePath} contains a dynamic import whose target cannot be proven statically.`,
            { path: relativePath, line: node.loc?.start.line },
          ),
        );
        return;
      }
    }
    if (specifier === null || !specifier.startsWith(".")) return;
    const target = resolveRelativeModule(relativePath, specifier, trackedSet);
    if (!target) {
      diagnostics.push(
        diagnostic(
          "source.relative-import-missing",
          `${relativePath} references ${specifier}, which is not a tracked module.`,
          { path: relativePath, line: node.loc?.start.line },
        ),
      );
      return;
    }
    addEdge(edges, {
      from: sourceId,
      type: "imports",
      to: nodeIdForPath(target),
      certainty: "proven",
      provenance: "javascript-parser",
      evidence: evidence(relativePath, node.loc?.start.line, detail),
    });
  });
}

function addCommandRelationships({
  ast,
  nodes,
  edges,
  diagnostics,
  trackedSet,
}) {
  const commands = variableInitializer(ast, "COMMANDS");
  if (commands?.type !== "ObjectExpression") {
    diagnostics.push(
      diagnostic(
        "command.registry-missing",
        "scripts/cli.mjs does not expose a static COMMANDS registry.",
        {
          severity: "error",
          path: "scripts/cli.mjs",
        },
      ),
    );
    return;
  }
  for (const property of commands.properties) {
    const name = propertyName(property);
    if (
      !name ||
      property.type !== "Property" ||
      property.value.type !== "ObjectExpression"
    )
      continue;
    const file = literalString(staticObjectProperty(property.value, "file"));
    const visibility =
      literalString(staticObjectProperty(property.value, "visibility")) ??
      "unknown";
    const target = file ? `scripts/${file}` : null;
    const id = `command:${name}`;
    addNode(
      nodes,
      {
        id,
        kind: "command",
        label: name,
        visibility,
        ...(target ? { path: target } : {}),
      },
      diagnostics,
    );
    if (!target && visibility === "hidden") continue;
    if (!target || !trackedSet.has(target)) {
      diagnostics.push(
        diagnostic(
          "command.target-missing",
          `Command ${name} has no tracked dispatch target.`,
          {
            severity: "error",
            path: "scripts/cli.mjs",
            line: property.loc?.start.line,
          },
        ),
      );
      continue;
    }
    addEdge(edges, {
      from: id,
      type: "dispatches-to",
      to: nodeIdForPath(target),
      certainty: "proven",
      provenance: "project-registry",
      evidence: evidence(
        "scripts/cli.mjs",
        property.loc?.start.line,
        "static command registry",
      ),
    });
  }
}

function addHookRelationships({ ast, nodes, edges, diagnostics }) {
  const hooks = variableInitializer(ast, "HOOK_SUBCOMMANDS");
  if (hooks?.type !== "ObjectExpression") {
    diagnostics.push(
      diagnostic(
        "hook.registry-missing",
        "scripts/lib/hooks.mjs does not expose a static HOOK_SUBCOMMANDS registry.",
        {
          severity: "error",
          path: "scripts/lib/hooks.mjs",
        },
      ),
    );
    return;
  }
  for (const property of hooks.properties) {
    const name = propertyName(property);
    const command =
      property.type === "Property" ? literalString(property.value) : null;
    if (!name || !command) continue;
    const id = `hook:${name}`;
    addNode(nodes, { id, kind: "hook", label: name }, diagnostics);
    addEdge(edges, {
      from: id,
      type: "dispatches-to",
      to: `command:${command}`,
      certainty: "proven",
      provenance: "project-registry",
      evidence: evidence(
        "scripts/lib/hooks.mjs",
        property.loc?.start.line,
        "static hook registry",
      ),
    });
  }
}

function arrayStrings(node) {
  if (node?.type !== "ArrayExpression") return [];
  return node.elements.map(literalString).filter((value) => value !== null);
}

function addConfigRelationships({ ast, nodes, edges, diagnostics }) {
  const topLevel = arrayStrings(
    variableInitializer(ast, "KNOWN_PRECOMMIT_CONFIG_KEYS"),
  );
  const commitMessage = arrayStrings(
    variableInitializer(ast, "KNOWN_COMMIT_MESSAGE_CONFIG_KEYS"),
  );
  for (const key of topLevel) {
    const id = `config:${key}`;
    addNode(nodes, { id, kind: "config-key", label: key }, diagnostics);
    addEdge(edges, {
      from: nodeIdForPath("scripts/lib/config.mjs"),
      type: "configured-by",
      to: id,
      certainty: "proven",
      provenance: "project-registry",
      evidence: evidence(
        "scripts/lib/config.mjs",
        null,
        "configuration allowlist",
      ),
    });
  }
  for (const key of commitMessage) {
    const label = `commitMessage.${key}`;
    const id = `config:${label}`;
    addNode(nodes, { id, kind: "config-key", label }, diagnostics);
    addEdge(edges, {
      from: nodeIdForPath("scripts/lib/config.mjs"),
      type: "configured-by",
      to: id,
      certainty: "proven",
      provenance: "project-registry",
      evidence: evidence(
        "scripts/lib/config.mjs",
        null,
        "nested configuration allowlist",
      ),
    });
  }
}

function markdownTargets(source, documentPath) {
  const targets = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    let raw = match[1].trim();
    if (raw.startsWith("<") && raw.endsWith(">")) raw = raw.slice(1, -1);
    raw = raw.split(/\s+["']/u)[0];
    if (/^(?:[a-z]+:|#)/iu.test(raw)) continue;
    const withoutAnchor = raw.split("#")[0];
    if (!withoutAnchor) continue;
    try {
      const decoded = decodeURIComponent(withoutAnchor);
      targets.push({
        target: normalizePath(
          path.posix.normalize(
            path.posix.join(path.posix.dirname(documentPath), decoded),
          ),
        ),
        line: lineNumberAt(source, match.index),
        detail: "Markdown link",
      });
    } catch {
      // Malformed URL encoding is handled by the repository's link checker.
    }
  }
  for (const match of source.matchAll(
    /`((?:assets|docs|scripts|test|tools)\/[^`\n]+)`/gu,
  )) {
    const candidate = match[1]
      .replace(/#.*$/u, "")
      .replace(/:\d+(?::\d+)?$/u, "")
      .replace(/[.,;:]$/u, "");
    targets.push({
      target: normalizePath(candidate),
      line: lineNumberAt(source, match.index),
      detail: "inline repository path",
    });
  }
  return targets;
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function addDocumentationRelationships({
  documents,
  nodes,
  edges,
  trackedSet,
}) {
  for (const [documentPath, source] of documents) {
    for (const target of markdownTargets(source, documentPath)) {
      if (!trackedSet.has(target.target)) continue;
      addEdge(edges, {
        from: nodeIdForPath(target.target),
        type: "documented-by",
        to: nodeIdForPath(documentPath),
        certainty: "proven",
        provenance: "documentation",
        evidence: evidence(documentPath, target.line, target.detail),
      });
    }

    for (const node of nodes.values()) {
      if (node.kind !== "command" && node.kind !== "config-key") continue;
      const label = node.label;
      const commandPattern = new RegExp(
        `(?:commitment-issues\\s+${escapedRegExp(label)}\\b|\`${escapedRegExp(label)}\`)`,
        "u",
      );
      const configLabel = label.startsWith("commitMessage.")
        ? label.split(".").at(-1)
        : label;
      const configPattern = new RegExp(
        `\`${escapedRegExp(configLabel)}\``,
        "u",
      );
      const match = source.match(
        node.kind === "command" ? commandPattern : configPattern,
      );
      if (!match) continue;
      addEdge(edges, {
        from: node.id,
        type: "documented-by",
        to: nodeIdForPath(documentPath),
        certainty:
          node.kind === "config-key" && label.startsWith("commitMessage.")
            ? "inferred"
            : "proven",
        provenance: "documentation",
        evidence: evidence(
          documentPath,
          lineNumberAt(source, match.index),
          `${node.kind} reference`,
        ),
      });
    }
  }
}

function addTestRelationships({ modules, tests, nodes, edges }) {
  const testPaths = [...tests.keys()];
  for (const edge of [...edges]) {
    if (edge.type !== "imports") continue;
    const from = nodes.get(edge.from);
    if (from?.kind !== "test") continue;
    addEdge(edges, {
      from: edge.to,
      type: "tested-by",
      to: edge.from,
      certainty: "proven",
      provenance: edge.provenance,
      evidence: edge.evidence,
    });
  }

  for (const modulePath of modules.keys()) {
    const basename = path.posix.basename(
      modulePath,
      path.posix.extname(modulePath),
    );
    const candidates = testPaths.filter((testPath) => {
      const testBase = path.posix.basename(testPath);
      return (
        testBase === `${basename}.test.mjs` ||
        testBase === `${basename}.test.js`
      );
    });
    for (const testPath of candidates) {
      addEdge(edges, {
        from: nodeIdForPath(modulePath),
        type: "tested-by",
        to: nodeIdForPath(testPath),
        certainty: "inferred",
        provenance: "test-convention",
        evidence: evidence(testPath, null, "matching test filename"),
      });
    }
  }

  for (const node of nodes.values()) {
    if (node.kind !== "config-key") continue;
    const shortLabel = node.label.split(".").at(-1);
    for (const [testPath, source] of tests) {
      const index = source.indexOf(shortLabel);
      if (index < 0) continue;
      addEdge(edges, {
        from: node.id,
        type: "tested-by",
        to: nodeIdForPath(testPath),
        certainty: "inferred",
        provenance: "test-convention",
        evidence: evidence(
          testPath,
          lineNumberAt(source, index),
          "configuration key appears in test",
        ),
      });
    }
  }

  for (const node of nodes.values()) {
    if (node.kind !== "command" || !node.path) continue;
    const targetId = nodeIdForPath(node.path);
    for (const edge of [...edges]) {
      if (edge.from !== targetId || edge.type !== "tested-by") continue;
      addEdge(edges, {
        from: node.id,
        type: "tested-by",
        to: edge.to,
        certainty: edge.certainty,
        provenance: edge.provenance,
        evidence: edge.evidence,
      });
    }
  }
}

function addPackageRelationships({
  packageJson,
  nodes,
  edges,
  trackedSet,
  diagnostics,
}) {
  const packageId = `package:${packageJson.name ?? "unknown"}`;
  addNode(
    nodes,
    {
      id: packageId,
      kind: "package",
      label: packageJson.name ?? "unknown",
      version: packageJson.version ?? null,
    },
    diagnostics,
  );
  for (const relativePath of [...(packageJson.files ?? [])].sort(
    (left, right) => left.localeCompare(right),
  )) {
    if (!trackedSet.has(relativePath)) {
      diagnostics.push(
        diagnostic(
          "package.file-missing",
          `Published file ${relativePath} is not tracked.`,
          {
            severity: "error",
            path: "package.json",
          },
        ),
      );
      continue;
    }
    addEdge(edges, {
      from: packageId,
      type: "ships-in-package",
      to: nodeIdForPath(relativePath),
      certainty: "proven",
      provenance: "package-manifest",
      evidence: evidence("package.json", null, "exact files allowlist"),
    });
  }
}

function addCapabilities({ manifest, nodes, edges, diagnostics }) {
  if (
    manifest.schemaVersion !== SEMANTIC_GRAPH_SCHEMA_VERSION ||
    !Array.isArray(manifest.capabilities)
  ) {
    diagnostics.push(
      diagnostic(
        "manifest.invalid",
        "The semantic capability manifest has an unsupported shape or version.",
        {
          severity: "error",
          path: "tools/semantic-capabilities.json",
        },
      ),
    );
    return;
  }
  for (const capability of manifest.capabilities) {
    if (
      typeof capability.id !== "string" ||
      typeof capability.label !== "string" ||
      typeof capability.description !== "string" ||
      !Array.isArray(capability.members)
    ) {
      diagnostics.push(
        diagnostic(
          "manifest.capability-invalid",
          "A semantic capability declaration is incomplete.",
          {
            severity: "error",
            path: "tools/semantic-capabilities.json",
          },
        ),
      );
      continue;
    }
    const capabilityId = `capability:${capability.id}`;
    addNode(
      nodes,
      {
        id: capabilityId,
        kind: "capability",
        label: capability.label,
        description: capability.description,
      },
      diagnostics,
    );
    for (const member of capability.members) {
      if (!nodes.has(member)) {
        diagnostics.push(
          diagnostic(
            "manifest.member-missing",
            `Capability ${capability.id} references missing node ${member}.`,
            { severity: "error", path: "tools/semantic-capabilities.json" },
          ),
        );
        continue;
      }
      addEdge(edges, {
        from: member,
        type: "implements",
        to: capabilityId,
        certainty: "declared",
        provenance: "semantic-manifest",
        evidence: evidence(
          "tools/semantic-capabilities.json",
          null,
          "capability membership",
        ),
      });
    }
  }
}

function sortedGraph({ source, nodes, edges, diagnostics }) {
  return {
    schemaVersion: SEMANTIC_GRAPH_SCHEMA_VERSION,
    source: {
      head: source.head,
      fingerprint: source.fingerprint,
      dirty: source.dirty,
      trackedFileCount: source.trackedFiles.length,
      totalTrackedBytes: source.totalTrackedBytes,
      totalIndexableBytes: source.totalIndexableBytes,
    },
    nodes: [...nodes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    edges: [...edges].sort((left, right) =>
      `${left.from}\0${left.type}\0${left.to}\0${left.certainty}`.localeCompare(
        `${right.from}\0${right.type}\0${right.to}\0${right.certainty}`,
      ),
    ),
    diagnostics: [...diagnostics].sort((left, right) =>
      `${left.severity}\0${left.code}\0${left.path ?? ""}\0${left.line ?? 0}\0${left.message}`.localeCompare(
        `${right.severity}\0${right.code}\0${right.path ?? ""}\0${right.line ?? 0}\0${right.message}`,
      ),
    ),
  };
}

/**
 * Compile the current repository into a deterministic semantic graph.
 *
 * @param {string} root - Repository root.
 * @param {{sourceState?: ReturnType<typeof readRepositorySourceState>, manifestPath?: string}} [options]
 * @returns {object} Versioned semantic graph.
 */
export function buildSemanticGraph(root, options = {}) {
  const source = options.sourceState ?? readRepositorySourceState(root);
  const trackedSet = new Set(source.trackedFiles);
  const nodes = new Map();
  const edges = [];
  const diagnostics = [];
  const modules = new Map();
  const tests = new Map();
  const documents = new Map();
  const asts = new Map();

  for (const relativePath of source.trackedFiles) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    let stats;
    try {
      stats = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        diagnostics.push(
          diagnostic(
            "file.unreadable",
            `${relativePath} could not be inspected.`,
            { path: relativePath },
          ),
        );
      }
      continue;
    }
    if (!stats.isFile()) {
      diagnostics.push(
        diagnostic(
          "file.unsupported-type",
          `${relativePath} is not a regular file and was not inspected.`,
          {
            path: relativePath,
          },
        ),
      );
      continue;
    }
    const kind = nodeKind(relativePath);
    addNode(
      nodes,
      {
        id: nodeIdForPath(relativePath),
        kind,
        label: relativePath,
        path: relativePath,
        bytes: stats.size,
      },
      diagnostics,
    );
    const extension = path.posix.extname(relativePath);
    if (kind === "document") {
      documents.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
    }
    if (kind === "test" || SOURCE_EXTENSIONS.has(extension)) {
      const sourceText = fs.readFileSync(absolutePath, "utf8");
      if (kind === "test") tests.set(relativePath, sourceText);
      else modules.set(relativePath, sourceText);
      if (PARSEABLE_EXTENSIONS.has(extension)) {
        const ast = parseSource(sourceText, relativePath, diagnostics);
        if (ast) asts.set(relativePath, ast);
      } else {
        diagnostics.push(
          diagnostic(
            "source.parser-unsupported",
            `${relativePath} uses a source extension that the JavaScript parser does not claim to understand.`,
            { path: relativePath },
          ),
        );
      }
    }
  }

  for (const [relativePath, ast] of asts) {
    addModuleRelationships({
      ast,
      relativePath,
      nodes,
      edges,
      trackedSet,
      diagnostics,
    });
  }

  const cliAst = asts.get("scripts/cli.mjs");
  if (cliAst)
    addCommandRelationships({
      ast: cliAst,
      nodes,
      edges,
      diagnostics,
      trackedSet,
    });
  else {
    diagnostics.push(
      diagnostic(
        "command.source-unavailable",
        "scripts/cli.mjs could not be parsed.",
        {
          severity: "error",
          path: "scripts/cli.mjs",
        },
      ),
    );
  }
  const hooksAst = asts.get("scripts/lib/hooks.mjs");
  if (hooksAst)
    addHookRelationships({ ast: hooksAst, nodes, edges, diagnostics });
  const configAst = asts.get("scripts/lib/config.mjs");
  if (configAst)
    addConfigRelationships({ ast: configAst, nodes, edges, diagnostics });

  addDocumentationRelationships({ documents, nodes, edges, trackedSet });
  addTestRelationships({ modules, tests, nodes, edges });

  let packageJson = {};
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "package.invalid",
        `package.json could not be read: ${error.message}`,
        {
          severity: "error",
          path: "package.json",
        },
      ),
    );
  }
  addPackageRelationships({
    packageJson,
    nodes,
    edges,
    trackedSet,
    diagnostics,
  });

  const manifestPath =
    options.manifestPath ??
    path.join(root, "tools", "semantic-capabilities.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    addCapabilities({ manifest, nodes, edges, diagnostics });
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "manifest.unreadable",
        `The semantic capability manifest could not be read: ${error.message}`,
        {
          severity: "error",
          path: normalizePath(path.relative(root, manifestPath)),
        },
      ),
    );
  }

  return sortedGraph({ source, nodes, edges, diagnostics });
}

function hasRelationship(edges, from, type) {
  return edges.some((edge) => edge.from === from && edge.type === type);
}

/**
 * Validate structural and repository-specific graph invariants.
 *
 * @param {object} graph - Semantic graph.
 * @returns {Array<{code: string, message: string, severity: string}>} Diagnostics.
 */
export function validateSemanticGraph(graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return [
      diagnostic("graph.invalid-root", "Graph root must be an object.", {
        severity: "error",
      }),
    ];
  }
  const diagnostics = Array.isArray(graph.diagnostics)
    ? [...graph.diagnostics]
    : [
        diagnostic(
          "graph.invalid-diagnostics",
          "Graph diagnostics must be an array.",
          { severity: "error" },
        ),
      ];
  if (graph.schemaVersion !== SEMANTIC_GRAPH_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "graph.unsupported-schema",
        `Graph schema ${graph.schemaVersion ?? "<missing>"} is not supported.`,
        { severity: "error" },
      ),
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(graph.source?.fingerprint ?? "")) {
    diagnostics.push(
      diagnostic(
        "graph.invalid-source-identity",
        "Graph source fingerprint is missing or malformed.",
        { severity: "error" },
      ),
    );
  }
  if (
    !graph.source ||
    (graph.source.head !== null && typeof graph.source.head !== "string") ||
    typeof graph.source.dirty !== "boolean" ||
    !Number.isInteger(graph.source.trackedFileCount) ||
    graph.source.trackedFileCount < 0 ||
    !Number.isInteger(graph.source.totalTrackedBytes) ||
    graph.source.totalTrackedBytes < 0 ||
    !Number.isInteger(graph.source.totalIndexableBytes) ||
    graph.source.totalIndexableBytes < 0
  ) {
    diagnostics.push(
      diagnostic(
        "graph.invalid-source",
        "Graph source metadata is incomplete or malformed.",
        { severity: "error" },
      ),
    );
  }
  const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const graphEdges = Array.isArray(graph.edges) ? graph.edges : [];
  if (!Array.isArray(graph.nodes)) {
    diagnostics.push(
      diagnostic("graph.invalid-nodes", "Graph nodes must be an array.", {
        severity: "error",
      }),
    );
  }
  if (!Array.isArray(graph.edges)) {
    diagnostics.push(
      diagnostic("graph.invalid-edges", "Graph edges must be an array.", {
        severity: "error",
      }),
    );
  }
  const nodes = new Map();
  for (const node of graphNodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      node.id.length === 0 ||
      !SEMANTIC_GRAPH_NODE_KINDS.includes(node.kind) ||
      typeof node.label !== "string" ||
      node.label.length === 0
    ) {
      diagnostics.push(
        diagnostic(
          "graph.invalid-node",
          "Every graph node needs a non-empty id and label plus a supported kind.",
          { severity: "error" },
        ),
      );
      continue;
    }
    if (nodes.has(node.id)) {
      diagnostics.push(
        diagnostic(
          "graph.duplicate-node",
          `Graph node ${node.id} is duplicated.`,
          { severity: "error" },
        ),
      );
    }
    nodes.set(node.id, node);
  }
  for (const edge of graphEdges) {
    if (
      !edge ||
      typeof edge.from !== "string" ||
      edge.from.length === 0 ||
      typeof edge.to !== "string" ||
      edge.to.length === 0 ||
      !SEMANTIC_GRAPH_EDGE_TYPES.includes(edge.type)
    ) {
      diagnostics.push(
        diagnostic(
          "graph.invalid-edge",
          "Every graph edge needs non-empty endpoints and a supported relationship type.",
          { severity: "error" },
        ),
      );
      continue;
    }
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      diagnostics.push(
        diagnostic(
          "graph.dangling-edge",
          `Graph edge ${edge.from} -> ${edge.to} is dangling.`,
          {
            severity: "error",
          },
        ),
      );
    }
    if (!SEMANTIC_GRAPH_CERTAINTIES.includes(edge.certainty)) {
      diagnostics.push(
        diagnostic(
          "graph.invalid-certainty",
          `Graph edge ${edge.from} uses invalid certainty ${edge.certainty}.`,
          {
            severity: "error",
          },
        ),
      );
    }
    if (!SEMANTIC_GRAPH_PROVENANCES.includes(edge.provenance)) {
      diagnostics.push(
        diagnostic(
          "graph.invalid-provenance",
          `Graph edge ${edge.from} uses invalid provenance ${edge.provenance}.`,
          {
            severity: "error",
          },
        ),
      );
    }
    if (!edge.evidence?.path || !edge.evidence?.detail) {
      diagnostics.push(
        diagnostic(
          "graph.missing-evidence",
          `Graph edge ${edge.from} -> ${edge.to} lacks evidence.`,
          {
            severity: "error",
          },
        ),
      );
    }
  }
  for (const node of nodes.values()) {
    if (node.kind === "command" && node.visibility !== "hidden") {
      for (const relationship of [
        "dispatches-to",
        "tested-by",
        "documented-by",
      ]) {
        if (!hasRelationship(graphEdges, node.id, relationship)) {
          diagnostics.push(
            diagnostic(
              `command.${relationship}-missing`,
              `Public command ${node.label} has no ${relationship} relationship.`,
              { severity: "error" },
            ),
          );
        }
      }
    }
    if (node.kind === "config-key") {
      for (const relationship of ["tested-by", "documented-by"]) {
        if (!hasRelationship(graphEdges, node.id, relationship)) {
          diagnostics.push(
            diagnostic(
              `config.${relationship}-missing`,
              `Configuration key ${node.label} has no ${relationship} relationship.`,
              { severity: "error" },
            ),
          );
        }
      }
    }
  }
  return diagnostics.sort((left, right) =>
    `${left.severity}\0${left.code}\0${left.message}`.localeCompare(
      `${right.severity}\0${right.code}\0${right.message}`,
    ),
  );
}

function gitCommonDirectory(root) {
  const commonDir = gitBuffer(root, ["rev-parse", "--git-common-dir"])
    .toString("utf8")
    .trim();
  return path.isAbsolute(commonDir) ? commonDir : path.resolve(root, commonDir);
}

export function semanticGraphLocalDirectory(root) {
  return path.join(gitCommonDirectory(root), CACHE_DIRECTORY);
}

export function semanticGraphCachePath(root) {
  return path.join(semanticGraphLocalDirectory(root), CACHE_FILENAME);
}

function assertCachePathSafe(cachePath) {
  const parent = path.dirname(cachePath);
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) {
    throw new Error(
      `Semantic graph cache directory is a symbolic link: ${parent}`,
    );
  }
  if (fs.existsSync(cachePath)) {
    const stats = fs.lstatSync(cachePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(
        `Semantic graph cache is not a regular file: ${cachePath}`,
      );
    }
  }
}

export function writeSemanticGraphCache(root, graph) {
  const cachePath = semanticGraphCachePath(root);
  assertCachePathSafe(cachePath);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  assertCachePathSafe(cachePath);
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(graph, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, cachePath);
  } finally {
    try {
      fs.rmSync(temporaryPath);
    } catch {
      // The complete cache has already been renamed or the original write
      // error remains authoritative; temporary cleanup is best effort.
    }
  }
  return cachePath;
}

export function readSemanticGraphCache(root) {
  const cachePath = semanticGraphCachePath(root);
  if (!fs.existsSync(cachePath)) return { status: "missing", path: cachePath };
  assertCachePathSafe(cachePath);
  try {
    return {
      status: "present",
      path: cachePath,
      graph: JSON.parse(fs.readFileSync(cachePath, "utf8")),
    };
  } catch (error) {
    return { status: "invalid", path: cachePath, error: error.message };
  }
}

export function semanticGraphCacheStatus(root, currentGraph) {
  const cache = readSemanticGraphCache(root);
  if (cache.status !== "present") return cache;
  const cachedErrors = validateSemanticGraph(cache.graph).filter(
    (entry) => entry.severity === "error",
  );
  if (cachedErrors.length > 0) {
    return {
      status: "invalid",
      path: cache.path,
      graph: cache.graph,
      errors: cachedErrors,
    };
  }
  if (
    cache.graph.source.fingerprint !== currentGraph.source.fingerprint ||
    JSON.stringify(cache.graph) !== JSON.stringify(currentGraph)
  ) {
    return { status: "stale", path: cache.path, graph: cache.graph };
  }
  return cache;
}

export function resolveSemanticNode(graph, query) {
  const normalized = normalizePath(query);
  const exact = graph.nodes.find(
    (node) => node.id === query || node.path === normalized,
  );
  if (exact) return exact;
  const lowered = query.toLowerCase();
  const matches = graph.nodes.filter(
    (node) =>
      node.label.toLowerCase() === lowered ||
      node.id.toLowerCase().endsWith(`:${lowered}`),
  );
  if (matches.length === 1) return matches[0];
  const semanticMatches = matches.filter((node) =>
    ["capability", "command", "config-key", "hook", "package"].includes(
      node.kind,
    ),
  );
  if (semanticMatches.length === 1) return semanticMatches[0];
  if (matches.length === 0)
    throw new Error(`No semantic graph node matches '${query}'.`);
  throw new Error(
    `Semantic graph query '${query}' is ambiguous: ${matches.map((node) => node.id).join(", ")}`,
  );
}

export function querySemanticGraph(graph, query, options = {}) {
  const target = resolveSemanticNode(graph, query);
  const depth = Number.isInteger(options.depth) ? options.depth : 2;
  const selected = new Set([target.id]);
  let frontier = new Set([target.id]);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set();
    for (const edge of graph.edges) {
      if (frontier.has(edge.from) && !selected.has(edge.to)) next.add(edge.to);
      if (frontier.has(edge.to) && !selected.has(edge.from))
        next.add(edge.from);
    }
    for (const id of next) selected.add(id);
    frontier = next;
  }
  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const edges = graph.edges.filter(
    (edge) => selected.has(edge.from) && selected.has(edge.to),
  );
  const fileNodes = new Map(
    nodes.filter((node) => node.path).map((node) => [node.path, node]),
  );
  const selectedBytes = [...fileNodes.values()].reduce(
    (total, node) => total + (node.bytes ?? 0),
    0,
  );
  return {
    schemaVersion: graph.schemaVersion,
    source: graph.source,
    query: { input: query, target: target.id, depth },
    nodes,
    edges,
    diagnostics: graph.diagnostics.filter(
      (entry) => !entry.path || fileNodes.has(entry.path),
    ),
    retrieval: {
      selectedFiles: fileNodes.size,
      selectedBytes,
      totalTrackedFiles: graph.source.trackedFileCount,
      totalTrackedBytes: graph.source.totalTrackedBytes,
      totalIndexableBytes: graph.source.totalIndexableBytes,
    },
  };
}

function displayNode(node) {
  const suffix = node.path && node.label !== node.path ? ` (${node.path})` : "";
  return `${node.label}${suffix}`;
}

function displayEdgeEvidence(edge) {
  const location = `${edge.evidence.path}${edge.evidence.line ? `:${edge.evidence.line}` : ""}`;
  return `${edge.certainty}; ${edge.provenance} @ ${location}`;
}

function formatSemanticTree(result, nodes, target) {
  const adjacency = new Map();
  for (const edge of result.edges) {
    const outgoing = adjacency.get(edge.from) ?? [];
    outgoing.push({
      child: edge.to,
      relationship: edge.type,
      evidence: displayEdgeEvidence(edge),
    });
    adjacency.set(edge.from, outgoing);
    const incoming = adjacency.get(edge.to) ?? [];
    incoming.push({
      child: edge.from,
      relationship: `${edge.type} (incoming)`,
      evidence: displayEdgeEvidence(edge),
    });
    adjacency.set(edge.to, incoming);
  }

  function branches(nodeId, depth, ancestors) {
    if (depth >= result.query.depth) return [];
    const next = [...(adjacency.get(nodeId) ?? [])].sort((left, right) =>
      `${left.relationship}\0${left.child}`.localeCompare(
        `${right.relationship}\0${right.child}`,
      ),
    );
    return next.flatMap((entry) => {
      if (ancestors.has(entry.child)) return [];
      const child = nodes.get(entry.child);
      const prefix = "  ".repeat(depth);
      const line = `${prefix}- ${entry.relationship}: ${displayNode(child)} [${entry.evidence}]`;
      return [
        line,
        ...branches(
          entry.child,
          depth + 1,
          new Set([...ancestors, entry.child]),
        ),
      ];
    });
  }

  return [
    `Semantic tree: ${displayNode(target)}`,
    "",
    ...branches(target.id, 0, new Set([target.id])),
    "",
    `Retrieval: ${result.retrieval.selectedFiles} files, ${result.retrieval.selectedBytes} of ${result.retrieval.totalIndexableBytes} indexable text bytes.`,
  ]
    .join("\n")
    .trimEnd();
}

export function formatSemanticQuery(result, mode = "impact") {
  const nodes = new Map(result.nodes.map((node) => [node.id, node]));
  const target = nodes.get(result.query.target);
  if (mode === "tree") return formatSemanticTree(result, nodes, target);
  const groups = new Map();
  for (const edge of result.edges) {
    if (edge.from === target.id) {
      const key = edge.type;
      const values = groups.get(key) ?? [];
      values.push(
        `${displayNode(nodes.get(edge.to))} [${displayEdgeEvidence(edge)}]`,
      );
      groups.set(key, values);
    } else if (edge.to === target.id) {
      const key = `${edge.type} (incoming)`;
      const values = groups.get(key) ?? [];
      values.push(
        `${displayNode(nodes.get(edge.from))} [${displayEdgeEvidence(edge)}]`,
      );
      groups.set(key, values);
    }
  }
  const lines = [
    `Semantic ${mode}: ${displayNode(target)}`,
    "",
    ...[...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([relationship, values]) => [
        `${relationship}:`,
        ...[...new Set(values)].sort().map((value) => `- ${value}`),
        "",
      ]),
    `Retrieval: ${result.retrieval.selectedFiles} files, ${result.retrieval.selectedBytes} of ${result.retrieval.totalIndexableBytes} indexable text bytes.`,
  ];
  return lines.join("\n").trimEnd();
}

export function semanticGraphMetrics(graph) {
  const json = `${JSON.stringify(graph, null, 2)}\n`;
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    diagnostics: graph.diagnostics.length,
    bytes: Buffer.byteLength(json),
  };
}
