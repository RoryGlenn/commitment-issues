import fs from "node:fs";

function isPlainConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Every key the hooks and commands read. Kept in sync with the configuration
// reference table in docs/configuration.md.
export const KNOWN_PRECOMMIT_CONFIG_KEYS = [
  "advisePushTests",
  "blockPushOnTestFailure",
  "requireTests",
  "runStagedTests",
  "testCommand",
  "testExempt",
  "timeoutMs",
  "tone",
];

/**
 * Names of `precommitChecks` keys the tool does not recognize — usually typos
 * (e.g. `requireTest`) that would otherwise silently fall back to defaults.
 * @param {object} config - The loaded precommitChecks object.
 * @returns {string[]} Unknown key names, in the config's own order.
 */
export function unknownPrecommitConfigKeys(config) {
  if (!isPlainConfig(config)) {
    return [];
  }
  return Object.keys(config).filter(
    (key) => !KNOWN_PRECOMMIT_CONFIG_KEYS.includes(key),
  );
}

/**
 * Reads the optional `precommitChecks` object from package.json in the cwd.
 * @returns {object} The config object, or {} if absent/unreadable/malformed.
 */
export function loadPrecommitConfig() {
  try {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const config = pkg && pkg.precommitChecks;
    return isPlainConfig(config) ? config : {};
  } catch {
    return {};
  }
}
