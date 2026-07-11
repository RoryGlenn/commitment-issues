// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";

const RAW_CONFIG = Symbol("commitment-issues.rawPrecommitConfig");

// Largest delay Node's setTimeout accepts without coercing it to 1 ms.
export const MAX_TIMEOUT_MS = 2_147_483_647;

function isPlainConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function diagnosticConfig(value) {
  return isPlainConfig(value?.[RAW_CONFIG]) ? value[RAW_CONFIG] : value;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

// Every key the hooks and commands read. Kept in sync with the configuration
// reference table in docs/configuration.md.
export const KNOWN_PRECOMMIT_CONFIG_KEYS = [
  "adviseBehindUpstream",
  "advisePushTests",
  "blockOnSecrets",
  "blockProtectedBranches",
  "blockPushOnTestFailure",
  "commitMessage",
  "generatedPaths",
  "maxCommitFiles",
  "maxCommitLines",
  "maxFileSizeMb",
  "protectedBranches",
  "requireTests",
  "runStagedTests",
  "scanSecrets",
  "secretExempt",
  "testCommand",
  "testExempt",
  "timeoutMs",
  "tone",
];

const BOOLEAN_CONFIG_KEYS = [
  "adviseBehindUpstream",
  "advisePushTests",
  "blockOnSecrets",
  "blockProtectedBranches",
  "blockPushOnTestFailure",
  "requireTests",
  "runStagedTests",
  "scanSecrets",
];

// String-array keys share one validation/sanitization shape.
const STRING_ARRAY_CONFIG_KEYS = [
  "generatedPaths",
  "protectedBranches",
  "secretExempt",
  "testExempt",
];

// Non-negative numeric limits where 0 means "disable this guard".
const LIMIT_CONFIG_KEYS = ["maxCommitFiles", "maxCommitLines", "maxFileSizeMb"];

// Commit-message linting stays isolated in a nested block so adding optional
// commitlint integration does not grow another cluster of top-level flags.
export const KNOWN_COMMIT_MESSAGE_CONFIG_KEYS = ["blockOnFailure", "enabled"];

/**
 * Names of `precommitChecks` keys the tool does not recognize — usually typos
 * (e.g. `requireTest`) that would otherwise silently fall back to defaults.
 * @param {object} config - The loaded precommitChecks object.
 * @returns {string[]} Unknown key names, in the config's own order.
 */
export function unknownPrecommitConfigKeys(config) {
  const target = diagnosticConfig(config);
  if (!isPlainConfig(target)) {
    return [];
  }

  const unknown = Object.keys(target).filter(
    (key) => !KNOWN_PRECOMMIT_CONFIG_KEYS.includes(key),
  );

  if (isPlainConfig(target.commitMessage)) {
    unknown.push(
      ...Object.keys(target.commitMessage)
        .filter((key) => !KNOWN_COMMIT_MESSAGE_CONFIG_KEYS.includes(key))
        .map((key) => `commitMessage.${key}`),
    );
  }

  return unknown;
}

/**
 * Human-readable warnings for recognized config keys whose values do not match
 * the documented allowlist. Invalid values are ignored by loadPrecommitConfig().
 * @param {object} config - The loaded precommitChecks object.
 * @returns {string[]} Invalid-value warning messages.
 */
export function invalidPrecommitConfigMessages(config) {
  const target = diagnosticConfig(config);
  if (!isPlainConfig(target)) {
    return [];
  }

  const messages = [];

  for (const key of BOOLEAN_CONFIG_KEYS) {
    if (key in target && typeof target[key] !== "boolean") {
      messages.push(`${key} must be a boolean`);
    }
  }

  if ("tone" in target && target.tone !== "standard" && target.tone !== "fun") {
    messages.push('tone must be "standard" or "fun"');
  }

  for (const key of STRING_ARRAY_CONFIG_KEYS) {
    if (key in target && !isStringArray(target[key])) {
      messages.push(`${key} must be an array of strings`);
    }
  }

  for (const key of LIMIT_CONFIG_KEYS) {
    if (key in target && (!Number.isFinite(target[key]) || target[key] < 0)) {
      messages.push(`${key} must be a non-negative finite number`);
    }
  }

  if (
    "testCommand" in target &&
    (!Array.isArray(target.testCommand) ||
      target.testCommand.length === 0 ||
      !target.testCommand.every(isNonEmptyString))
  ) {
    messages.push("testCommand must be a non-empty array of non-empty strings");
  }

  if (
    "timeoutMs" in target &&
    (!Number.isFinite(target.timeoutMs) ||
      target.timeoutMs <= 0 ||
      target.timeoutMs > MAX_TIMEOUT_MS)
  ) {
    messages.push(
      `timeoutMs must be a positive finite number no greater than ${MAX_TIMEOUT_MS}`,
    );
  }

  if ("commitMessage" in target) {
    if (!isPlainConfig(target.commitMessage)) {
      messages.push("commitMessage must be an object");
    } else {
      for (const key of KNOWN_COMMIT_MESSAGE_CONFIG_KEYS) {
        if (
          key in target.commitMessage &&
          typeof target.commitMessage[key] !== "boolean"
        ) {
          messages.push(`commitMessage.${key} must be a boolean`);
        }
      }
    }
  }

  return messages;
}

/**
 * Return a validated, allowlisted copy of the config. Unknown keys and invalid
 * values are rejected by omission, so the rest of the tool only sees settings
 * that match the documented types and ranges.
 * @param {object} config - The loaded precommitChecks object.
 * @returns {object} Validated config values.
 */
export function sanitizePrecommitConfig(config) {
  if (!isPlainConfig(config)) {
    return {};
  }

  const sanitized = {};

  for (const key of BOOLEAN_CONFIG_KEYS) {
    if (typeof config[key] === "boolean") {
      sanitized[key] = config[key];
    }
  }

  if (config.tone === "standard" || config.tone === "fun") {
    sanitized.tone = config.tone;
  }

  for (const key of STRING_ARRAY_CONFIG_KEYS) {
    if (isStringArray(config[key])) {
      sanitized[key] = config[key];
    }
  }

  for (const key of LIMIT_CONFIG_KEYS) {
    if (Number.isFinite(config[key]) && config[key] >= 0) {
      sanitized[key] = config[key];
    }
  }

  if (
    Array.isArray(config.testCommand) &&
    config.testCommand.length > 0 &&
    config.testCommand.every(isNonEmptyString)
  ) {
    sanitized.testCommand = config.testCommand;
  }

  if (
    Number.isFinite(config.timeoutMs) &&
    config.timeoutMs > 0 &&
    config.timeoutMs <= MAX_TIMEOUT_MS
  ) {
    sanitized.timeoutMs = config.timeoutMs;
  }

  if (isPlainConfig(config.commitMessage)) {
    sanitized.commitMessage = {};
    for (const key of KNOWN_COMMIT_MESSAGE_CONFIG_KEYS) {
      if (typeof config.commitMessage[key] === "boolean") {
        sanitized.commitMessage[key] = config.commitMessage[key];
      }
    }
  }

  Object.defineProperty(sanitized, RAW_CONFIG, {
    enumerable: false,
    value: config,
  });

  return sanitized;
}

/**
 * Reads the optional raw `precommitChecks` object from package.json in the cwd.
 * @returns {object} The raw config object, or {} if absent/unreadable/malformed.
 */
export function loadRawPrecommitConfig() {
  try {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const config = pkg && pkg.precommitChecks;
    return isPlainConfig(config) ? config : {};
  } catch {
    return {};
  }
}

/**
 * Reads and validates the optional `precommitChecks` object from package.json.
 * @returns {object} Valid config values, or {} if absent/unreadable/malformed.
 */
export function loadPrecommitConfig() {
  return sanitizePrecommitConfig(loadRawPrecommitConfig());
}

/**
 * Resolve the optional commit-message integration to explicit defaults.
 * Merely adding a block does not enable a hook; `enabled: true` is required,
 * and blocking remains a second, independent opt-in.
 * @param {object} config - Sanitized precommitChecks config.
 * @returns {{enabled: boolean, blockOnFailure: boolean}} Effective settings.
 */
export function resolveCommitMessageConfig(config) {
  const commitMessage = isPlainConfig(config?.commitMessage)
    ? config.commitMessage
    : {};
  return {
    enabled: commitMessage.enabled === true,
    blockOnFailure: commitMessage.blockOnFailure === true,
  };
}

/**
 * User-facing advisory diagnostics for unknown keys and invalid values.
 * Callers choose whether to show one-line hook warnings or a doctor/init box.
 * @param {object} config - Config returned by loadPrecommitConfig().
 * @returns {string[]} Warning messages without color or severity prefix.
 */
export function precommitConfigWarningMessages(config) {
  const messages = [];
  const unknownKeys = unknownPrecommitConfigKeys(config);
  if (unknownKeys.length > 0) {
    messages.push(
      `Ignoring unknown precommitChecks key(s) in package.json: ${unknownKeys.join(", ")}. Check for typos.`,
    );
  }

  const invalidValues = invalidPrecommitConfigMessages(config);
  if (invalidValues.length > 0) {
    messages.push(
      `Ignoring invalid precommitChecks value(s) in package.json: ${invalidValues.join("; ")}.`,
    );
  }

  const commitMessage = resolveCommitMessageConfig(config);
  if (commitMessage.blockOnFailure && !commitMessage.enabled) {
    messages.push(
      "commitMessage.blockOnFailure has no effect unless commitMessage.enabled is true.",
    );
  }

  return messages;
}
