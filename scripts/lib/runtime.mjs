// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

/**
 * Extract the concrete minimum from this package's `>=x.y.z` Node engine.
 * @param {string} engine - The package.json Node engine range.
 * @returns {string|null} The minimum version, when the range declares one.
 */
export function minimumNodeVersion(engine) {
  return String(engine).match(/>=\s*(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

function versionDifference(current, minimum) {
  const currentParts = current.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  return (
    currentParts
      .map((part, index) => part - minimumParts[index])
      .find((difference) => difference !== 0) ?? 0
  );
}

/**
 * Build the product-owned diagnostic package managers cannot guarantee when
 * engine-strict behavior is disabled.
 * @param {string} current - Current Node version without a leading `v`.
 * @param {string} engine - The package.json Node engine range.
 * @returns {string|null} An actionable diagnostic, or null when supported.
 */
export function unsupportedNodeVersionMessage(current, engine) {
  const minimum = minimumNodeVersion(engine);
  if (!minimum) {
    throw new TypeError(`Unsupported Node engine range: ${engine}`);
  }
  if (versionDifference(current, minimum) >= 0) {
    return null;
  }
  return `commitment-issues: Node.js ${minimum} or newer is required; found ${current}.`;
}

/**
 * Fail before command dispatch when a lenient package manager allowed an
 * unsupported runtime to launch the CLI.
 * @param {string} current - Current Node version without a leading `v`.
 * @param {string} engine - The package.json Node engine range.
 */
export function enforceSupportedNodeVersion(current, engine) {
  const message = unsupportedNodeVersionMessage(current, engine);
  if (message) {
    console.error(message);
    process.exit(1);
  }
}
