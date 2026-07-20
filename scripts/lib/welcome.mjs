// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { resolveShowWelcomeOnFirstCommit } from "./config.mjs";
import { runScript } from "./package-manager.mjs";
import { run } from "./process.mjs";
import { printBoxModel } from "./ui.mjs";

export const WELCOME_MARKER_DIRECTORY = "commitment-issues";
export const WELCOME_MARKER_NAME = "welcome-v1";

const COMMIT_OWL = [
  { art: ",_," },
  { art: "(O,O)", suffix: "  <3" },
  { art: "(   )" },
  { art: '-"-"-' },
];

function centered(line, width) {
  const padding = Math.max(0, Math.floor((width - line.length) / 2));
  return `${" ".repeat(padding)}${line}`;
}

/**
 * Keep the mascot centered without making narrow terminals overflow. Boxen
 * uses one border column and two padding columns on each side.
 * @param {NodeJS.ProcessEnv} [env] - Environment that may report COLUMNS.
 * @param {{columns?: number}} [stream] - Output stream with a terminal width.
 * @returns {number} Content width used only to position the compact owl.
 */
export function welcomeContentWidth(
  env = process.env,
  stream = process.stdout,
) {
  const reported = Number(stream.columns ?? env.COLUMNS);
  return Number.isFinite(reported) && reported > 0
    ? Math.max(12, Math.min(51, reported - 6))
    : 51;
}

/**
 * Build the deterministic first-commit welcome shown in a normal pre-commit
 * run. The caller supplies the package-manager-aware doctor command.
 * @param {object} [options] - Message presentation values.
 * @param {string} [options.doctorCommand] - Project-local doctor command.
 * @param {number} [options.contentWidth] - Width used to center the owl.
 * @returns {{severity: "info", lines: string[]}} Terminal box model.
 */
export function buildWelcomeMessage({
  doctorCommand = runScript("doctor"),
  contentWidth = 51,
} = {}) {
  const repairHint = `Verify or repair the hooks anytime: ${doctorCommand}`;
  const owlWidth = Math.min(contentWidth, Math.max(48, repairHint.length));
  return {
    severity: "info",
    lines: [
      ...COMMIT_OWL.map(
        ({ art, suffix = "" }) => centered(art, owlWidth) + suffix,
      ),
      "",
      pc.bold("Commitment Issues is active here."),
      "",
      "Commitment Issues checks changes before each",
      "commit. Keep the hooks enabled, and tell us if",
      "any guidance feels confusing.",
      "",
      pc.dim(repairHint),
    ],
  };
}

/**
 * Resolve the versioned welcome marker below Git's common directory. Linked
 * worktrees report the same common directory, so they share one marker.
 * @param {string} [cwd] - Repository working directory.
 * @param {NodeJS.ProcessEnv} [env] - Environment for the Git probe.
 * @param {Function} [gitRun] - Injectable shell-free Git runner.
 * @returns {string|null} Absolute marker path, or null when Git cannot answer.
 */
export function welcomeMarkerPath(
  cwd = process.cwd(),
  env = process.env,
  gitRun = run,
) {
  const result = gitRun("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    env,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  const commonDir = String(result.stdout ?? "").trim();
  return commonDir
    ? path.join(
        path.resolve(cwd, commonDir),
        WELCOME_MARKER_DIRECTORY,
        WELCOME_MARKER_NAME,
      )
    : null;
}

/**
 * Inspect a marker without confusing absence with permission or path errors.
 * @param {string} markerPath - Absolute marker path.
 * @param {typeof fs} [fileSystem] - Injectable filesystem implementation.
 * @returns {"present"|"absent"|"unavailable"} Marker state.
 */
export function inspectWelcomeMarker(markerPath, fileSystem = fs) {
  try {
    fileSystem.lstatSync(markerPath);
    return "present";
  } catch (error) {
    return error?.code === "ENOENT" ? "absent" : "unavailable";
  }
}

/**
 * Persist the versioned marker without overwriting an existing filesystem
 * entry. All failures are advisory and intentionally collapse to false.
 * @param {string} markerPath - Absolute marker path.
 * @param {typeof fs} [fileSystem] - Injectable filesystem implementation.
 * @returns {boolean} Whether the marker was created.
 */
export function writeWelcomeMarker(markerPath, fileSystem = fs) {
  try {
    fileSystem.mkdirSync(path.dirname(markerPath), { recursive: true });
    fileSystem.writeFileSync(markerPath, "welcome-v1\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Render the welcome once for a human pre-commit run, then record it in the
 * Git common directory. Marker and rendering failures always fail open.
 * @param {object} [options] - Runtime inputs and injectable test seams.
 * @returns {boolean} Whether the welcome was rendered during this call.
 */
export function showWelcomeOnFirstCommit({
  config = {},
  jsonMode = false,
  cwd = process.cwd(),
  env = process.env,
  stream = process.stdout,
  fileSystem = fs,
  gitRun = run,
  render = printBoxModel,
} = {}) {
  if (jsonMode || !resolveShowWelcomeOnFirstCommit(config)) {
    return false;
  }

  const markerPath = welcomeMarkerPath(cwd, env, gitRun);
  if (
    !markerPath ||
    inspectWelcomeMarker(markerPath, fileSystem) !== "absent"
  ) {
    return false;
  }

  try {
    render(
      buildWelcomeMessage({
        doctorCommand: runScript("doctor", cwd),
        contentWidth: welcomeContentWidth(env, stream),
      }),
    );
  } catch {
    return false;
  }

  // The welcome is informational: a failed marker write may make it appear on
  // a later run, but it must never affect the current commit.
  writeWelcomeMarker(markerPath, fileSystem);
  return true;
}
