// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkReleaseAvailability,
  normalizeReleaseVersion,
} from "../tools/release-preflight.mjs";
import {
  hasExactOutputLine,
  hasSuppliedTarballDigest,
  shouldEnforcePosixPackageModes,
} from "../scripts/lib/lifecycle-managers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function runGit(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function npmPackInvocations(source) {
  const executableLines = source
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  return executableLines.match(/\bnpm\b(?:(?!\bnpm\b|#).)*?\bpack\b/gu) ?? [];
}

function availableGit(args) {
  if (args[0] === "show-ref") return { status: 1, stdout: "", stderr: "" };
  return { status: 0, stdout: "", stderr: "" };
}

test("publish workflow verifies canonical mainline before dependency or release work", () => {
  const workflow = readText(".github/workflows/publish.yml");
  const ancestryGate = workflow.indexOf(
    "- name: Verify release commit belongs to reviewed mainline",
  );
  const setupNode = workflow.indexOf("uses: actions/setup-node@");
  const install = workflow.indexOf("- run: npm ci");
  const pack = workflow.indexOf("- name: Pack tarball");
  const publish = workflow.indexOf("- name: Publish to npm");

  assert.match(
    workflow,
    /uses: actions\/checkout@[0-9a-f]+ # v7\s+with:\s+persist-credentials: false\s+fetch-depth: 0/,
    "the tag checkout must fetch complete canonical history without retaining credentials",
  );
  assert.notEqual(ancestryGate, -1);
  assert.match(
    workflow,
    /- name: Verify release commit belongs to reviewed mainline\s+run: node tools\/verify-release-mainline\.mjs/,
    "the workflow must execute the helper covered by the ancestry fixture",
  );
  assert.ok(
    setupNode < ancestryGate &&
      ancestryGate < install &&
      ancestryGate < pack &&
      ancestryGate < publish,
    "mainline authorization must run after Node setup but before dependency installation, packing, or publication",
  );
});

test("release ancestry rule accepts reviewed mainline and rejects an off-main commit", (t) => {
  const repo = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-release-ancestry-"),
  );
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const helper = path.join(root, "tools", "verify-release-mainline.mjs");
  const runHelper = () =>
    spawnSync(process.execPath, [helper], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_REF_NAME: "v-test" },
    });

  for (const args of [
    ["init"],
    ["config", "user.name", "release-integrity-test"],
    ["config", "user.email", "release-integrity@example.com"],
  ]) {
    const result = runGit(repo, args);
    assert.equal(result.status, 0, result.stderr);
  }

  fs.writeFileSync(path.join(repo, "reviewed.txt"), "reviewed\n");
  for (const args of [
    ["add", "reviewed.txt"],
    ["commit", "-m", "reviewed mainline"],
    ["branch", "-M", "main"],
  ]) {
    const result = runGit(repo, args);
    assert.equal(result.status, 0, result.stderr);
  }

  const mainCommit = runGit(repo, ["rev-parse", "HEAD"]).stdout.trim();
  assert.equal(
    runGit(repo, ["update-ref", "refs/remotes/origin/main", mainCommit]).status,
    0,
  );
  const reviewed = runHelper();
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.match(
    reviewed.stdout,
    new RegExp(`Release commit ${mainCommit} belongs to reviewed origin/main`),
  );

  assert.equal(runGit(repo, ["switch", "-c", "off-main"]).status, 0);
  fs.writeFileSync(path.join(repo, "off-main.txt"), "unreviewed\n");
  assert.equal(runGit(repo, ["add", "off-main.txt"]).status, 0);
  assert.equal(
    runGit(repo, ["commit", "-m", "unreviewed release candidate"]).status,
    0,
  );
  const offMainCommit = runGit(repo, ["rev-parse", "HEAD"]).stdout.trim();
  const unreviewed = runHelper();
  assert.equal(unreviewed.status, 1, unreviewed.stderr);
  assert.match(unreviewed.stderr, /::error::Tag v-test points to/);
  assert.match(
    unreviewed.stderr,
    new RegExp(`${offMainCommit}[^\n]*not reachable from origin/main`),
  );
});

test("publish workflow gates and publishes one immutable release", () => {
  const workflow = readText(".github/workflows/publish.yml");
  const publishJob = workflow.slice(
    workflow.indexOf("\n  publish:"),
    workflow.indexOf("\n  provenance:"),
  );
  const provenanceJob = workflow.slice(
    workflow.indexOf("\n  provenance:"),
    workflow.indexOf("\n  publish-release:"),
  );
  const testStep = workflow.indexOf("- run: npm test");
  const lifecycleGate = workflow.indexOf(
    "- name: Verify exact npm package lifecycle",
  );
  const packStep = workflow.indexOf("- name: Pack tarball");
  const recoveryGate = workflow.indexOf(
    "- name: Classify release recovery state",
  );
  const publishStep = workflow.indexOf("- name: Publish to npm");
  const provenanceDownload = workflow.indexOf(
    "- name: Download provenance artifact",
  );
  const provenanceVerification = workflow.indexOf(
    "- name: Cryptographically verify signed provenance",
  );
  const finalRecoveryGate = workflow.indexOf(
    "- name: Revalidate release draft and assets",
  );
  const releaseStep = workflow.indexOf(
    "- name: Publish immutable release with all assets",
  );

  assert.notEqual(lifecycleGate, -1);
  assert.notEqual(packStep, -1);
  assert.notEqual(recoveryGate, -1);
  assert.notEqual(publishStep, -1);
  assert.match(
    publishJob,
    /runs-on: ubuntu-latest/,
    "the release artifact must remain on a POSIX producer that enforces packed modes",
  );
  assert.ok(
    testStep < packStep &&
      packStep < lifecycleGate &&
      lifecycleGate < recoveryGate &&
      recoveryGate < publishStep,
    "the release tarball must be packed once, lifecycle-tested, classified, and then conditionally published",
  );
  assert.equal(
    npmPackInvocations(publishJob).length,
    1,
    "the publish job must contain only one npm pack command, regardless of its flags",
  );
  assert.equal(
    npmPackInvocations(`${publishJob}\nrun: npm --silent pack`).length,
    2,
    "the assertion must recognize npm global options before the pack command",
  );
  assert.equal(
    npmPackInvocations(`${publishJob}\nrun: npm --workspace demo pack`).length,
    2,
    "the assertion must recognize npm options with values before the pack command",
  );
  assert.equal(workflow.match(/- name: Pack tarball/gu)?.length ?? 0, 1);
  assert.match(
    workflow,
    /name: Verify exact npm package lifecycle[\s\S]*?env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: npm run test:lifecycle:npm -- --tarball "\$TARBALL"/,
  );

  assert.match(
    workflow,
    /name: Publish to npm\s+if: steps\.recovery\.outputs\.publish_npm == 'true'\s+env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: npm publish "\.\/\$TARBALL" --access public/,
  );
  assert.match(
    workflow,
    /pull_request:\s+paths:\s+- "\.github\/workflows\/publish\.yml"\s+- "tools\/release-recovery\.mjs"\s+- "tools\/verify-release-mainline\.mjs"/,
  );
  assert.match(
    workflow,
    /validate:[\s\S]*?if: github\.event_name == 'pull_request'[\s\S]*?Confirm release workflow validation/,
  );
  assert.match(
    workflow,
    /publish:[\s\S]*?if: github\.event_name == 'push'/,
    "publishing must remain disabled during pull-request validation",
  );
  assert.match(
    workflow,
    /name: Generate provenance subject[\s\S]*?TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}[\s\S]*?sha256sum "\$TARBALL"/,
  );
  assert.match(
    publishJob,
    /outputs:[\s\S]*?release_needed: \$\{\{ steps\.confirm_recovery\.outputs\.release_needed \}\}/,
  );
  assert.match(
    publishJob,
    /name: Classify release recovery state\s+id: recovery[\s\S]*?run: node tools\/release-recovery\.mjs/,
  );
  assert.match(
    publishJob,
    /name: Upload tarball artifact\s+if: steps\.recovery\.outputs\.release_needed == 'true'[\s\S]*?overwrite: true/,
    "an exact full rerun may replace only its ephemeral Actions artifact",
  );
  assert.match(workflow, /path:\s+\$\{\{ steps\.pack\.outputs\.tarball \}\}/);
  assert.match(workflow, /upload-assets:\s+false/);
  assert.doesNotMatch(workflow, /upload-assets:\s+true/);
  assert.doesNotMatch(workflow, /upload-tag-name:/);
  assert.match(
    provenanceJob,
    /if: needs\.publish\.outputs\.release_needed == 'true'[\s\S]*?contents:\s+write/,
    "GitHub requires the caller to grant the reusable SLSA workflow's declared permission even when its upload job is skipped",
  );
  assert.match(workflow, /needs:\s+\[publish, provenance\]/);
  assert.match(
    workflow,
    /publish-release:[\s\S]*?if: needs\.publish\.outputs\.release_needed == 'true'/,
  );
  assert.match(
    workflow,
    /name:\s+\$\{\{ needs\.provenance\.outputs\.provenance-name \}\}/,
  );
  assert.match(workflow, /draft:\s+false/);
  assert.match(workflow, /overwrite_files:\s+false/);
  assert.match(
    workflow,
    /name: Revalidate release draft and assets\s+id: final_recovery[\s\S]*?--provenance release-assets\/\*\.intoto\.jsonl[\s\S]*?name: Publish immutable release with all assets\s+if: steps\.final_recovery\.outputs\.state != 'complete'/,
  );
  assert.match(
    workflow,
    /slsa-framework\/slsa-verifier\/actions\/installer@[0-9a-f]{40} # v2\.7\.1/,
  );
  assert.match(
    workflow,
    /name: Cryptographically verify signed provenance[\s\S]*?slsa-verifier verify-artifact release-assets\/\*\.tgz[\s\S]*?--source-uri github\.com\/RoryGlenn\/commitment-issues[\s\S]*?--source-tag "\$RELEASE_TAG"/,
  );
  assert.match(workflow, /release-assets\/\*\.tgz/);
  assert.match(workflow, /release-assets\/\*\.intoto\.jsonl/);
  assert.equal(
    workflow.match(/softprops\/action-gh-release/g)?.length,
    1,
    "one action must upload every asset before the release is finalized",
  );
  assert.match(
    workflow,
    /softprops\/action-gh-release@[0-9a-f]+ # v3\./,
    "the only release uploader must use the Node 24 action line",
  );
  assert.ok(
    publishStep < provenanceDownload &&
      provenanceDownload < provenanceVerification &&
      provenanceVerification < finalRecoveryGate &&
      finalRecoveryGate < releaseStep,
    "npm publication, provenance generation, cryptographic verification, and final state classification must finish before one release action uploads both assets",
  );
  assert.doesNotMatch(
    workflow,
    /npm (?:unpublish|deprecate|dist-tag)|git tag -[df]|gh release delete/,
    "automated recovery must not mutate public identifiers or registry policy",
  );
});

test("required npm CI lifecycle lanes consume an explicitly prebuilt tarball", () => {
  const workflow = readText(".github/workflows/ci.yml");
  const checkJob = workflow.slice(
    workflow.indexOf("\n  check:"),
    workflow.indexOf("\n  pm-lifecycle:"),
  );
  const wrapper = readText("tools/run-prebuilt-lifecycle-test.mjs");
  const wrapperHash = wrapper.indexOf(
    "const expectedTarballHash = sha256(tarball)",
  );
  const wrapperLifecycle = wrapper.indexOf(
    "const lifecycle = run(process.execPath",
  );

  assert.match(
    checkJob,
    /- name: Prebuilt package lifecycle integration \(separate from runtime coverage\)\s+run: node tools\/run-prebuilt-lifecycle-test\.mjs/,
  );
  assert.equal(
    wrapper.match(/\brun\(\s*"npm"\s*,\s*\[\s*"pack"\s*,/gu)?.length ?? 0,
    1,
    "the hosted-CI wrapper must create its prebuilt tarball exactly once",
  );
  assert.match(
    wrapper,
    /run\(process\.execPath, \[\s*"scripts\/run-lifecycle-test\.mjs",\s*"npm",\s*"--tarball",\s*tarball,/,
  );
  assert.match(wrapper, /const expectedTarballHash = sha256\(tarball\)/);
  assert.match(
    wrapper,
    /hasSuppliedTarballDigest\(lifecycle\.stdout, expectedTarballHash\)/,
    "the wrapper should confirm supplied bytes without matching a platform-rendered path",
  );
  assert.ok(
    wrapperHash !== -1 &&
      wrapperLifecycle !== -1 &&
      wrapperHash < wrapperLifecycle,
    "the wrapper must hash its tarball before launching the lifecycle",
  );
  assert.doesNotMatch(
    wrapper,
    /includes\(`\[lifecycle smoke\] supplied tarball: \$\{tarball\}`\)/,
    "TAP escapes Windows path separators differently across Node versions",
  );
});

test("manual exact-tarball publishing tests the artifact it publishes", () => {
  const guide = readText(".github/skills/release-and-publish/SKILL.md");
  const lifecycleGate = guide.indexOf(
    'npm run test:lifecycle:npm -- --tarball "$tarball"',
  );
  const packCommand = guide.indexOf(
    'tarball="$(npm pack --silent | tail -n1)"',
  );
  const publishCommand = guide.indexOf('npm publish "./$tarball"');

  assert.match(
    guide,
    /Publishing a tarball does not run this root package's `prepublishOnly`/,
  );
  assert.notEqual(lifecycleGate, -1);
  assert.notEqual(packCommand, -1);
  assert.notEqual(publishCommand, -1);
  assert.ok(
    packCommand < lifecycleGate && lifecycleGate < publishCommand,
    "manual publication must lifecycle-test the exact tarball it publishes",
  );
});

test("lifecycle runners validate and forward an explicit tarball without a shell", () => {
  const runner = readText("scripts/run-lifecycle-test.mjs");
  const integration = readText("test/integration/lifecycle-manager.test.mjs");
  const smoke = readText("scripts/ci-lifecycle-smoke.mjs");
  const packedModes = smoke.slice(
    smoke.indexOf("function assertPackedModes"),
    smoke.indexOf("function inspectPackedTarball"),
  );
  const installedCli = smoke.slice(
    smoke.indexOf("function assertInstalledCli"),
    smoke.indexOf("function assertFileContains"),
  );
  const digestMarker = smoke.slice(
    smoke.indexOf("const initialTarballHash"),
    smoke.indexOf("const packedMetadata"),
  );

  assert.match(runner, /--tarball/);
  assert.match(runner, /COMMITMENT_ISSUES_LIFECYCLE_TARBALL/);
  assert.match(runner, /delete childEnv\.COMMITMENT_ISSUES_LIFECYCLE_TARBALL/);
  assert.match(integration, /COMMITMENT_ISSUES_LIFECYCLE_TARBALL/);
  assert.match(integration, /smokeArgs\.push\("--tarball", tarball\)/);
  assert.match(
    integration,
    /delete smokeEnv\.COMMITMENT_ISSUES_LIFECYCLE_TARBALL/,
  );
  assert.match(smoke, /--tarball/);
  assert.match(smoke, /lstatSync\(resolved\)\.isFile\(\)/);
  assert.match(
    packedModes,
    /if \(!shouldEnforcePosixPackageModes\(\)\) \{[\s\S]*?return;[\s\S]*?cli\?\.mode === 0o755[\s\S]*?file\.mode !== 0o644/,
    "only POSIX producers should enforce tarball mode metadata",
  );
  assert.match(installedCli, /startsWith\("#!\/usr\/bin\/env node\\n"\)/);
  assert.match(installedCli, /execBin\(\["--version"\]\)/);
  assert.match(
    installedCli,
    /hasExactOutputLine\(versionOutput, packedMetadata\.version\)/,
  );
  assert.doesNotMatch(
    installedCli,
    /shouldEnforcePosixPackageModes/,
    "bin, shebang, and version checks must remain unconditional on Windows",
  );
  assert.match(smoke, /delete env\.COMMITMENT_ISSUES_LIFECYCLE_TARBALL/);
  assert.match(
    digestMarker,
    /if \(suppliedTarball\) \{[\s\S]*?SUPPLIED_TARBALL_DIGEST_PREFIX[\s\S]*?initialTarballHash/,
    "only a supplied artifact should emit its initial digest handshake",
  );
  assert.match(
    smoke,
    /let tarball = suppliedTarball;\s+if \(tarball\) \{[\s\S]*?supplied tarball:[\s\S]*?\} else \{[\s\S]*?run\("npm", \["pack", "--pack-destination", packDir\], root\)/,
    "a supplied tarball must bypass the branch that creates a disposable package",
  );
  assert.doesNotMatch(
    `${runner}\n${integration}\n${smoke}`,
    /(?:execSync|spawnSync)\([^\n]*\$\{/,
    "tarball paths must cross process boundaries as argv, never shell text",
  );
});

test("lifecycle artifact helpers preserve exact output and platform boundaries", () => {
  assert.equal(
    hasExactOutputLine(
      "yarn run v1.22.22\r\n$ commitment-issues --version\r\n3.3.2\r\nDone in 0.06s.",
      "3.3.2",
    ),
    true,
  );
  assert.equal(
    hasExactOutputLine("commitment-issues@3.3.2\n13.3.20", "3.3.2"),
    false,
    "version wrappers and near matches must not impersonate exact CLI output",
  );
  assert.equal(shouldEnforcePosixPackageModes("linux"), true);
  assert.equal(shouldEnforcePosixPackageModes("darwin"), true);
  assert.equal(shouldEnforcePosixPackageModes("win32"), false);

  const digest = "0123456789abcdef".repeat(4);
  const marker = `[lifecycle smoke] supplied tarball sha256: ${digest}`;
  assert.equal(
    hasSuppliedTarballDigest(
      `# [lifecycle smoke] supplied tarball: C:\\\\Temp\\\\package.tgz\r\n# ${marker}\r\n`,
      digest,
    ),
    true,
    "TAP prefixes and escaped Windows diagnostic paths must not affect byte identity",
  );
  assert.equal(
    hasSuppliedTarballDigest(`# ${marker}0\n`, digest),
    false,
    "a digest suffix must not be accepted as an exact marker",
  );
  assert.equal(
    hasSuppliedTarballDigest(`# ${marker}\n`, `${digest.slice(0, -1)}0`),
    false,
    "the marker must contain the expected digest",
  );
});

test("lifecycle launcher rejects malformed tarball arguments before integration", (t) => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "commitment-issues-lifecycle-args-"),
  );
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const fakeTarball = path.join(fixture, "fixture.tgz");
  const wrongExtension = path.join(fixture, "fixture.tar");
  const directory = path.join(fixture, "directory.tgz");
  fs.writeFileSync(fakeTarball, "not needed for argument validation");
  fs.writeFileSync(wrongExtension, "not a tgz");
  fs.mkdirSync(directory);

  const cases = [
    { args: ["npm", "--unknown"], expected: /Unknown lifecycle option/ },
    {
      args: ["npm", "--tarball"],
      expected: /--tarball requires a path/,
    },
    {
      args: ["npm", "--tarball", path.join(fixture, "missing.tgz")],
      expected: /does not exist/,
    },
    {
      args: ["npm", "--tarball", wrongExtension],
      expected: /must use the \.tgz extension/,
    },
    {
      args: ["npm", "--tarball", directory],
      expected: /is not a regular file/,
    },
    {
      args: ["npm", "--tarball", fakeTarball, "--tarball", fakeTarball],
      expected: /may be provided only once/,
    },
  ];

  for (const { args, expected } of cases) {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-lifecycle-test.mjs", ...args],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, expected);
  }
});

test("release verification uses supported npm provenance surfaces", () => {
  const docs = readText("docs/release-verification.md");

  assert.match(docs, /npm audit signatures/);
  assert.match(docs, /dist\.integrity dist\.signatures/);
  assert.doesNotMatch(docs, /npm view[^\n]*\bprovenance\b/);
  assert.match(docs, /must never be moved or reused/);
  assert.match(docs, /git merge-base --is-ancestor/);
  assert.match(docs, /tag rules must separately restrict `v\*` creation/);
});

test("release preflight accepts a completely unused exact version", async () => {
  const requests = [];
  const result = await checkReleaseAvailability("3.2.1", {
    runGit: availableGit,
    request: async (url) => {
      requests.push(url);
      return { status: 404 };
    },
  });

  assert.deepEqual(result, { version: "3.2.1", tag: "v3.2.1" });
  assert.equal(requests.length, 2);
});

test("release preflight reports every existing public identifier", async () => {
  const runGit = (args) => {
    if (args[0] === "show-ref") return { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "sha refs/tags/v3.2.1\n", stderr: "" };
  };

  await assert.rejects(
    checkReleaseAvailability("v3.2.1", {
      runGit,
      request: async () => ({ status: 200 }),
    }),
    (error) => {
      assert.match(error.message, /local Git tag v3\.2\.1/);
      assert.match(error.message, /remote Git tag v3\.2\.1/);
      assert.match(error.message, /GitHub Release v3\.2\.1/);
      assert.match(error.message, /npm commitment-issues@3\.2\.1/);
      return true;
    },
  );
});

test("release preflight fails closed when a registry cannot be checked", async () => {
  await assert.rejects(
    checkReleaseAvailability("3.2.1", {
      runGit: availableGit,
      request: async () => ({ status: 503 }),
    }),
    /check failed with HTTP 503/,
  );
});

test("release preflight requires an exact semantic version", () => {
  assert.equal(normalizeReleaseVersion("v3.2.1"), "3.2.1");
  for (const invalid of ["", "next", "3.2", "03.2.1", "3.2.1.0", "3.2.1-01"]) {
    assert.throws(() => normalizeReleaseVersion(invalid), /semantic version/);
  }
});
