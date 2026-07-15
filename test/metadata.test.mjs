// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KNOWN_PRECOMMIT_CONFIG_KEYS } from "../scripts/lib/config.mjs";
import { DCO_ENFORCEMENT_BASELINE } from "../tools/check-dco-range.mjs";
import { globToRegExp } from "../scripts/lib/files.mjs";
import { run } from "../scripts/lib/process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DCO_POLICY_ADOPTION_BASELINE = "81a9e412bc347f01300df62505ee378284646d15";

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

function markdownTableKeys(markdown, heading) {
  const section = markdown.split(heading)[1]?.split(/\n##\s/)[0] ?? "";
  return [...section.matchAll(/^\|\s*`([a-z][A-Za-z0-9]*)`\s*\|/gm)].map(
    ([, key]) => key,
  );
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
      return globToRegExp(pattern).test(relativePath);
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
  assert.deepEqual(rootPackage.peerDependencies, pkg.peerDependencies);
});

test("package-manager lifecycle CI covers supported OSes and the Node floor", () => {
  const workflow = readText(".github/workflows/ci.yml");
  const job = workflow
    .split(/^ {2}pm-lifecycle:$/m)[1]
    ?.split(/^ {2}ci-success:$/m)[0];
  assert.ok(job, "ci.yml should define the pm-lifecycle job");

  assert.match(job, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(job, /node-version: \["24"\]/);
  for (const manager of ["pnpm", "yarn", "bun"]) {
    assert.match(
      job,
      new RegExp(
        `- pm: ${manager}\\s+os: ubuntu-latest\\s+node-version: "22\\.11\\.0"`,
      ),
    );
  }
  assert.match(job, /npm install --global yarn@1\.22\.22/);
  assert.match(job, /bun-version: "1\.3\.14"/);
});

test("public Bun support stays pinned to the exact CI-tested version", () => {
  for (const file of [
    "README.md",
    "CHANGELOG.md",
    ".github/skills/github-governance/SKILL.md",
    "docs/compatibility.md",
    "docs/faq.md",
    "docs/scenario-coverage.md",
  ]) {
    const contents = readText(file);
    assert.match(contents, /Bun 1\.3\.14/, `${file} should name Bun 1.3.14`);
    assert.doesNotMatch(
      contents,
      /Bun 1\.3(?!\.14)/,
      `${file} should not broaden Bun support beyond CI evidence`,
    );
  }
});

test("the hook contract documents local-only missing-bin behavior", () => {
  const contract = readText("docs/external-interface.md");
  assert.match(contract, /node_modules\/\.bin\/commitment-issues precommit/);
  assert.match(contract, /skip notice to stderr and exit 0/);
  assert.doesNotMatch(contract, /exit silently/);
});

test("bootstrap dependency ranges stay inside the verified Node and tool matrix", () => {
  const pkg = readJson("package.json");
  assert.deepEqual(pkg.peerDependencies, {
    eslint: "^9.0.0 || ^10.0.0",
    prettier: "^3.0.0",
  });
  assert.match(readText("scripts/ci-lifecycle-smoke.mjs"), /"globals@\^17"/);

  for (const file of [
    "README.md",
    "docs/framework-recipes.md",
    "docs/how-it-works.md",
    "docs/migration.md",
    "docs/monorepo.md",
    "docs/yarn-berry.md",
  ]) {
    const contents = readText(file);
    assert.match(contents, /eslint@\^9/);
    assert.match(contents, /prettier@\^3/);
  }
});

test("the published package has no dependency install lifecycle scripts", () => {
  const pkg = readJson("package.json");
  for (const script of ["preinstall", "install", "postinstall", "prepare"]) {
    assert.equal(
      Object.hasOwn(pkg.scripts ?? {}, script),
      false,
      `${script} should not make a dependency install execute package code`,
    );
  }
  assert.equal(pkg.scripts.doctor, "node scripts/doctor.mjs");
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

test("optional commitlint integration adds no package dependency", () => {
  const pkg = readJson("package.json");
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      assert.doesNotMatch(
        name,
        /^(?:@commitlint\/|commitlint$)/,
        `${name} must remain consumer-provided, not a package ${section} entry`,
      );
    }
  }
  assert.equal(isPackaged("scripts/commit-msg.mjs", pkg), true);
});

test("commit-message schema and local-only boundary are documented", () => {
  const docs = readText("docs/configuration.md");
  for (const key of ["commitMessage", "enabled", "blockOnFailure"]) {
    assert.match(docs, new RegExp(`\\b${key}\\b`));
  }
  assert.match(docs, /node_modules\/\.bin\/commitlint/);
  assert.match(
    docs,
    /never falls back to `npx`, a global\s+binary, or the network/,
  );
  assert.match(docs, /does not add commitlint as a dependency/);
  assert.match(docs, /does not.*built-in.*Conventional Commits/is);
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
    "docs/branch-coverage.md",
    ".github/CONTRIBUTING.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/copilot-instructions.md",
    ".github/workflows/ci.yml",
    ".github/skills/authoring-checks/SKILL.md",
    ".github/skills/github-governance/SKILL.md",
    "ADOPTION.md",
  ];

  for (const file of surfaces) {
    assert.ok(
      readText(file).includes(version),
      `${file} should reference the supported Node version ${version} from package.json engines.node`,
    );
  }
});

test("repository metadata uses canonical sponsor and version values", () => {
  const funding = readText(".github/FUNDING.yml");
  const bugReport = readText(".github/ISSUE_TEMPLATE/bug_report.yml");

  assert.match(funding, /^ko_fi:\s+roryglenn\s*$/m);
  assert.doesNotMatch(funding, /^ko_fi:\s+https?:\/\//m);
  assert.match(bugReport, /npx --no-install commitment-issues --version/);
  assert.doesNotMatch(
    bugReport,
    /commitment-issues --help[^\n]*(?:header|version)/i,
  );
});

test("Scorecard SARIF runs only for default-branch events", () => {
  const workflow = readText(".github/workflows/scorecard.yml");

  assert.match(workflow, /^\s*branch_protection_rule:\s*$/m);
  assert.match(workflow, /^\s+branches:\s*\[main\]\s*$/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /github\.event\.pull_request/);
  assert.match(workflow, /^\s+security-events:\s+write(?:\s+#.*)?\s*$/m);
  assert.match(
    workflow,
    /github\/codeql-action\/upload-sarif@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+/,
  );
  assert.match(workflow, /sarif_file:\s+results\.sarif/);
  assert.match(workflow, /^\s+publish_results:\s+true\s*$/m);
});

test("CI enforces 100% runtime coverage on both Node lines and badge freshness", () => {
  const pkg = readJson("package.json");
  const workflow = readText(".github/workflows/ci.yml");
  const coverageRunner = readText("scripts/run-branch-coverage.mjs");
  const readme = readText("README.md");
  const minimumVersion = pkg.engines.node.match(/\d+\.\d+\.\d+/)?.[0];
  assert.ok(minimumVersion, "engines.node should pin a concrete version");
  const escapedMinimumVersion = escapeRegExp(minimumVersion);

  assert.equal(
    pkg.scripts["test:coverage"],
    "node scripts/run-branch-coverage.mjs",
  );
  assert.equal(
    pkg.scripts["coverage:check"],
    "node scripts/update-readme-coverage-badge.mjs --check",
  );
  for (const metric of ["lines", "branches", "functions"]) {
    assert.match(
      coverageRunner,
      new RegExp(
        `--test-coverage-${metric}=\\$\\{RUNTIME_COVERAGE_THRESHOLD\\}`,
      ),
    );
  }
  assert.match(
    workflow,
    new RegExp(
      `100% runtime coverage \\(Node ${escapedMinimumVersion}\\)[\\s\\S]*matrix\\.node-version == '${escapedMinimumVersion}'[\\s\\S]*npm run test:coverage`,
    ),
  );
  assert.match(
    workflow,
    /100% runtime coverage and badge freshness \(Node 24\)[\s\S]*matrix\.node-version == '24'[\s\S]*npm run coverage:check/,
  );
  assert.match(
    workflow,
    /Message-state single-box invariant[\s\S]*matrix\.node-version == '24'[\s\S]*npm run states/,
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

test("all supported precommitChecks keys appear on canonical reference surfaces", () => {
  const expected = [...KNOWN_PRECOMMIT_CONFIG_KEYS].sort();
  const externalInterface = readText("docs/external-interface.md");
  const authoringSection = readText(".github/skills/authoring-checks/SKILL.md")
    .split("The supported keys are grouped by behavior:")[1]
    ?.split("`KNOWN_PRECOMMIT_CONFIG_KEYS`")[0];
  assert.ok(authoringSection, "authoring skill should have a config-key list");

  const documented = new Map([
    [
      "docs/configuration.md",
      markdownTableKeys(
        readText("docs/configuration.md"),
        "## Configuration reference",
      ),
    ],
    [
      ".github/skills/authoring-checks/SKILL.md",
      [...authoringSection.matchAll(/`([a-z][A-Za-z0-9]*)`/g)].map(
        ([, key]) => key,
      ),
    ],
  ]);

  for (const [file, keys] of documented) {
    assert.deepEqual(
      [...new Set(keys)].sort(),
      expected,
      `${file} config keys should exactly match the source allowlist`,
    );
  }

  assert.match(
    externalInterface,
    /\[configuration reference\]\(configuration\.md\)/,
  );
  assert.equal(
    markdownTableKeys(externalInterface, "## Configuration interface").length,
    0,
    "external interface should link to the canonical configuration table instead of duplicating it",
  );
});

test("CI Success includes DCO and both DCO baselines stay documented", () => {
  const ci = readText(".github/workflows/ci.yml");
  const governance = readText("GOVERNANCE.md");
  const roles = readText("docs/project-roles.md");

  assert.match(ci, /needs: \[dco, quality, check, pm-lifecycle, codeql\]/);
  assert.match(ci, /node tools\/check-dco-range\.mjs/);
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /GITHUB_EVENT_NAME.*pull_request/);
  assert.match(ci, /check-dco-range\.mjs --merge-base/);
  assert.doesNotMatch(
    ci,
    /ref:.*github\.event\.pull_request\.head\.sha/,
    "CI should keep the default merge-ref checkout for fork PR history",
  );
  for (const [file, text] of [
    [".github/workflows/ci.yml", ci],
    ["GOVERNANCE.md", governance],
    ["docs/project-roles.md", roles],
  ]) {
    assert.ok(
      text.includes(DCO_ENFORCEMENT_BASELINE),
      `${file} should reference the prospective DCO baseline`,
    );
  }
  assert.ok(
    governance.includes(DCO_POLICY_ADOPTION_BASELINE),
    "governance should preserve the original policy-adoption baseline",
  );
  assert.match(
    governance,
    /issues\/160/,
    "governance should link the operational-baseline exception",
  );
  assert.ok(
    readText("docs/security-review-2026-07.md").includes(
      DCO_POLICY_ADOPTION_BASELINE,
    ),
    "the July security-review evidence snapshot should remain unchanged",
  );
});

test("package files entries exist", () => {
  const pkg = readJson("package.json");
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  for (const entry of pkg.files || []) {
    const exists = /[*?]/.test(entry)
      ? trackedFiles.some((file) => globToRegExp(entry).test(file))
      : fs.existsSync(path.join(root, entry));
    assert.equal(exists, true, `${entry} should exist or match a tracked file`);
  }
});

test("documentation index links every retained Markdown document", () => {
  const index = readText("docs/index.md");
  const markdownFiles = fs
    .readdirSync(path.join(root, "docs"), { recursive: true })
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replaceAll(path.sep, "/"))
    .filter((file) => file !== "index.md");

  for (const file of markdownFiles) {
    assert.match(
      index,
      new RegExp(`\\(${escapeRegExp(file)}(?:#.*?)?\\)`),
      `docs/index.md should intentionally link ${file}`,
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

test("npm package excludes promotional media and stays within its size budget", (t) => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "npm-pack-cache-"));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const result = run(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const [pack] = JSON.parse(result.stdout);
  const files = new Set(pack.files.map((file) => file.path));
  const docs = readText("docs/maintainer-operations.md");
  const readme = readText("README.md");
  const packagedDocs = new Set(
    [...files].filter((file) => file.startsWith("docs/")),
  );
  const expectedDocs = new Set([
    "docs/branch-coverage.md",
    "docs/ci-recipes.md",
    "docs/compatibility.md",
    "docs/configuration.md",
    "docs/external-interface.md",
    "docs/faq.md",
    "docs/framework-recipes.md",
    "docs/how-it-works.md",
    "docs/json-output.md",
    "docs/json-output.schema.json",
    "docs/migration.md",
    "docs/monorepo.md",
    "docs/release-verification.md",
    "docs/why-before-ci.md",
    "docs/yarn-berry.md",
  ]);

  assert.equal(files.has("assets/commitment-issues.png"), false);
  assert.equal(files.has("assets/demo.gif"), false);
  assert.ok(
    [...files].every((file) =>
      file.startsWith("assets/") ? file.endsWith(".svg") : true,
    ),
  );
  assert.ok(files.has("scripts/cli.mjs"));
  assert.deepEqual(packagedDocs, expectedDocs);
  assert.equal(files.has("docs/index.md"), false);
  assert.equal(files.has("docs/maintainer-operations.md"), false);
  assert.equal(files.has("docs/message-states.md"), false);
  assert.equal(files.has("docs/scenario-coverage.md"), false);
  assert.equal(files.has("docs/feature-ideas.md"), false);
  assert.match(
    readme,
    /raw\.githubusercontent\.com\/RoryGlenn\/commitment-issues\/main\/assets\/commitment-issues\.png/,
  );
  assert.match(
    readme,
    /raw\.githubusercontent\.com\/RoryGlenn\/commitment-issues\/main\/assets\/demo\.gif/,
  );
  assert.ok(
    pack.size <= 350 * 1024,
    `packed size ${pack.size} exceeds 350 KiB`,
  );
  assert.ok(
    pack.unpackedSize <= 750 * 1024,
    `unpacked size ${pack.unpackedSize} exceeds 750 KiB`,
  );
  assert.match(docs, /350 KiB compressed/);
  assert.match(docs, /750 KiB\s+unpacked/);
});

test("message-state SVG assets exist and only README examples enter npm", () => {
  const pkg = readJson("package.json");
  const docs = readText("docs/message-states.md");
  const readme = readText("README.md");
  const imagePaths = readmeImagePaths(docs);
  const packagedReadmeAssets = new Set(
    readmeImagePaths(readme).filter((imagePath) =>
      imagePath.startsWith("assets/"),
    ),
  );
  let packagedGalleryAssets = 0;

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
    if (isPackaged(packagePath, pkg)) {
      packagedGalleryAssets += 1;
      assert.equal(
        packagedReadmeAssets.has(packagePath),
        true,
        `${packagePath} should be packaged only when the README uses it`,
      );
    }
  }

  assert.ok(packagedGalleryAssets > 0);
  assert.ok(packagedGalleryAssets < imagePaths.length);
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
    "scripts/commit-msg.mjs",
    "scripts/doctor.mjs",
    "scripts/fix-staged.mjs",
    "scripts/fix-staged-js.mjs",
    "scripts/init.mjs",
    "scripts/precommit.mjs",
    "scripts/prepush.mjs",
    "scripts/uninstall.mjs",
    "scripts/lib/message.mjs",
    "scripts/lib/welcome.mjs",
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
