import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

test("README documents the package engine exactly", () => {
  const pkg = readJson("package.json");
  const readme = readText("README.md");
  const engine = escapeRegExp(pkg.engines.node);

  assert.match(readme, new RegExp(`Node(?:\\.js)?\\s+${engine}`));
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

  assert.match(prose, /## Advisory push tests \(default\)/);
  assert.match(prose, /## Blocking pushes on test failure \(opt-in\)/);
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
    const packagePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");

    assert.equal(fs.existsSync(absolutePath), true, `${imagePath} should exist`);
    assert.equal(
      isPackaged(packagePath, pkg),
      true,
      `${packagePath} should be included by package.json files`,
    );
  }
});
