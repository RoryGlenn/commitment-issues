#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const inlineLinkRegex = /(?<!\!)\[[^\]]*?\]\(([^)]*)\)/g;
const referenceDefinitionRegex = /^\s*\[[^\]]+\]:\s*(.+)$/;
const titleTailRegex = /\s+(?:"[^"]*"|'[^']*'|\([^)]+\))\s*$/;

const repoRoot = resolveRepoRoot();
const gitOptions = { encoding: "utf8", cwd: repoRoot };
const trackedMarkdownFiles = listTrackedMarkdownFiles(gitOptions);
const diagnostics = [];
const normalizedRoot = path.resolve(repoRoot);
const rootWithSep = normalizedRoot.endsWith(path.sep)
  ? normalizedRoot
  : `${normalizedRoot}${path.sep}`;
const comparisonRoot = process.platform === "win32"
  ? normalizedRoot.toLowerCase()
  : normalizedRoot;
const comparisonRootWithSep = process.platform === "win32"
  ? rootWithSep.toLowerCase()
  : rootWithSep;

for (const relativeFile of trackedMarkdownFiles) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  let lines;
  try {
    lines = fs.readFileSync(absoluteFile, "utf8").split(/\r?\n/);
  } catch (error) {
    // If the file disappears between the Git listing and the scan, skip it.
    continue;
  }
  const fileDir = path.dirname(absoluteFile);
  let insideFence = false;
  let fenceChar = "";

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.match(/^( {0,3})([`~]{3,})/);
    if (fenceMatch) {
      const markerChar = fenceMatch[2][0];
      if (insideFence && markerChar === fenceChar) {
        insideFence = false;
        fenceChar = "";
        continue;
      }
      if (!insideFence) {
        insideFence = true;
        fenceChar = markerChar;
        continue;
      }
    }
    if (insideFence) {
      continue;
    }

    inlineLinkRegex.lastIndex = 0;
    for (const match of line.matchAll(inlineLinkRegex)) {
      processLink(match[1], relativeFile, index + 1, fileDir);
    }

    const referenceMatch = referenceDefinitionRegex.exec(line);
    if (referenceMatch) {
      processLink(referenceMatch[1], relativeFile, index + 1, fileDir);
    }
  }
}

if (diagnostics.length > 0) {
  for (const { location, target, reason } of diagnostics) {
    console.error(`${location} -> ${target} (${reason})`);
  }
  process.exit(1);
}

function resolveRepoRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error) {
    console.error("Unable to run git:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0 || !result.stdout) {
    console.error("Unable to determine the Git repository root.");
    process.exit(1);
  }
  return path.resolve(result.stdout.trim());
}

function listTrackedMarkdownFiles(options) {
  const result = spawnSync("git", ["ls-files", "--", "*.md"], options);
  if (result.error) {
    console.error("Unable to run git:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("Unable to list tracked Markdown files.");
    process.exit(1);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function processLink(rawTarget, relativeFile, lineNumber, fileDir) {
  const normalized = normalizeTarget(rawTarget);
  if (!normalized) {
    return;
  }

  const withoutFragment = stripFragmentAndQuery(normalized);
  if (!withoutFragment) {
    return;
  }

  if (isExternalTarget(withoutFragment)) {
    return;
  }

  const { decoded, error } = decodeTarget(withoutFragment);
  if (error) {
    addDiagnostic(
      relativeFile,
      lineNumber,
      withoutFragment,
      `malformed percent-encoding: ${error}`,
    );
    return;
  }

  const displayTarget = decoded;
  const resolved = resolveLocalTarget(decoded, fileDir);
  if (!resolved) {
    addDiagnostic(
      relativeFile,
      lineNumber,
      displayTarget,
      "path escapes repository root",
    );
    return;
  }

  if (!fs.existsSync(resolved)) {
    addDiagnostic(relativeFile, lineNumber, displayTarget, "target not found");
  }
}

function normalizeTarget(target) {
  let value = target.trim();
  if (!value) {
    return "";
  }

  if (value.startsWith("<")) {
    const closing = value.indexOf(">", 1);
    value = closing === -1 ? value.slice(1) : value.slice(1, closing);
    value = value.trim();
  } else {
    const tailMatch = value.match(titleTailRegex);
    if (tailMatch) {
      value = value.slice(0, tailMatch.index);
    }
  }

  return value.trim();
}

function stripFragmentAndQuery(value) {
  const fragmentIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  const boundary =
    fragmentIndex === -1
      ? queryIndex
      : queryIndex === -1
      ? fragmentIndex
      : Math.min(fragmentIndex, queryIndex);
  if (boundary === -1) {
    return value.trim();
  }
  return value.slice(0, boundary).trim();
}

function isExternalTarget(value) {
  if (!value) {
    return false;
  }
  if (value.startsWith("//")) {
    return true;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("http:") || lower.startsWith("https:") || lower.startsWith("mailto:")) {
    return true;
  }
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch && schemeMatch[1].length > 1) {
    return true;
  }
  return false;
}

function decodeTarget(value) {
  try {
    return { decoded: decodeURIComponent(value), error: null };
  } catch (error) {
    return {
      decoded: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveLocalTarget(value, fileDir) {
  const candidate = value.startsWith("/")
    ? path.resolve(repoRoot, value.slice(1))
    : path.resolve(fileDir, value);
  const candidateForComparison =
    process.platform === "win32" ? candidate.toLowerCase() : candidate;
  if (
    candidateForComparison === comparisonRoot ||
    candidateForComparison.startsWith(comparisonRootWithSep)
  ) {
    return candidate;
  }
  return null;
}

function addDiagnostic(relativeFile, lineNumber, target, reason) {
  const location = `${relativeFile}:${lineNumber}`;
  diagnostics.push({ location, target, reason });
}
