// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = "RoryGlenn/commitment-issues";
const NOTES_POLICY_CUTOFF = "3.3.2";
const LEDGER_PATH = path.join(".github", "release-history.json");
const REQUIRED_LEGACY = {
  "3.3.0": {
    classification: "published-partial-legacy-empty-notes",
    releaseNotesState: "legacy-empty",
    tagObjectSha: "b9647a366c076c6e5d5d6483eb9eff856f660d7a",
    commitSha: "a653c1d24a8d5fe920fdb285922c91c2ebd14d87",
    workflowId: 29191486951,
    workflowConclusion: "failure",
    npmState: "published",
    githubState: "published-partial",
    githubReleaseId: 352739498,
    replacement: "3.3.2",
  },
  "3.3.1": {
    classification: "consumed-tag-unpublished",
    releaseNotesState: "not-applicable",
    tagObjectSha: "93981768f8a1b9872fd36494b822b614a6338019",
    commitSha: "b37d060139717460c20ea0de87b38ca7e18d7d64",
    workflowId: 29193471004,
    workflowConclusion: "startup_failure",
    npmState: "absent",
    githubState: "absent",
    githubReleaseId: null,
    replacement: "3.3.2",
  },
  "3.3.2": {
    classification: "artifact-complete-legacy-empty-notes",
    releaseNotesState: "legacy-empty",
    tagObjectSha: "21eb70cee616ea47af7d6de412bf803a4fb14297",
    commitSha: "57ac737538af1d9d7da7e2c3415f1d7d39a5320d",
    workflowId: 29194551447,
    workflowConclusion: "success",
    npmState: "published",
    githubState: "published-complete",
    githubReleaseId: 352759537,
    replacement: null,
  },
};
const CLASSIFICATION_RULES = {
  "published-partial-legacy-empty-notes": {
    releaseNotesState: "legacy-empty",
    workflowConclusion: "failure",
    npmState: "published",
    githubState: "published-partial",
    assets: "empty",
    replacementRequired: true,
  },
  "consumed-tag-unpublished": {
    releaseNotesState: "not-applicable",
    workflowConclusion: "startup_failure",
    npmState: "absent",
    githubState: "absent",
    replacementRequired: true,
  },
  "artifact-complete-legacy-empty-notes": {
    releaseNotesState: "legacy-empty",
    workflowConclusion: "success",
    npmState: "published",
    githubState: "published-complete",
    assets: "complete",
    replacementRequired: false,
  },
};

function fail(message) {
  throw new Error(message);
}

function display(value) {
  if (value === undefined) return "<missing>";
  return JSON.stringify(value);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    fail(`Unable to read ${relativePath}: ${error.message}`);
  }
}

function readJson(root, relativePath) {
  const source = readText(root, relativePath);
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a JSON object; received ${display(value)}.`);
  }
}

function requireExactKeys(value, expectedKeys, label) {
  requireObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      `${label} must contain exactly ${expected.join(", ")}; received ${
        actual.length > 0 ? actual.join(", ") : "no fields"
      }.`,
    );
  }
}

function requireStableVersion(value, label) {
  if (typeof value !== "string" || !STABLE_SEMVER.test(value)) {
    fail(
      `${label} must be a stable semantic version; received ${display(value)}.`,
    );
  }
  return value;
}

function requireExactVersion(value, label) {
  if (typeof value !== "string" || !SEMVER.test(value)) {
    fail(
      `${label} must be an exact semantic version; received ${display(value)}.`,
    );
  }
  return value;
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function compareStableVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function validateWorkflowRun(workflowRun, entryLabel) {
  const label = `${entryLabel}.workflowRun`;
  requireExactKeys(workflowRun, ["conclusion", "id", "url"], label);
  if (!Number.isSafeInteger(workflowRun.id) || workflowRun.id <= 0) {
    fail(
      `${label}.id must be a positive integer; received ${display(workflowRun.id)}.`,
    );
  }
  if (typeof workflowRun.conclusion !== "string") {
    fail(`${label}.conclusion must be a string.`);
  }
  const expectedUrl = `https://github.com/${REPOSITORY}/actions/runs/${workflowRun.id}`;
  if (workflowRun.url !== expectedUrl) {
    fail(
      `${label}.url must be ${expectedUrl}; received ${display(workflowRun.url)}.`,
    );
  }
}

function validateNpmEvidence(npm, entry, entryLabel) {
  const label = `${entryLabel}.npm`;
  requireObject(npm, label);
  if (npm.state === "published") {
    requireExactKeys(npm, ["state", "url"], label);
    const expectedUrl = `https://www.npmjs.com/package/commitment-issues/v/${entry.version}`;
    if (npm.url !== expectedUrl) {
      fail(
        `${label}.url must be ${expectedUrl}; received ${display(npm.url)}.`,
      );
    }
    return;
  }
  if (npm.state === "absent") {
    requireExactKeys(npm, ["lookupUrl", "state"], label);
    const expectedUrl = `https://registry.npmjs.org/commitment-issues/${entry.version}`;
    if (npm.lookupUrl !== expectedUrl) {
      fail(
        `${label}.lookupUrl must be ${expectedUrl}; received ${display(npm.lookupUrl)}.`,
      );
    }
    return;
  }
  fail(
    `${label}.state must be published or absent; received ${display(npm.state)}.`,
  );
}

function validateGithubEvidence(githubRelease, entry, entryLabel) {
  const label = `${entryLabel}.githubRelease`;
  requireObject(githubRelease, label);
  if (githubRelease.state === "absent") {
    requireExactKeys(githubRelease, ["lookupUrl", "state"], label);
    const expectedUrl = `https://api.github.com/repos/${REPOSITORY}/releases/tags/${entry.tag}`;
    if (githubRelease.lookupUrl !== expectedUrl) {
      fail(
        `${label}.lookupUrl must be ${expectedUrl}; received ${display(
          githubRelease.lookupUrl,
        )}.`,
      );
    }
    return;
  }

  if (
    githubRelease.state !== "published-partial" &&
    githubRelease.state !== "published-complete"
  ) {
    fail(
      `${label}.state must be absent, published-partial, or published-complete; received ${display(
        githubRelease.state,
      )}.`,
    );
  }
  requireExactKeys(
    githubRelease,
    ["assets", "id", "immutable", "notes", "state", "title", "url"],
    label,
  );
  if (!Number.isSafeInteger(githubRelease.id) || githubRelease.id <= 0) {
    fail(
      `${label}.id must be a positive integer; received ${display(githubRelease.id)}.`,
    );
  }
  if (githubRelease.immutable !== true) {
    fail(`${label}.immutable must be true for a published historical release.`);
  }
  if (githubRelease.title !== entry.tag) {
    fail(
      `${label}.title must equal ${entry.tag}; received ${display(githubRelease.title)}.`,
    );
  }
  if (githubRelease.notes !== "empty") {
    fail(`${label}.notes must classify the legacy body as empty.`);
  }
  if (!new Set(["empty", "complete"]).has(githubRelease.assets)) {
    fail(`${label}.assets must be empty or complete.`);
  }
  const expectedUrl = `https://github.com/${REPOSITORY}/releases/tag/${entry.tag}`;
  if (githubRelease.url !== expectedUrl) {
    fail(
      `${label}.url must be ${expectedUrl}; received ${display(githubRelease.url)}.`,
    );
  }
}

function validateLedgerEntry(entry, index, cutoff) {
  const label = `${LEDGER_PATH}.releases[${index}]`;
  requireExactKeys(
    entry,
    [
      "classification",
      "commitSha",
      "githubRelease",
      "npm",
      "releaseNotesState",
      "replacement",
      "tag",
      "tagObjectSha",
      "version",
      "workflowRun",
    ],
    label,
  );
  requireStableVersion(entry.version, `${label}.version`);
  if (compareStableVersions(entry.version, cutoff) > 0) {
    fail(
      `${label}.version ${entry.version} is after the legacy-notes cutoff ${cutoff}.`,
    );
  }
  const expectedTag = `v${entry.version}`;
  if (entry.tag !== expectedTag) {
    fail(
      `${label}.tag must be ${expectedTag}; received ${display(entry.tag)}.`,
    );
  }
  for (const field of ["tagObjectSha", "commitSha"]) {
    if (typeof entry[field] !== "string" || !SHA.test(entry[field])) {
      fail(`${label}.${field} must be a lowercase 40-character Git SHA.`);
    }
  }
  if (entry.tagObjectSha === entry.commitSha) {
    fail(`${label} must record distinct annotated-tag and peeled-commit SHAs.`);
  }

  validateWorkflowRun(entry.workflowRun, label);
  validateNpmEvidence(entry.npm, entry, label);
  validateGithubEvidence(entry.githubRelease, entry, label);

  const rule = CLASSIFICATION_RULES[entry.classification];
  if (!rule) {
    fail(
      `${label}.classification is unsupported: ${display(entry.classification)}.`,
    );
  }
  if (entry.workflowRun.conclusion !== rule.workflowConclusion) {
    fail(
      `${label}.workflowRun.conclusion must be ${rule.workflowConclusion} for ${entry.classification}.`,
    );
  }
  if (
    !new Set(["reviewed", "legacy-empty", "not-applicable"]).has(
      entry.releaseNotesState,
    )
  ) {
    fail(
      `${label}.releaseNotesState must be reviewed, legacy-empty, or not-applicable.`,
    );
  }
  if (entry.releaseNotesState !== rule.releaseNotesState) {
    fail(`${label}.releaseNotesState contradicts ${entry.classification}.`);
  }
  if (entry.npm.state !== rule.npmState) {
    fail(`${label}.npm.state contradicts ${entry.classification}.`);
  }
  if (entry.githubRelease.state !== rule.githubState) {
    fail(`${label}.githubRelease.state contradicts ${entry.classification}.`);
  }
  if (rule.assets && entry.githubRelease.assets !== rule.assets) {
    fail(
      `${label}.githubRelease.assets must be ${rule.assets} for ${entry.classification}.`,
    );
  }

  if (rule.replacementRequired) {
    requireStableVersion(entry.replacement, `${label}.replacement`);
    if (compareStableVersions(entry.replacement, entry.version) <= 0) {
      fail(`${label}.replacement must be a later stable version.`);
    }
  } else if (entry.replacement !== null) {
    fail(`${label}.replacement must be null for an artifact-complete release.`);
  }
}

function validateRequiredLegacyEvidence(entries) {
  const byVersion = new Map(entries.map((entry) => [entry.version, entry]));
  for (const [version, expected] of Object.entries(REQUIRED_LEGACY)) {
    const entry = byVersion.get(version);
    if (!entry) {
      fail(
        `${LEDGER_PATH} must retain the historical ${version} classification.`,
      );
    }
    const actual = {
      classification: entry.classification,
      releaseNotesState: entry.releaseNotesState,
      tagObjectSha: entry.tagObjectSha,
      commitSha: entry.commitSha,
      workflowId: entry.workflowRun.id,
      workflowConclusion: entry.workflowRun.conclusion,
      npmState: entry.npm.state,
      githubState: entry.githubRelease.state,
      githubReleaseId: entry.githubRelease.id ?? null,
      replacement: entry.replacement,
    };
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (actual[field] !== expectedValue) {
        fail(
          `${LEDGER_PATH} historical ${version} ${field} must be ${display(
            expectedValue,
          )}; received ${display(actual[field])}.`,
        );
      }
    }
  }
}

function validateReleaseHistory(root) {
  const ledger = readJson(root, LEDGER_PATH);
  requireExactKeys(
    ledger,
    ["observedAt", "policy", "releases", "schemaVersion"],
    LEDGER_PATH,
  );
  if (ledger.schemaVersion !== 1) {
    fail(
      `${LEDGER_PATH}.schemaVersion must be 1; received ${display(ledger.schemaVersion)}.`,
    );
  }
  if (!validCalendarDate(ledger.observedAt)) {
    fail(`${LEDGER_PATH}.observedAt must be a real YYYY-MM-DD date.`);
  }
  requireExactKeys(
    ledger.policy,
    ["consumedTags", "releaseNotesRequiredAfter"],
    `${LEDGER_PATH}.policy`,
  );
  if (ledger.policy.releaseNotesRequiredAfter !== NOTES_POLICY_CUTOFF) {
    fail(
      `${LEDGER_PATH}.policy.releaseNotesRequiredAfter must remain ${NOTES_POLICY_CUTOFF}; received ${display(
        ledger.policy.releaseNotesRequiredAfter,
      )}.`,
    );
  }
  if (ledger.policy.consumedTags !== "immutable") {
    fail(`${LEDGER_PATH}.policy.consumedTags must be immutable.`);
  }
  if (!Array.isArray(ledger.releases) || ledger.releases.length === 0) {
    fail(`${LEDGER_PATH}.releases must be a nonempty array.`);
  }

  const versions = new Set();
  ledger.releases.forEach((entry, index) => {
    validateLedgerEntry(entry, index, NOTES_POLICY_CUTOFF);
    if (versions.has(entry.version)) {
      fail(`${LEDGER_PATH} contains duplicate version ${entry.version}.`);
    }
    versions.add(entry.version);
  });
  validateRequiredLegacyEvidence(ledger.releases);
  return ledger;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractReleaseNotes(changelog, version) {
  const escapedVersion = escapeRegExp(version);
  const versionInHeading = new RegExp(
    `(?:^|[^0-9A-Za-z])v?${escapedVersion}(?=$|[^0-9A-Za-z.+-])`,
    "u",
  );
  const canonical = new RegExp(
    `^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`,
    "u",
  );
  const headings = [...changelog.matchAll(/^##(?!#)[^\r\n]*$/gmu)].map(
    (match) => ({
      end: match.index + match[0].length,
      index: match.index,
      source: match[0],
    }),
  );
  const candidates = headings.filter(({ source }) =>
    versionInHeading.test(source),
  );

  if (candidates.length === 0) {
    fail(
      `CHANGELOG.md is missing a release heading for package.json version ${version}; expected ## [${version}] - YYYY-MM-DD.`,
    );
  }
  if (candidates.length > 1) {
    fail(
      `CHANGELOG.md contains duplicate release headings for ${version}; expected exactly one.`,
    );
  }

  const heading = candidates[0];
  const match = heading.source.match(canonical);
  if (!match) {
    fail(
      `CHANGELOG.md heading ${display(
        heading.source,
      )} is malformed; expected ## [${version}] - YYYY-MM-DD.`,
    );
  }
  if (!validCalendarDate(match[1])) {
    fail(
      `CHANGELOG.md heading for ${version} has invalid date ${display(match[1])}; expected a real YYYY-MM-DD date.`,
    );
  }

  const nextHeading = headings.find(({ index }) => index > heading.index);
  const notes = changelog.slice(heading.end, nextHeading?.index).trim();
  const substantive = notes
    .replace(/<!--[\s\S]*?-->/gu, "")
    .split(/\r?\n/gu)
    .filter((line) => !/^\s*#{1,6}(?:\s|$)/u.test(line))
    .join("\n");
  if (!/[\p{L}\p{N}]/u.test(substantive)) {
    fail(
      `CHANGELOG.md section ${version} must contain substantive reviewed release notes.`,
    );
  }
  return notes;
}

function validateLockVersion(lock, version) {
  if (lock.version !== version) {
    fail(
      `package-lock.json top-level version must match package.json version ${version}; received ${display(
        lock.version,
      )}.`,
    );
  }
  const rootVersion = lock.packages?.[""]?.version;
  if (rootVersion !== version) {
    fail(
      `package-lock.json packages[""] version must match package.json version ${version}; received ${display(
        rootVersion,
      )}.`,
    );
  }
}

function writeNotesFile(root, notesFile, notes) {
  if (typeof notesFile !== "string" || notesFile.trim() === "") {
    fail(`notesFile must be a nonempty path; received ${display(notesFile)}.`);
  }
  const destination = path.resolve(root, notesFile);
  let parent;
  try {
    parent = fs.statSync(path.dirname(destination));
  } catch (error) {
    fail(`Unable to inspect notes output directory: ${error.message}`);
  }
  if (!parent.isDirectory()) {
    fail(
      `Notes output parent is not a directory: ${path.dirname(destination)}.`,
    );
  }
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(path.dirname(destination));
  const relativeParent = path.relative(realRoot, realParent);
  if (
    relativeParent === ".." ||
    relativeParent.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeParent)
  ) {
    fail(
      `Notes output directory must stay within the release root: ${path.dirname(
        destination,
      )}.`,
    );
  }
  const canonicalDestination = path.join(
    realParent,
    path.basename(destination),
  );
  const protectedInputs = [
    "package.json",
    "package-lock.json",
    "CHANGELOG.md",
    LEDGER_PATH,
  ].map((relativePath) => path.resolve(realRoot, relativePath));
  if (protectedInputs.includes(canonicalDestination)) {
    fail(`Refusing to overwrite release metadata input ${destination}.`);
  }
  try {
    const existing = fs.lstatSync(destination);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      fail(
        `Notes output must be a regular file when it already exists: ${destination}.`,
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    fs.writeFileSync(destination, `${notes}\n`, {
      encoding: "utf8",
      flag: "w",
      mode: 0o600,
    });
  } catch (error) {
    fail(
      `Unable to write reviewed release notes to ${destination}: ${error.message}`,
    );
  }
}

export function validateReleaseMetadata({
  root = process.cwd(),
  tag,
  notesFile,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const packageJson = readJson(resolvedRoot, "package.json");
  requireObject(packageJson, "package.json");
  const version = requireExactVersion(
    packageJson.version,
    "package.json version",
  );
  const expectedTag = `v${version}`;
  const releaseTag = tag ?? expectedTag;
  if (typeof releaseTag !== "string" || releaseTag !== expectedTag) {
    fail(
      `Release tag must exactly match package.json as ${expectedTag}; received ${display(
        releaseTag,
      )}.`,
    );
  }

  const packageLock = readJson(resolvedRoot, "package-lock.json");
  requireObject(packageLock, "package-lock.json");
  validateLockVersion(packageLock, version);
  const changelog = readText(resolvedRoot, "CHANGELOG.md");
  const notes = extractReleaseNotes(changelog, version);
  const ledger = validateReleaseHistory(resolvedRoot);
  const historical =
    ledger.releases.find((entry) => entry.version === version) ?? null;

  if (notesFile !== undefined) {
    writeNotesFile(resolvedRoot, notesFile, notes);
  }
  return {
    version,
    tag: releaseTag,
    title: releaseTag,
    notes,
    historical,
  };
}

function parseCliArgs(argv) {
  let tag;
  let notesFile;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--tag" && option !== "--notes-file") {
      fail(`Unknown release metadata option: ${option}`);
    }
    if (seen.has(option)) {
      fail(`${option} may be provided only once.`);
    }
    seen.add(option);
    const value = argv[index + 1];
    if (value === undefined || value === "--tag" || value === "--notes-file") {
      fail(`${option} requires a value.`);
    }
    index += 1;
    if (option === "--tag") tag = value;
    else notesFile = value;
  }
  return { notesFile, tag };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = validateReleaseMetadata(parseCliArgs(process.argv.slice(2)));
    console.log(
      `Release metadata is consistent for ${result.tag}; reviewed notes are nonempty.`,
    );
  } catch (error) {
    console.error(`release metadata validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
