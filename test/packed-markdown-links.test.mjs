// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findBrokenMarkdownLinksInDirectory,
  findBrokenPackedMarkdownLinks,
  formatBrokenMarkdownLink,
} from "../tools/packed-markdown-links.mjs";

test("packed Markdown links accept files, directories, anchors, and external URLs", () => {
  const contents = new Map([
    [
      "README.md",
      [
        "[guide](docs/guide.md#setup)",
        "[parentheses](docs/name_(draft).md)",
        "![logo](assets/logo.svg)",
        "[docs directory](docs/)",
        "[license]: <LICENSE>",
        '<a href="https://example.com">remote</a>',
        '<img src="assets/logo.svg">',
        "[section](#section)",
        "`[inline code](missing.md)`",
        "<!-- [comment](missing.md) -->",
        "```md",
        "[fenced code](missing.md)",
        "```",
      ].join("\n"),
    ],
    ["docs/guide.md", "# Setup\n"],
    ["docs/name_(draft).md", "# Draft\n"],
    ["assets/logo.svg", "<svg/>\n"],
    ["LICENSE", "MIT\n"],
  ]);

  assert.deepEqual(
    findBrokenPackedMarkdownLinks({
      files: contents.keys(),
      readFile: (file) => contents.get(file),
    }),
    [],
  );
});

test("packed Markdown links reject omitted, escaping, and malformed targets", () => {
  const sourceCheckout = new Map([
    [
      "README.md",
      [
        "[omitted](docs/repository-only.md)",
        "[escape](../outside.md)",
        "[bad encoding](docs/%ZZ.md)",
      ].join("\n"),
    ],
    [
      "docs/repository-only.md",
      "This exists in the checkout, not the package.\n",
    ],
  ]);

  const failures = findBrokenPackedMarkdownLinks({
    files: ["README.md"],
    readFile: (file) => sourceCheckout.get(file),
  });

  assert.deepEqual(
    failures.map(({ line, target, resolved, reason }) => ({
      line,
      target,
      resolved,
      reason,
    })),
    [
      {
        line: 1,
        target: "docs/repository-only.md",
        resolved: "docs/repository-only.md",
        reason: "is absent from the packed file set",
      },
      {
        line: 2,
        target: "../outside.md",
        resolved: "../outside.md",
        reason: "escapes the package root",
      },
      {
        line: 3,
        target: "docs/%ZZ.md",
        resolved: undefined,
        reason: "contains malformed URL encoding",
      },
    ],
  );
  assert.equal(
    formatBrokenMarkdownLink(failures[0]),
    "README.md:1: docs/repository-only.md (resolves to docs/repository-only.md) is absent from the packed file set",
  );
});

test("installed-directory validation uses the files that actually exist", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "packed-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "[guide](docs/guide.md)\n");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "# Guide\n");

  assert.deepEqual(findBrokenMarkdownLinksInDirectory(root), []);

  fs.rmSync(path.join(root, "docs", "guide.md"));
  assert.deepEqual(
    findBrokenMarkdownLinksInDirectory(root).map(({ resolved }) => resolved),
    ["docs/guide.md"],
  );
});
