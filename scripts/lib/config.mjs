import fs from "node:fs";

function isPlainConfig(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exposeTone(config) {
  if (config.tone === "fun") {
    process.env.COMMITMENT_ISSUES_TONE = "fun";
  } else {
    delete process.env.COMMITMENT_ISSUES_TONE;
  }
}

/**
 * Reads the optional `precommitChecks` object from package.json in the cwd.
 * @returns {object} The config object, or {} if absent/unreadable/malformed.
 */
export function loadPrecommitConfig() {
  try {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const config = pkg && pkg.precommitChecks;
    const normalized = isPlainConfig(config) ? config : {};
    exposeTone(normalized);
    return normalized;
  } catch {
    delete process.env.COMMITMENT_ISSUES_TONE;
    return {};
  }
}
