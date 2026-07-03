import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
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

  assert.match(
    readme,
    new RegExp(`Node(?:\\.js)? >= ${pkg.engines.node.replace(">=", "")}`),
  );
});

test("package description does not contradict configurable blocking", () => {
  const pkg = readJson("package.json");

  assert.doesNotMatch(pkg.description, /\bnever blocks?\b/i);
  assert.match(pkg.description, /advisory|configurable|hook/i);
});

test("README relative image assets exist and are included in npm package files", () => {
  const pkg = readJson("package.json");
  const readme = readText("README.md");
  const imageMatches = readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);

  for (const [, imagePath] of imageMatches) {
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
