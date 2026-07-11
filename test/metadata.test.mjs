// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownProse(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .split(/\r?\n/)
        .map(() => "")
        .join("\n"),
    )
    .replace(/`([^`\n]+)`/g, "$1");
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function packageFilePatterns(pkg) {
  return new Set(pkg.files || []);
}

function isPackaged(relativePath, pkg) {
  const patterns = packageFilePatterns(pkg);
  return (
    patterns.has(relativePath) ||
    [...patterns].some((pattern) => {
      if (pattern.endsWith("/")) {
        return relativePath.startsWith(pattern);
      }
      return false;
    })
  );
}

function readmeImagePaths(readme) {
  const markdownImages = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
    ([, imagePath]) => imagePath,
  );
  const htmlImages = [
    ...readme.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map(([, imagePath]) => imagePath);
  return [...markdownImages, ...htmlImages];
}

test("package-lock root metadata stays in sync with package.json", () => {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const rootPackage = lock.packages[""];

  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(rootPackage.name, pkg.name);
  assert.equal(rootPackage.version, pkg.version);
  assert.deepEqual(rootPackage.bin, pkg.bin);
  assert.deepEqual(rootPackage.engines, pkg.engines);
  assert.deepEqual(rootPackage.dependencies, pkg.dependencies);
  assert.deepEqual(rootPackage.devDependencies, pkg.devDependencies);
});

test("husky and lint-staged stay out of the dependency tree", () => {
  const pkg = readJson("package.json");
  // v3 owns the hook wiring (.git/hooks) and the staged-fix pipeline
  // directly; reintroducing either package would be an architectural
  // regression, not a routine dependency add.
  for (const banned of ["husky", "lint-staged"]) {
    assert.equal(banned in (pkg.dependencies ?? {}), false);
    assert.equal(banned in (pkg.devDependencies ?? {}), false);
    assert.equal(banned in (pkg.peerDependencies ?? {}), false);
  }
});

test("bin entries are tracked with the executable bit", () => {
  const pkg = readJson("package.json");
  // npm's fix-bin chmods bins for registry installs, but git clones and
  // `file:` self-links (this repo's own hooks) use the tracked mode as-is.
  // Without 100755 the generated hooks silently self-neutralize.
  for (const binPath of Object.values(pkg.bin ?? {})) {
    const output = execFileSync("git", ["ls-files", "-s", "--", binPath], {
      cwd: root,
      encoding: "utf8",
    });
    const mode = output.trim().split(/\s+/)[0];
    assert.equal(mode, "100755", `${binPath} must be tracked as 100755`);
  }
});

test("README documents the package engine exactly", () => {
  const pkg = readJson("package.json");
  const readme = readText("README.md");
  const engine = escapeRegExp(pkg.engines.node);

  assert.match(readme, new RegExp(`Node(?:\\.js)?\\s+${engine}`));
});

test("supported Node version stays consistent across docs and workflows", () => {
  const pkg = readJson("package.json");
  const version = pkg.engines.node.match(/\d+\.\d+\.\d+/)?.[0];
  assert.ok(version, "engines.node should pin a concrete version");

  // Every surface that states the supported Node version should track
  // package.json engines.node, so a Node bump cannot silently leave one behind.
  const surfaces = [
    "README.md",
    "docs/faq.md",
    "docs/configuration.md",
    ".github/CONTRIBUTING.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/workflows/ci.yml",
    "ADOPTION.md",
  ];

  for (const file of surfaces) {
    assert.ok(
      readText(file).includes(version),
      `${file} should reference the supported Node version ${version} from package.json engines.node`,
    );
  }
});

test("CI enforces branch coverage on both Node lines and badge freshness", () => {
  const pkg = readJson("package.json");
  const workflow = readText(".github/workflows/ci.yml");
  const readme = readText("README.md");

  assert.equal(
    pkg.scripts["test:coverage"],
    "node scripts/run-branch-coverage.mjs",
  );
  assert.equal(
    pkg.scripts["coverage:check"],
    "node scripts/update-readme-coverage-badge.mjs --check",
  );
  assert.match(
    workflow,
    /Branch coverage threshold \(Node 22\.22\.1\)[\s\S]*matrix\.node-version == '22\.22\.1'[\s\S]*npm run test:coverage/,
  );
  assert.match(
    workflow,
    /Branch coverage threshold and badge freshness \(Node 24\)[\s\S]*matrix\.node-version == '24'[\s\S]*npm run coverage:check/,
  );
  assert.match(readme, /\[!\[Branch coverage: [0-9.]+%\]/);
  assert.match(readme, /docs\/branch-coverage\.md/);
});

test("package description does not contradict configurable blocking", () => {
  const pkg = readJson("package.json");

  assert.doesNotMatch(pkg.description, /\bnever blocks?\b/i);
  assert.match(pkg.description, /advisory|configurable|enforcement|hook/i);
});

test("README does not make unconditional non-blocking claims", () => {
  const prose = markdownProse(readText("README.md"));
  const bannedClaims = [
    {
      pattern: /\bnever blocks?\b/i,
      message:
        "Avoid claiming the tool never blocks; push blocking is configurable.",
    },
    {
      pattern: /\b(?:cannot|can't) block\b/i,
      message:
        "Avoid claiming the tool cannot block; push blocking is configurable.",
    },
    {
      pattern: /\balways (?:allows?|continues?|passes?)\b/i,
      message: "Avoid claiming checks always allow work to continue.",
    },
  ];

  for (const { pattern, message } of bannedClaims) {
    const match = pattern.exec(prose);
    assert.equal(
      match,
      null,
      match
        ? `${message} README.md:${lineNumberAt(prose, match.index)}`
        : message,
    );
  }
});

test("README documents both advisory and blocking push modes", () => {
  const prose = markdownProse(readText("README.md"));

  assert.match(prose, /## From advisory to enforced/);
  assert.match(prose, /Runs related pushed-file tests in advisory mode/);
  assert.match(prose, /Enable blockPushOnTestFailure/);
  assert.match(
    prose,
    /blockPushOnTestFailure and advisePushTests are both set/i,
  );
});

test("package files entries exist", () => {
  const pkg = readJson("package.json");

  for (const entry of pkg.files || []) {
    assert.equal(
      fs.existsSync(path.join(root, entry)),
      true,
      `${entry} should exist`,
    );
  }
});

test("README relative image assets exist and are included in npm package files", () => {
  const pkg = readJson("package.json");
  const readme = readText("README.md");
  const imagePaths = readmeImagePaths(readme);

  for (const imagePath of imagePaths) {
    if (/^(https?:)?\/\//.test(imagePath) || imagePath.startsWith("#")) {
      continue;
    }

    assert.equal(
      fs.existsSync(path.join(root, imagePath)),
      true,
      `${imagePath} should exist`,
    );

    assert.equal(
      isPackaged(imagePath, pkg),
      true,
      `${imagePath} should be included by package.json files`,
    );
  }
});

test("message-state SVG assets exist and are included in npm package files", () => {
  const pkg = readJson("package.json");
  const docs = readText("docs/message-states.md");
  const imagePaths = readmeImagePaths(docs);

  assert.ok(imagePaths.length >= 15, "message states should have SVG examples");

  for (const imagePath of imagePaths) {
    const absolutePath = path.resolve(root, "docs", imagePath);
    const packagePath = path
      .relative(root, absolutePath)
      .replaceAll(path.sep, "/");

    assert.equal(
      fs.existsSync(absolutePath),
      true,
      `${imagePath} should exist`,
    );
    assert.equal(
      isPackaged(packagePath, pkg),
      true,
      `${packagePath} should be included by package.json files`,
    );
  }
});

test("every terminal box title appears in the message-states gallery", () => {
  const docs = readText("docs/message-states.md");
  const svgText = readmeImagePaths(docs)
    .map((imagePath) => readText(path.join("docs", imagePath)))
    .join("\n");
  const haystack = `${docs}\n${svgText}`;

  // User-facing entry scripts plus the advisory-message builder. The
  // maintainer-only scripts (ci-lifecycle-smoke, update-readme-coverage-badge)
  // are deliberately outside the documented gallery.
  const sources = [
    "scripts/cli.mjs",
    "scripts/commit-fix.mjs",
    "scripts/doctor.mjs",
    "scripts/fix-staged.mjs",
    "scripts/fix-staged-js.mjs",
    "scripts/init.mjs",
    "scripts/precommit.mjs",
    "scripts/prepush.mjs",
    "scripts/uninstall.mjs",
    "scripts/lib/message.mjs",
  ];

  // Defensive boxes marked unreachable in practice (node:coverage-disabled)
  // stay undocumented on purpose.
  const exemptTitles = new Set(["Could not locate the git hooks directory."]);

  // Box titles are double-quoted pc.bold literals; inline emphasis uses
  // single quotes or dynamic values, so it is not captured here.
  const titles = new Set();
  for (const source of sources) {
    const text = readText(source);
    for (const [, title] of text.matchAll(/pc\.bold\(\s*"([^"]+)"/g)) {
      if (!exemptTitles.has(title)) {
        titles.add(title);
      }
    }
  }

  assert.ok(
    titles.size >= 40,
    `box-title extraction should find the catalog (found ${titles.size})`,
  );

  for (const title of titles) {
    assert.ok(
      haystack.includes(title),
      `box title "${title}" should appear in docs/message-states.md or a referenced SVG — document new message states in the gallery`,
    );
  }
});
