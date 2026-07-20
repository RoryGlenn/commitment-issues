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
  DEMO_FRAMES_PER_SECOND,
  VOLATILE_DEMO_REGIONS,
  buildSsimFilterGraph,
  compareDemoVisuals,
  parseSsimScore,
  runDemoComparison,
  temporalShiftCandidates,
} from "../tools/compare-demo-gifs.mjs";

const ffmpegAvailable =
  spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const comparator = fileURLToPath(
  new URL("../tools/compare-demo-gifs.mjs", import.meta.url),
);

const passingResult = {
  passed: true,
  minimumSsim: 0.997,
  best: { shiftFrames: 2, score: 0.9982 },
  scores: [
    { shiftFrames: 0, score: 0.9961 },
    { shiftFrames: -1, score: 0.995 },
    { shiftFrames: 1, score: 0.9981 },
    { shiftFrames: -2, score: 0.994 },
    { shiftFrames: 2, score: 0.9982 },
  ],
};

const failingResult = {
  passed: false,
  minimumSsim: 0.997,
  best: { shiftFrames: 1, score: 0.9965 },
  scores: [
    { shiftFrames: 0, score: 0.9961 },
    { shiftFrames: -1, score: 0.995 },
    { shiftFrames: 1, score: 0.9965 },
  ],
};

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

test("JSON output reports the complete passing comparison as numbers", () => {
  let invocation;
  const command = runDemoComparison(
    ["--json", "committed.gif", "rendered.gif"],
    {
      env: {},
      compare: (...args) => {
        invocation = args;
        return passingResult;
      },
    },
  );

  assert.equal(command.status, 0);
  assert.equal(command.stderr, "");
  const document = JSON.parse(command.stdout);
  assert.deepEqual(document, {
    passed: true,
    minimumSsim: 0.997,
    best: { shiftFrames: 2, score: 0.9982 },
    scores: passingResult.scores,
    framesPerSecond: DEMO_FRAMES_PER_SECOND,
    maskedRegions: VOLATILE_DEMO_REGIONS.map(({ name }) => name),
  });
  assert.equal(typeof document.minimumSsim, "number");
  assert.equal(typeof document.best.score, "number");
  assert.ok(document.scores.every(({ score }) => typeof score === "number"));
  assert.doesNotMatch(command.stdout, /drawbox|between\(t/);
  assert.deepEqual(invocation.slice(0, 2), ["committed.gif", "rendered.gif"]);
  assert.deepEqual(invocation[2], {
    framesPerSecond: DEMO_FRAMES_PER_SECOND,
    minimumSsim: 0.997,
    maxShiftFrames: 2,
    regions: VOLATILE_DEMO_REGIONS,
  });
});

test("JSON output reports a visual mismatch and keeps exit 1", () => {
  const command = runDemoComparison(
    ["committed.gif", "--json", "rendered.gif"],
    {
      env: {},
      compare: () => failingResult,
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, "");
  assert.deepEqual(JSON.parse(command.stdout), {
    passed: false,
    minimumSsim: 0.997,
    best: { shiftFrames: 1, score: 0.9965 },
    scores: failingResult.scores,
    framesPerSecond: DEMO_FRAMES_PER_SECOND,
    maskedRegions: VOLATILE_DEMO_REGIONS.map(({ name }) => name),
  });
});

test("human-readable comparison output remains byte-for-byte stable", () => {
  const passing = runDemoComparison(["committed.gif", "rendered.gif"], {
    env: {},
    compare: () => passingResult,
  });
  assert.deepEqual(passing, {
    status: 0,
    stdout:
      "Rendered demo normalized visual similarity 0.998200 meets 0.997000 at a +2-frame shift.\n" +
      "Evaluated rendered-frame shifts (0=0.996100, -1=0.995000, +1=0.998100, -2=0.994000, +2=0.998200); masked only: formatter duration, amended commit abbreviation, test-case duration, test-suite duration.\n",
    stderr: "",
  });

  const failing = runDemoComparison(["committed.gif", "rendered.gif"], {
    env: {},
    compare: () => failingResult,
  });
  assert.deepEqual(failing, {
    status: 1,
    stdout: "",
    stderr:
      "Rendered demo normalized visual similarity 0.996500 is below 0.997000.\n" +
      "Evaluated rendered-frame shifts (0=0.996100, -1=0.995000, +1=0.996500); masked only: formatter duration, amended commit abbreviation, test-case duration, test-suite duration.\n",
  });
});

test("argument errors show usage without attempting a comparison", () => {
  let comparisonStarted = false;
  const compare = () => {
    comparisonStarted = true;
    return passingResult;
  };
  const cases = [
    [["--json", "--verbose", "a.gif", "b.gif"], /Unknown option: --verbose/],
    [["--json", "--json", "a.gif", "b.gif"], /only be specified once/],
    [["--json", "a.gif"], /Expected exactly two GIF paths/],
  ];

  for (const [args, message] of cases) {
    const command = runDemoComparison(args, { compare, env: {} });
    assert.equal(command.status, 2);
    assert.equal(command.stdout, "");
    assert.match(command.stderr, message);
    assert.match(command.stderr, /Usage: .*\[--json\]/);
  }
  assert.equal(comparisonStarted, false);

  const direct = spawnSync(
    process.execPath,
    [comparator, "--json", "--verbose", "a.gif", "b.gif"],
    { encoding: "utf8" },
  );
  assert.equal(direct.status, 2);
  assert.equal(direct.stdout, "");
  assert.match(direct.stderr, /Unknown option: --verbose/);
  assert.match(direct.stderr, /Usage: .*\[--json\]/);
});

test("end-of-options preserves option-like input paths", () => {
  let invocation;
  const command = runDemoComparison(["--", "-committed.gif", "rendered.gif"], {
    env: {},
    compare: (...args) => {
      invocation = args;
      return passingResult;
    },
  });

  assert.equal(command.status, 0);
  assert.deepEqual(invocation.slice(0, 2), ["-committed.gif", "rendered.gif"]);

  const direct = spawnSync(
    process.execPath,
    [comparator, "--", "-committed.gif", "rendered.gif"],
    { encoding: "utf8" },
  );
  assert.equal(direct.status, 2);
  assert.equal(direct.stdout, "");
  assert.doesNotMatch(direct.stderr, /Unknown option/);
  assert.match(direct.stderr, /Demo visual comparison failed:/);
});

test("JSON mode keeps operational failures on stderr with exit 2", () => {
  let comparisonStarted = false;
  const invalidEnvironment = runDemoComparison(
    ["--json", "committed.gif", "rendered.gif"],
    {
      env: { MINIMUM_SSIM: "" },
      compare: () => {
        comparisonStarted = true;
        return passingResult;
      },
    },
  );
  assert.equal(invalidEnvironment.status, 2);
  assert.equal(invalidEnvironment.stdout, "");
  assert.match(invalidEnvironment.stderr, /MINIMUM_SSIM must not be empty/);
  assert.equal(comparisonStarted, false);

  for (const message of [
    "spawnSync ffmpeg ENOENT",
    "committed.gif: No such file or directory",
  ]) {
    const command = runDemoComparison(
      ["--json", "committed.gif", "rendered.gif"],
      {
        env: {},
        compare: () => {
          throw new Error(message);
        },
      },
    );
    assert.equal(command.status, 2);
    assert.equal(command.stdout, "");
    assert.equal(command.stderr, `Demo visual comparison failed: ${message}\n`);
  }
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

      const passingJson = spawnSync(
        process.execPath,
        [comparator, "--json", committed, volatile],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            MAX_TEMPORAL_SHIFT_FRAMES: "0",
            MINIMUM_SSIM: "0.997",
          },
        },
      );
      assert.equal(passingJson.status, 0, passingJson.stderr);
      assert.equal(passingJson.stderr, "");
      assert.equal(JSON.parse(passingJson.stdout).passed, true);

      fs.copyFileSync(committed, path.join(directory, "-committed.mkv"));
      fs.copyFileSync(volatile, path.join(directory, "rendered.mkv"));
      const optionLikeJson = spawnSync(
        process.execPath,
        [comparator, "--json", "--", "-committed.mkv", "rendered.mkv"],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            MAX_TEMPORAL_SHIFT_FRAMES: "0",
            MINIMUM_SSIM: "0.997",
          },
        },
      );
      assert.equal(optionLikeJson.status, 0, optionLikeJson.stderr);
      assert.equal(optionLikeJson.stderr, "");
      assert.equal(JSON.parse(optionLikeJson.stdout).passed, true);

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
        if (name === "missing scene") {
          const failingJson = spawnSync(
            process.execPath,
            [comparator, "--json", committed, candidate],
            {
              encoding: "utf8",
              env: {
                ...process.env,
                MAX_TEMPORAL_SHIFT_FRAMES: "0",
                MINIMUM_SSIM: "0.997",
              },
            },
          );
          assert.equal(failingJson.status, 1, failingJson.stderr);
          assert.equal(failingJson.stderr, "");
          assert.equal(JSON.parse(failingJson.stdout).passed, false);
        }
      }
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  },
);
