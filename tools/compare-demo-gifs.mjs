#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_FRAMES_PER_SECOND = 25;

// These rectangles contain values that are expected to change even when the
// demo's behavior and intended visuals do not. The source GIFs remain intact;
// the rectangles are covered only inside FFmpeg's in-memory SSIM inputs.
export const VOLATILE_DEMO_REGIONS = Object.freeze([
  Object.freeze({
    name: "formatter duration",
    x: 175,
    y: 364,
    width: 75,
    height: 28,
    start: 15,
    end: 21.5,
  }),
  Object.freeze({
    name: "amended commit abbreviation",
    x: 220,
    y: 407,
    width: 100,
    height: 28,
    start: 15,
    end: 21.5,
  }),
  Object.freeze({
    name: "test-case duration",
    x: 112,
    y: 126,
    width: 155,
    height: 28,
    start: 21,
    end: 30,
  }),
  Object.freeze({
    name: "test-suite duration",
    x: 175,
    y: 299,
    width: 130,
    height: 28,
    start: 21,
    end: 30,
  }),
]);

export function temporalShiftCandidates(maxShiftFrames) {
  if (!Number.isInteger(maxShiftFrames) || maxShiftFrames < 0) {
    throw new Error("maximum temporal shift must be a non-negative integer");
  }

  const shifts = [0];
  for (let shift = 1; shift <= maxShiftFrames; shift += 1) {
    shifts.push(-shift, shift);
  }
  return shifts;
}

function drawboxFilter(region) {
  return [
    `drawbox=x=${region.x}`,
    `y=${region.y}`,
    `w=${region.width}`,
    `h=${region.height}`,
    "color=black",
    "t=fill",
    `enable='between(t,${region.start},${region.end})'`,
  ].join(":");
}

export function buildSsimFilterGraph(
  shiftFrames,
  {
    framesPerSecond = DEMO_FRAMES_PER_SECOND,
    regions = VOLATILE_DEMO_REGIONS,
  } = {},
) {
  if (!Number.isInteger(shiftFrames)) {
    throw new Error("temporal shift must be an integer number of frames");
  }
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
    throw new Error("demo frame rate must be a positive number");
  }

  const masks = regions.map(drawboxFilter).join(",");
  const normalization = masks ? `${masks},` : "";
  const renderedShift =
    shiftFrames === 0
      ? ""
      : `${shiftFrames > 0 ? "+" : ""}${shiftFrames}/${framesPerSecond}/TB`;

  return [
    `[0:v]${normalization}setpts=PTS-STARTPTS[committed]`,
    `[1:v]${normalization}setpts=PTS-STARTPTS${renderedShift}[rendered]`,
    "[committed][rendered]ssim",
  ].join(";");
}

export function parseSsimScore(output) {
  const matches = [...String(output).matchAll(/\bAll:([0-9]+(?:\.[0-9]+)?)/g)];
  const score = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error("FFmpeg did not report a valid aggregate SSIM score");
  }
  return score;
}

export function measureSsim(
  committedPath,
  renderedPath,
  shiftFrames,
  {
    framesPerSecond = DEMO_FRAMES_PER_SECOND,
    regions = VOLATILE_DEMO_REGIONS,
    run = spawnSync,
  } = {},
) {
  const result = run(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-nostats",
      "-i",
      committedPath,
      "-i",
      renderedPath,
      "-filter_complex",
      buildSsimFilterGraph(shiftFrames, { framesPerSecond, regions }),
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "ffmpeg failed").trim();
    throw new Error(detail);
  }
  return parseSsimScore(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function compareDemoVisuals(
  committedPath,
  renderedPath,
  {
    minimumSsim = 0.997,
    maxShiftFrames = 2,
    framesPerSecond = DEMO_FRAMES_PER_SECOND,
    regions = VOLATILE_DEMO_REGIONS,
    measure = measureSsim,
  } = {},
) {
  if (!Number.isFinite(minimumSsim) || minimumSsim < 0 || minimumSsim > 1) {
    throw new Error("minimum SSIM must be a number between 0 and 1");
  }

  const scores = temporalShiftCandidates(maxShiftFrames).map((shiftFrames) => ({
    shiftFrames,
    score: measure(committedPath, renderedPath, shiftFrames, {
      framesPerSecond,
      regions,
    }),
  }));
  const best = scores.reduce((highest, candidate) =>
    candidate.score > highest.score ? candidate : highest,
  );

  return {
    best,
    minimumSsim,
    passed: best.score >= minimumSsim,
    scores,
  };
}

function readNumber(
  name,
  fallback,
  { env = process.env, integer = false } = {},
) {
  const raw = env[name];
  if (raw !== undefined && raw.trim() === "") {
    throw new Error(`${name} must not be empty`);
  }
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a number"}`);
  }
  return value;
}

function formatShift(shiftFrames) {
  return `${shiftFrames > 0 ? "+" : ""}${shiftFrames}`;
}

const USAGE =
  "Usage: node tools/compare-demo-gifs.mjs [--json] <committed.gif> <rendered.gif>";

function parseArguments(argv) {
  const paths = [];
  let json = false;
  let optionsEnded = false;

  for (const argument of argv) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument === "--json") {
      if (json) {
        throw new Error("Option --json may only be specified once.");
      }
      json = true;
    } else if (!optionsEnded && argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      paths.push(argument);
    }
  }

  if (paths.length !== 2) {
    throw new Error("Expected exactly two GIF paths.");
  }

  return { json, paths };
}

function humanResult(result, regions) {
  const scoreSummary = result.scores
    .map(
      ({ shiftFrames, score }) =>
        `${formatShift(shiftFrames)}=${score.toFixed(6)}`,
    )
    .join(", ");
  const regionSummary = regions.map(({ name }) => name).join(", ");

  if (!result.passed) {
    return {
      status: 1,
      stdout: "",
      stderr:
        `Rendered demo normalized visual similarity ${result.best.score.toFixed(6)} is below ${result.minimumSsim.toFixed(6)}.\n` +
        `Evaluated rendered-frame shifts (${scoreSummary}); masked only: ${regionSummary}.\n`,
    };
  }

  return {
    status: 0,
    stdout:
      `Rendered demo normalized visual similarity ${result.best.score.toFixed(6)} meets ${result.minimumSsim.toFixed(6)} at a ${formatShift(result.best.shiftFrames)}-frame shift.\n` +
      `Evaluated rendered-frame shifts (${scoreSummary}); masked only: ${regionSummary}.\n`,
    stderr: "",
  };
}

export function buildJsonResult(
  result,
  {
    framesPerSecond = DEMO_FRAMES_PER_SECOND,
    regions = VOLATILE_DEMO_REGIONS,
  } = {},
) {
  return {
    passed: result.passed,
    minimumSsim: result.minimumSsim,
    best: result.best,
    scores: result.scores,
    framesPerSecond,
    maskedRegions: regions.map(({ name }) => name),
  };
}

// JSON stdout is reserved for completed comparisons. Argument, environment,
// input, and FFmpeg failures remain operational errors on stderr with exit 2.
export function runDemoComparison(
  argv,
  {
    compare = compareDemoVisuals,
    env = process.env,
    framesPerSecond = DEMO_FRAMES_PER_SECOND,
    regions = VOLATILE_DEMO_REGIONS,
  } = {},
) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    return {
      status: 2,
      stdout: "",
      stderr: `${error.message}\n${USAGE}\n`,
    };
  }

  try {
    const minimumSsim = readNumber("MINIMUM_SSIM", 0.997, { env });
    const maxShiftFrames = readNumber("MAX_TEMPORAL_SHIFT_FRAMES", 2, {
      env,
      integer: true,
    });
    const result = compare(options.paths[0], options.paths[1], {
      framesPerSecond,
      minimumSsim,
      maxShiftFrames,
      regions,
    });

    if (options.json) {
      return {
        status: result.passed ? 0 : 1,
        stdout: `${JSON.stringify(
          buildJsonResult(result, { framesPerSecond, regions }),
          null,
          2,
        )}\n`,
        stderr: "",
      };
    }

    return humanResult(result, regions);
  } catch (error) {
    return {
      status: 2,
      stdout: "",
      stderr: `Demo visual comparison failed: ${error.message}\n`,
    };
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const result = runDemoComparison(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
