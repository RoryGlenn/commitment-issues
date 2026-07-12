// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  VOLATILE_DEMO_REGIONS,
  buildSsimFilterGraph,
  compareDemoVisuals,
  parseSsimScore,
  temporalShiftCandidates,
} from "../tools/compare-demo-gifs.mjs";

const ffmpegAvailable =
  spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

test("temporal shifts stay inside the configured frame-drift bound", () => {
  assert.deepEqual(temporalShiftCandidates(0), [0]);
  assert.deepEqual(temporalShiftCandidates(2), [0, -1, 1, -2, 2]);
  assert.throws(() => temporalShiftCandidates(-1), /non-negative integer/);
  assert.throws(() => temporalShiftCandidates(1.5), /non-negative integer/);
});

test("SSIM filters mask each named volatile region in both inputs", () => {
  const graph = buildSsimFilterGraph(2);

  for (const region of VOLATILE_DEMO_REGIONS) {
    const rectangle = `drawbox=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}`;
    assert.equal(
      graph.split(rectangle).length - 1,
      2,
      `${region.name} should be masked in both GIFs`,
    );
    assert.ok(
      graph.includes(`enable='between(t,${region.start},${region.end})'`),
      `${region.name} should be masked only during its scene`,
    );
  }

  assert.match(graph, /\[0:v\].*setpts=PTS-STARTPTS\[committed\]/);
  assert.match(graph, /\[1:v\].*setpts=PTS-STARTPTS\+2\/25\/TB\[rendered\]/);
  assert.match(graph, /\[committed\]\[rendered\]ssim$/);
});

test("SSIM parsing and bounded alignment select the strongest valid score", () => {
  assert.equal(parseSsimScore("SSIM Y:0.9 All:0.998245 (27.6)"), 0.998245);
  assert.throws(() => parseSsimScore("no metric"), /valid aggregate SSIM/);

  const measured = new Map([
    [0, 0.9961],
    [-1, 0.995],
    [1, 0.9981],
    [-2, 0.994],
    [2, 0.9982],
  ]);
  const result = compareDemoVisuals("committed.gif", "rendered.gif", {
    minimumSsim: 0.997,
    maxShiftFrames: 2,
    measure: (_committed, _rendered, shift) => measured.get(shift),
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.best, { shiftFrames: 2, score: 0.9982 });
  assert.equal(result.scores.length, 5);
});

function renderSyntheticVideo(file, panel, { volatile = false } = {}) {
  const filters = [];
  if (panel) {
    filters.push(
      [
        `drawbox=x=${panel.x}`,
        `y=${panel.y}`,
        `w=${panel.width}`,
        `h=${panel.height}`,
        `color=${panel.color}`,
        "t=fill",
        "enable='between(t,4,8)'",
      ].join(":"),
    );
  }
  if (volatile) {
    for (const region of VOLATILE_DEMO_REGIONS) {
      filters.push(
        [
          `drawbox=x=${region.x}`,
          `y=${region.y}`,
          `w=${region.width}`,
          `h=${region.height}`,
          "color=white",
          "t=fill",
          `enable='between(t,${region.start},${region.end})'`,
        ].join(":"),
      );
    }
  }

  const result = spawnSync(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x1e1e2e:s=1000x760:r=1:d=26",
      "-vf",
      filters.join(",") || "null",
      "-c:v",
      "ffv1",
      "-y",
      file,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test(
  "normalization ignores volatile values but rejects visible regressions",
  { skip: !ffmpegAvailable },
  () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "commitment-demo-compare-"),
    );
    const stablePanel = {
      x: 40,
      y: 480,
      width: 700,
      height: 200,
      color: "0x50fa7b",
    };

    try {
      const committed = path.join(directory, "committed.mkv");
      const volatile = path.join(directory, "volatile.mkv");
      renderSyntheticVideo(committed, stablePanel);
      renderSyntheticVideo(volatile, stablePanel, { volatile: true });

      const normalized = compareDemoVisuals(committed, volatile, {
        minimumSsim: 0.997,
        maxShiftFrames: 0,
        framesPerSecond: 1,
      });
      assert.equal(normalized.passed, true);
      assert.equal(normalized.best.score, 1);

      const regressions = [
        ["missing scene", null],
        ["color", { ...stablePanel, color: "0xff5555" }],
        ["layout", { ...stablePanel, x: 250 }],
        ["clipping", { ...stablePanel, width: 300 }],
      ];
      for (const [name, panel] of regressions) {
        const candidate = path.join(
          directory,
          `${name.replaceAll(" ", "-")}.mkv`,
        );
        renderSyntheticVideo(candidate, panel, { volatile: true });
        const comparison = compareDemoVisuals(committed, candidate, {
          minimumSsim: 0.997,
          maxShiftFrames: 0,
          framesPerSecond: 1,
        });
        assert.equal(
          comparison.passed,
          false,
          `${name} score ${comparison.best.score} should fail`,
        );
      }
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  },
);
