// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";

function maskRange(text) {
  return text.replace(/[^\r\n]/g, " ");
}

function maskFencedCode(markdown) {
  const lines = markdown.match(/.*(?:\r?\n|$)/g) ?? [];
  let fence;

  return lines
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
      if (!fence && marker) {
        fence = { character: marker[0], length: marker.length };
        return maskRange(line);
      }
      if (!fence) return line;

      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*(?:\r?\n|$)/u)?.[1];
      const masked = maskRange(line);
      if (closing?.[0] === fence.character && closing.length >= fence.length) {
        fence = undefined;
      }
      return masked;
    })
    .join("");
}

function maskInlineCode(markdown) {
  const characters = [...markdown];

  for (let start = 0; start < characters.length; start += 1) {
    if (characters[start] !== "`") continue;

    let runLength = 1;
    while (characters[start + runLength] === "`") runLength += 1;
    let end = start + runLength;
    while (end < characters.length) {
      if (characters[end] !== "`") {
        end += 1;
        continue;
      }
      let closingLength = 1;
      while (characters[end + closingLength] === "`") closingLength += 1;
      if (closingLength !== runLength) {
        end += closingLength;
        continue;
      }
      for (let index = start; index < end + runLength; index += 1) {
        if (characters[index] !== "\n" && characters[index] !== "\r") {
          characters[index] = " ";
        }
      }
      start = end + runLength - 1;
      break;
    }
  }

  return characters.join("");
}

function markdownProse(markdown) {
  return maskInlineCode(
    maskFencedCode(markdown).replace(/<!--[\s\S]*?-->/gu, maskRange),
  );
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/u).length;
}

function unescapeMarkdownTarget(target) {
  return target.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/gu, "$1");
}

function extractedTargets(markdown) {
  const prose = markdownProse(markdown);
  const targets = [];
  const patterns = [
    /!?\[[^\]\r\n]*\]\(\s*(?:<([^>\r\n]+)>|((?:\\[^\r\n]|[^()\s\\]|\([^()\r\n]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu,
    /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(?:<([^>\r\n]+)>|([^\s]+))/gmu,
  ];

  for (const pattern of patterns) {
    for (const match of prose.matchAll(pattern)) {
      targets.push({
        line: lineNumberAt(prose, match.index),
        target: match[1] ?? match[2],
      });
    }
  }

  for (const match of prose.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/giu)) {
    targets.push({
      line: lineNumberAt(prose, match.index),
      target: match[2],
    });
  }

  return targets;
}

function classifyTarget(source, rawTarget) {
  const target = unescapeMarkdownTarget(rawTarget.trim());
  if (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return undefined;
  }

  const filePart = target.split(/[?#]/u, 1)[0];
  if (filePart.startsWith("/")) {
    return { reason: "escapes the package root", resolved: filePart, target };
  }

  let decoded;
  try {
    decoded = decodeURIComponent(filePart);
  } catch {
    return { reason: "contains malformed URL encoding", target };
  }

  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), decoded),
  );
  if (resolved === ".." || resolved.startsWith("../")) {
    return { reason: "escapes the package root", resolved, target };
  }
  return { resolved, target };
}

function targetExists(resolved, files) {
  if (files.has(resolved)) return true;
  const directory = resolved === "." ? "" : `${resolved.replace(/\/$/u, "")}/`;
  return [...files].some((file) => file.startsWith(directory));
}

export function findBrokenPackedMarkdownLinks({ files, readFile }) {
  const packedFiles = new Set(
    [...files].map((file) => file.replaceAll("\\", "/")),
  );
  const failures = [];

  for (const source of [...packedFiles].sort()) {
    if (!source.toLowerCase().endsWith(".md")) continue;

    const markdown = readFile(source);
    for (const { line, target: rawTarget } of extractedTargets(markdown)) {
      const classified = classifyTarget(source, rawTarget);
      if (!classified) continue;

      if (
        classified.reason ||
        !targetExists(classified.resolved, packedFiles)
      ) {
        failures.push({
          source,
          line,
          target: classified.target,
          resolved: classified.resolved,
          reason: classified.reason ?? "is absent from the packed file set",
        });
      }
    }
  }

  return failures;
}

function filesBelow(rootDir, relativeDir = "") {
  const files = [];
  const directory = path.join(rootDir, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        files.push(...filesBelow(rootDir, relativePath));
      }
    } else if (entry.isFile()) {
      files.push(relativePath.replaceAll(path.sep, "/"));
    }
  }
  return files;
}

export function findBrokenMarkdownLinksInDirectory(rootDir) {
  const files = filesBelow(rootDir);
  return findBrokenPackedMarkdownLinks({
    files,
    readFile: (file) => fs.readFileSync(path.join(rootDir, file), "utf8"),
  });
}

export function formatBrokenMarkdownLink(failure) {
  const resolved = failure.resolved ? ` (resolves to ${failure.resolved})` : "";
  return `${failure.source}:${failure.line}: ${failure.target}${resolved} ${failure.reason}`;
}
