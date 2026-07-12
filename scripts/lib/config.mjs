// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";

const RAW_CONFIG = Symbol("commitment-issues.rawPrecommitConfig");
const CONFIG_STATE = Symbol("commitment-issues.precommitConfigState");

export const STANDALONE_CONFIG_FILE = ".commitmentrc.json";
export const DEFAULT_HOOK_OUTPUT = "problems-only";

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
  "hookOutput",
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

  if (
    "hookOutput" in target &&
    target.hookOutput !== "problems-only" &&
    target.hookOutput !== "normal"
  ) {
    messages.push('hookOutput must be "problems-only" or "normal"');
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

  if (config.hookOutput === "problems-only" || config.hookOutput === "normal") {
    sanitized.hookOutput = config.hookOutput;
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
 * Resolve the effective config from the two supported sources. Standalone
 * top-level keys shallowly override package.json keys before sanitization, so
 * an invalid higher-precedence value cannot revive a lower-precedence value.
 * The attached source state keeps diagnostics accurate for in-memory callers
 * such as init as well as file-backed runtime loading.
 * @param {object} packageConfig - Raw package.json precommitChecks config.
 * @param {{config: object, error: string|null}} standalone - Standalone read result.
 * @returns {object} Sanitized effective config with source metadata.
 */
export function resolvePrecommitConfigSources(packageConfig, standalone) {
  const rawConfig = standalone.error
    ? packageConfig
    : { ...packageConfig, ...standalone.config };
  const config = sanitizePrecommitConfig(rawConfig);

  Object.defineProperty(config, CONFIG_STATE, {
    enumerable: false,
    value: { packageConfig, standalone },
  });

  return config;
}

/**
 * Reads the optional raw `precommitChecks` object from package.json in the cwd.
 * @param {string} [cwd] - Project root containing package.json.
 * @returns {object} The raw config object, or {} if absent/unreadable/malformed.
 */
export function loadRawPrecommitConfig(cwd = process.cwd()) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
    );
    const config = pkg && pkg.precommitChecks;
    return isPlainConfig(config) ? config : {};
  } catch {
    return {};
  }
}

/**
 * Reads the optional standalone JSON config without executing project code.
 * @param {string} [cwd] - Project root containing the config file.
 * @returns {{exists: boolean, config: object, error: string|null}} Read result.
 */
export function readStandalonePrecommitConfig(cwd = process.cwd()) {
  const filePath = path.join(cwd, STANDALONE_CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    return { exists: false, config: {}, error: null };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return {
      exists: true,
      config: {},
      error: "could not be read",
    };
  }

  let config;
  try {
    config = JSON.parse(content);
  } catch {
    return {
      exists: true,
      config: {},
      error: "contains invalid JSON",
    };
  }

  if (!isPlainConfig(config)) {
    return {
      exists: true,
      config: {},
      error: "must contain a JSON object at the top level",
    };
  }

  return { exists: true, config, error: null };
}

/**
 * Load both configuration sources. Standalone keys shallowly override
 * package.json keys; invalid standalone values still win precedence and are
 * then removed by sanitization instead of reviving a lower-priority value.
 * A malformed standalone file cannot participate, so package.json remains the
 * backward-compatible fallback and the caller can surface `error`.
 * @param {string} [cwd] - Project root containing the configuration sources.
 * @returns {{config: object, packageConfig: object, standalone: {exists: boolean, config: object, error: string|null}}} Loaded state.
 */
export function loadPrecommitConfigState(cwd = process.cwd()) {
  const packageConfig = loadRawPrecommitConfig(cwd);
  const standalone = readStandalonePrecommitConfig(cwd);
  const config = resolvePrecommitConfigSources(packageConfig, standalone);
  const state = { packageConfig, standalone };

  return { config, ...state };
}

/**
 * Describe which source contributes effective keys to a loaded config.
 * @param {object} config - Config returned by loadPrecommitConfig().
 * @param {string[]} [keys] - Optional effective keys whose source to report.
 * @returns {string} Human-readable source label.
 */
export function precommitConfigSourceLabel(config, keys) {
  const state = config?.[CONFIG_STATE];
  if (!state) {
    return "package.json";
  }

  if (keys?.length > 0) {
    const topLevelKeys = keys.map((key) => key.split(".", 1)[0]);
    const fromStandalone =
      !state.standalone.error &&
      topLevelKeys.some((key) => Object.hasOwn(state.standalone.config, key));
    const fromPackage = topLevelKeys.some(
      (key) =>
        !Object.hasOwn(state.standalone.config, key) &&
        Object.hasOwn(state.packageConfig, key),
    );
    if (fromStandalone && fromPackage) {
      return `${STANDALONE_CONFIG_FILE} and package.json`;
    }
    if (fromStandalone) {
      return STANDALONE_CONFIG_FILE;
    }
    if (fromPackage) {
      return "package.json";
    }
  }

  const standaloneKeys = state.standalone.error
    ? []
    : Object.keys(state.standalone.config);
  const packageKeys = Object.keys(state.packageConfig).filter(
    (key) => !Object.hasOwn(state.standalone.config, key),
  );

  if (standaloneKeys.length > 0 && packageKeys.length > 0) {
    return `${STANDALONE_CONFIG_FILE} and package.json`;
  }
  return standaloneKeys.length > 0 ? STANDALONE_CONFIG_FILE : "package.json";
}

/**
 * Structured, non-blocking diagnostics for malformed files and values.
 * @param {object} config - Config returned by loadPrecommitConfig().
 * @returns {{code: string, message: string}[]} Warning diagnostics.
 */
export function precommitConfigDiagnostics(config) {
  const diagnostics = [];
  const state = config?.[CONFIG_STATE];

  if (state?.standalone.error) {
    diagnostics.push({
      code: "config.invalid-source",
      message:
        `Ignoring ${STANDALONE_CONFIG_FILE} because it ${state.standalone.error}. ` +
        "Using package.json precommitChecks or defaults instead.",
    });
  }

  const unknownKeys = unknownPrecommitConfigKeys(config);
  if (unknownKeys.length > 0) {
    const source = precommitConfigSourceLabel(config, unknownKeys);
    diagnostics.push({
      code: "config.unknown-keys",
      message: `Ignoring unknown precommitChecks key(s) in ${source}: ${unknownKeys.join(", ")}. Check for typos.`,
    });
  }

  const invalidValues = invalidPrecommitConfigMessages(config);
  if (invalidValues.length > 0) {
    const invalidKeys = invalidValues.map(
      (message) => message.split(" ", 1)[0],
    );
    const source = precommitConfigSourceLabel(config, invalidKeys);
    diagnostics.push({
      code: "config.invalid-values",
      message: `Ignoring invalid precommitChecks value(s) in ${source}: ${invalidValues.join("; ")}.`,
    });
  }

  const commitMessage = resolveCommitMessageConfig(config);
  if (commitMessage.blockOnFailure && !commitMessage.enabled) {
    diagnostics.push({
      code: "config.ineffective-value",
      message:
        "commitMessage.blockOnFailure has no effect unless commitMessage.enabled is true.",
    });
  }

  return diagnostics;
}

/**
 * User-facing warning messages without color or a warning prefix.
 * @param {object} config - Config returned by loadPrecommitConfig().
 * @returns {string[]} Warning messages.
 */
export function precommitConfigWarningMessages(config) {
  return precommitConfigDiagnostics(config).map(({ message }) => message);
}

/**
 * Reads and validates `.commitmentrc.json` plus package.json precommitChecks.
 * @param {string} [cwd] - Project root containing the configuration sources.
 * @returns {object} Sanitized effective values; malformed standalone input
 *   falls back to package.json and absent configuration returns {}.
 */
export function loadPrecommitConfig(cwd = process.cwd()) {
  return loadPrecommitConfigState(cwd).config;
}

/**
 * Resolve hook presentation to the quiet-by-default policy. Invalid values are
 * removed during sanitization, so anything other than an explicit `normal`
 * request safely falls back to `problems-only`.
 * @param {object} config - Sanitized precommitChecks config.
 * @returns {"problems-only"|"normal"} Effective hook output policy.
 */
export function resolveHookOutput(config) {
  return config?.hookOutput === "normal" ? "normal" : DEFAULT_HOOK_OUTPUT;
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
