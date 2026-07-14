// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flowchartPaths = [
  "assets/project-flowchart-light.svg",
  "assets/project-flowchart-dark.svg",
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function semanticText(svg) {
  return [...svg.matchAll(/<(title|desc|text)\b[^>]*>([^<]*)<\/\1>/g)].map(
    ([, tag, content]) => `${tag}:${content.trim()}`,
  );
}

function elementCounts(svg) {
  return Object.fromEntries(
    [
      "svg",
      "title",
      "desc",
      "defs",
      "style",
      "g",
      "rect",
      "circle",
      "path",
      "text",
    ].map((tag) => [
      tag,
      [...svg.matchAll(new RegExp(`<${tag}\\b`, "g"))].length,
    ]),
  );
}

test("message-state SVG generator exactly reproduces its committed assets", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "message-state-assets-"),
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tempDir, "tools"));
  fs.mkdirSync(path.join(tempDir, "assets"));
  fs.copyFileSync(
    path.join(root, "tools", "gen-message-state-svgs.mjs"),
    path.join(tempDir, "tools", "gen-message-state-svgs.mjs"),
  );

  const result = spawnSync(
    process.execPath,
    ["tools/gen-message-state-svgs.mjs"],
    { cwd: tempDir, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);

  const generated = fs.readdirSync(path.join(tempDir, "assets")).sort();
  const gallery = read("docs/message-states.md");
  assert.equal(generated.length, 64);
  for (const file of generated) {
    assert.ok(
      gallery.includes(`../assets/${file}`),
      `${file} should be referenced by the message-state gallery`,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(tempDir, "assets", file)),
      fs.readFileSync(path.join(root, "assets", file)),
      `${file} should be regenerated before its source definition is committed`,
    );
  }
});

test("flowchart themes remain accessible and semantically equivalent", () => {
  const [light, dark] = flowchartPaths.map(read);

  for (const [index, svg] of [light, dark].entries()) {
    assert.match(svg, /^<svg\b[^>]*\bwidth="1024"[^>]*\bheight="848"/);
    assert.match(svg, /\bviewBox="0 0 1024 848"/);
    assert.match(svg, /<rect width="1024" height="848" fill="url\(#bg\)"\/>/);
    assert.match(svg, /\brole="img"/);
    assert.match(svg, /\baria-labelledby="title desc"/);
    assert.match(svg, /<title id="title">[^<]+<\/title>/);
    assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.doesNotMatch(svg, /<script\b/i);
    assert.ok(
      semanticText(svg).length > 30,
      `${flowchartPaths[index]} should expose its labels as text`,
    );
  }

  assert.deepEqual(semanticText(light), semanticText(dark));
  assert.deepEqual(elementCounts(light), elementCounts(dark));
});

test("flowcharts cover code checks and every major guard category", () => {
  const requiredLabels = [
    "Code checks",
    "lint • format • tests",
    "Guard checks",
    "branch • upstream • secrets",
    "commit shape • large/generated files",
  ];

  for (const relativePath of flowchartPaths) {
    const svg = read(relativePath);
    for (const label of requiredLabels) {
      assert.ok(svg.includes(label), `${relativePath} should include ${label}`);
    }
  }
});

test("README and how-it-works reference both refreshed flowchart themes", () => {
  const readme = read("README.md");
  const guide = read("docs/how-it-works.md");

  for (const [document, prefix] of [
    [readme, "assets/"],
    [guide, "../assets/"],
  ]) {
    assert.ok(document.includes(`${prefix}project-flowchart-light.svg`));
    assert.ok(document.includes(`${prefix}project-flowchart-dark.svg`));
    assert.match(document, /code and guard checks before commit/i);
  }
});

test("demo tape records a reproducible feature-branch workflow", () => {
  const tape = read("promo/demo.tape");
  const workflow = read(".github/workflows/render-demo.yml");
  const comparator = read("tools/compare-demo-gifs.mjs");
  const initIndex = tape.indexOf("npx --no-install commitment-issues init");
  const welcomeOptOutIndex = tape.indexOf(
    "npm pkg set precommitChecks.showWelcomeOnFirstCommit=false --json",
  );
  const switchIndex = tape.indexOf("git switch -q -c feature/greeting");
  const visibleCommitIndex = tape.indexOf(
    "git commit -q -am 'print hello world'",
  );
  const fixIndex = tape.indexOf("npm run commit:fix");
  const pushIndex = tape.indexOf('Type "git push -q"', fixIndex);
  const resetIndex = tape.indexOf('Type "clear" Enter', fixIndex);
  const resetPromptIndex = tape.indexOf(
    "Wait+Line@30s /git:\\(feature.greeting\\) *$/",
    resetIndex,
  );
  const renderIndex = workflow.indexOf("run: vhs promo/demo.tape");
  const metadataIndex = workflow.indexOf(
    "name: Verify rendered demo dimensions and timing",
  );
  const verifyIndex = workflow.indexOf(
    "name: Verify rendered demo matches committed visuals",
  );
  const uploadIndex = workflow.indexOf("name: Upload rendered demo");

  assert.match(tape, /^Output assets\/demo\.gif$/m);
  assert.match(tape, /npm pack "\$REPO" --ignore-scripts/);
  assert.match(tape, /npm install -D "\$PACKAGE_DIR\/\$PACKAGE_TGZ"/);
  assert.match(tape, /--ignore-scripts --prefer-offline/);
  assert.doesNotMatch(tape, /ln -s "\$REPO\/node_modules" node_modules/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /node-version: "24\.14\.0"/);
  for (const input of [
    ".github/workflows/render-demo.yml",
    "assets/demo.gif",
    "promo/demo.tape",
    "package.json",
    "package-lock.json",
    "scripts/**",
    "test/demo-visual-comparison.test.mjs",
    "tools/compare-demo-gifs.mjs",
  ]) {
    assert.ok(
      workflow.includes(`- "${input}"`),
      `render workflow should run when ${input} changes`,
    );
  }
  assert.ok(renderIndex >= 0, "workflow should render the demo");
  assert.match(
    workflow,
    /cp assets\/demo\.gif "\$RUNNER_TEMP\/committed-demo\.gif"/,
  );
  assert.match(workflow, /MINIMUM_SSIM: "0\.997"/);
  assert.match(workflow, /MAX_TEMPORAL_SHIFT_FRAMES: "2"/);
  assert.match(workflow, /node --test test\/demo-visual-comparison\.test\.mjs/);
  assert.match(
    workflow,
    /node tools\/compare-demo-gifs\.mjs\s+"\$RUNNER_TEMP\/committed-demo\.gif"\s+assets\/demo\.gif/,
  );
  assert.match(comparator, /\[committed\]\[rendered\]ssim/);
  for (const region of [
    "formatter duration",
    "amended commit abbreviation",
    "test-case duration",
    "test-suite duration",
  ]) {
    assert.ok(
      comparator.includes(`name: "${region}"`),
      `demo comparator should normalize ${region}`,
    );
  }
  assert.match(workflow, /MAX_FRAME_COUNT_DRIFT: "2"/);
  assert.match(workflow, /MAX_DURATION_DRIFT_SECONDS: "0\.10"/);
  assert.match(workflow, /execFileSync\(\s*"ffprobe"/);
  assert.match(workflow, /"-count_frames"/);
  assert.match(
    workflow,
    /stream=width,height,nb_read_frames,duration:format=duration/,
  );
  assert.match(workflow, /rendered\.width !== committed\.width/);
  assert.match(workflow, /rendered\.height !== committed\.height/);
  assert.match(workflow, /frameDrift > frameTolerance/);
  assert.match(workflow, /durationDrift > tolerance/);
  assert.ok(
    verifyIndex > renderIndex,
    "workflow should compare the rendered GIF after rendering it",
  );
  assert.ok(
    metadataIndex > uploadIndex,
    "workflow should preserve the rendered artifact before metadata checks",
  );
  assert.ok(
    verifyIndex > metadataIndex,
    "workflow should reject metadata drift before evaluating SSIM",
  );
  assert.ok(
    uploadIndex > renderIndex,
    "workflow should upload only after rendering the demo",
  );
  assert.ok(
    verifyIndex > uploadIndex,
    "workflow should preserve a mismatched render artifact before failing",
  );
  assert.match(tape, /Set FontFamily "DejaVu Sans Mono"/);
  assert.match(tape, /Set CursorBlink false/);
  assert.match(tape, /Set TypingSpeed 1ms/);
  assert.match(tape, /Set TypingSpeed 100ms/);
  assert.match(tape, /NPM_CONFIG_UPDATE_NOTIFIER=false/);
  assert.match(tape, /npx --no-install commitment-issues init/);
  assert.match(tape, /npm pkg set precommitChecks\.hookOutput=normal/);
  assert.match(
    tape,
    /npm pkg set precommitChecks\.showWelcomeOnFirstCommit=false --json/,
  );
  for (const hiddenExecution of [
    'Type "npx --no-install commitment-issues init"\nHide\nEnter',
    "Type \"git commit -q -am 'print hello world'\"\nHide\nEnter",
    'Type "npm run commit:fix"\nHide\nEnter',
    'Type "git push -q"\nHide\nEnter',
  ]) {
    assert.ok(
      tape.includes(hiddenExecution),
      `demo should hide variable command runtime for ${hiddenExecution.split("\\n")[0]}`,
    );
  }
  assert.match(tape, /printf '__BASELINE_%s__\\n' READY/);
  assert.match(tape, /Wait\+Line@30s \/__BASELINE_READY__\//);
  assert.match(tape, /PROMPT='READY> '/);
  assert.match(tape, /Wait\+Line@30s \/READY>\$\//);
  assert.match(tape, /Wait\+Screen@30s \/Your next push runs advisory tests\//);
  assert.match(tape, /Wait\+Screen@30s \/Pre-commit suggestions found\//);
  assert.match(
    tape,
    /Wait\+Screen@30s \/Latest commit amended with automatic fixes\//,
  );
  assert.match(tape, /Wait\+Line@30s \/git:\\\(feature.greeting\\\) \*\$\//);
  assert.match(tape, /Wait\+Screen@30s \/Push allowed\//);
  assert.ok(switchIndex >= 0, "demo should create a named feature branch");
  assert.ok(
    tape.lastIndexOf("Show", initIndex) > tape.lastIndexOf("Hide", initIndex),
    "the demonstrated init command should be captured rather than hidden",
  );
  assert.ok(
    tape.indexOf("Hide", initIndex) > initIndex,
    "setup bookkeeping should be hidden only after init is demonstrated",
  );
  assert.ok(
    welcomeOptOutIndex > initIndex && welcomeOptOutIndex < visibleCommitIndex,
    "the demo should opt out only after showing the default init experience",
  );
  assert.ok(
    visibleCommitIndex > switchIndex,
    "the demonstrated commit should happen after switching off main",
  );
  assert.ok(
    pushIndex > fixIndex,
    "the demonstrated push should happen after the safe amend",
  );
  assert.ok(
    resetIndex > fixIndex &&
      resetPromptIndex > resetIndex &&
      pushIndex > resetPromptIndex,
    "the demo should reset its full viewport before showing the push result",
  );
});
