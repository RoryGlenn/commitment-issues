// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import boxen from "boxen";
import pc from "picocolors";

/**
 * Print a rounded, padded box to stdout.
 * @param {string} message - Box body.
 * @param {(v: string) => string} [color] - Color transform for the body.
 * @param {object} [options] - Extra boxen options (merged over defaults).
 */
export function printBox(message, color = (value) => value, options = {}) {
  console.log(
    boxen(color(message), {
      padding: 1,
      borderStyle: "round",
      margin: {
        top: 1,
        bottom: 1,
      },
      ...options,
    }),
  );
}

function boxLines(linesOrResult) {
  if (Array.isArray(linesOrResult)) {
    return linesOrResult;
  }
  if (Array.isArray(linesOrResult?.lines)) {
    return linesOrResult.lines;
  }
  return [String(linesOrResult ?? "")];
}

function severityBox(lines, color, title, borderColor) {
  printBox(boxLines(lines).join("\n"), color, {
    title,
    titleAlignment: "center",
    borderColor,
  });
}

// Severity-titled box helpers; each takes an array of pre-formatted lines.
export const infoBox = (lines) => severityBox(lines, pc.cyan, "info", "cyan");
export const successBox = (lines) =>
  severityBox(lines, pc.green, "success", "green");
export const warningBox = (lines) =>
  severityBox(lines, pc.yellow, "warning", "yellow");
export const errorBox = (lines) => severityBox(lines, pc.red, "error", "red");

/**
 * Print a pre-built severity/lines message model.
 * @param {{severity?: "info"|"success"|"warning"|"error", lines?: string[]}} model - Message to render.
 */
export function printBoxModel(model = {}) {
  const renderers = {
    info: infoBox,
    success: successBox,
    warning: warningBox,
    error: errorBox,
  };
  (renderers[model.severity] || infoBox)(model.lines || []);
}

/**
 * Decide whether a final hook message should be visible under the requested
 * presentation policy. Warnings and errors are never suppressible.
 * @param {{severity?: "info"|"success"|"warning"|"error"}} model - Final hook message.
 * @param {"problems-only"|"normal"} [hookOutput] - Effective output policy.
 * @returns {boolean} Whether the model should be rendered.
 */
export function shouldRenderHookModel(
  model = {},
  hookOutput = "problems-only",
) {
  return (
    hookOutput === "normal" ||
    model.severity === "warning" ||
    model.severity === "error"
  );
}

/**
 * Render a final hook message when its severity is visible under the policy.
 * @param {{severity?: "info"|"success"|"warning"|"error", lines?: string[]}} model - Final hook message.
 * @param {"problems-only"|"normal"} [hookOutput] - Effective output policy.
 * @returns {boolean} Whether a box was rendered.
 */
export function printHookBoxModel(model = {}, hookOutput = "problems-only") {
  if (!shouldRenderHookModel(model, hookOutput)) {
    return false;
  }
  printBoxModel(model);
  return true;
}
