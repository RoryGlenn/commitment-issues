// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import boxen from "boxen";
import pc from "picocolors";
import { escapeStyledTerminalText, escapeTerminalText } from "./terminal.mjs";

function colorsAreDisabled() {
  return (
    Object.hasOwn(process.env, "NO_COLOR") || process.env.FORCE_COLOR === "0"
  );
}

/**
 * Print a rounded, padded box to stdout.
 * @param {string|string[]} message - Box body or intentional model lines.
 * @param {(v: string) => string} [color] - Color transform for the body.
 * @param {object} [options] - Extra boxen options (merged over defaults).
 */
export function printBox(message, color = String, options = {}) {
  const colorsDisabled = colorsAreDisabled();
  const lines = Array.isArray(message)
    ? message
    : String(message ?? "").split("\n");
  const sanitizeLine = colorsDisabled
    ? escapeTerminalText
    : escapeStyledTerminalText;
  const safeMessage = lines.map(sanitizeLine).join("\n");
  const content = colorsDisabled ? safeMessage : color(safeMessage);
  const boxOptions = {
    padding: 1,
    borderStyle: "round",
    margin: {
      top: 1,
      bottom: 1,
    },
    ...options,
  };
  if (colorsDisabled) {
    delete boxOptions.borderColor;
  }
  let output;
  try {
    output = boxen(content, boxOptions);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    // Boxen derives its wrapping width from stdout/stderr or COLUMNS and can
    // throw when that external value is malformed or below its border width.
    // A three-column retry is the smallest valid rounded box and keeps every
    // user-visible outcome available instead of crashing the command.
    output = boxen(content, { ...boxOptions, width: 3 });
  }
  console.log(output);
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
  printBox(boxLines(lines), color, {
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
