import fs from "node:fs";

function isPlainConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
