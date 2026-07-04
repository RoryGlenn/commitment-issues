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
