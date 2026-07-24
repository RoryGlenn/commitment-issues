#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { artifactDigests } from "./lib/release-artifact.mjs";
import { normalizeReleaseVersion } from "./release-preflight.mjs";
import { validateStageRecord } from "./release-stage.mjs";
import { validateReleaseMetadata } from "./validate-release-metadata.mjs";

const PACKAGE_NAME = "commitment-issues";
const REPOSITORY = "RoryGlenn/commitment-issues";
const WORKFLOW_PATH = ".github/workflows/publish.yml";
const NPM_REGISTRY = "https://registry.npmjs.org";
const GITHUB_API = "https://api.github.com";
const MAX_REMOTE_ARTIFACT_BYTES = 5 * 1024 * 1024;
const MAX_RELEASE_PAGES = 20;
const LEGACY_EMPTY_RELEASE_NOTE_VERSIONS = new Set(["3.3.0", "3.3.2"]);

export const NPM_PROPAGATION_RETRY_POLICY = Object.freeze({
  deadlineMs: 60_000,
  backoffMs: Object.freeze([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]),
});

export const RELEASE_STATES = Object.freeze({
  BEFORE_STAGE: "before-stage",
  STAGED: "staged",
  AFTER_NPM: "after-npm",
  COMPLETE: "complete",
});

function fail(message) {
  throw new Error(message);
}

export { artifactDigests };

function exactArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    fail(
      `${label} must contain exactly ${length} item${length === 1 ? "" : "s"}.`,
    );
  }
  return value;
}

function decodeStatement(bundle, label) {
  const envelope = bundle?.dsseEnvelope;
  const verificationMaterial = bundle?.verificationMaterial;
  if (
    !verificationMaterial ||
    typeof verificationMaterial !== "object" ||
    Array.isArray(verificationMaterial) ||
    Object.keys(verificationMaterial).length === 0
  ) {
    fail(`${label} has no verification material.`);
  }
  if (
    !envelope ||
    envelope.payloadType !== "application/vnd.in-toto+json" ||
    typeof envelope.payload !== "string" ||
    !Array.isArray(envelope.signatures) ||
    envelope.signatures.length === 0 ||
    envelope.signatures.some(
      (signature) =>
        typeof signature?.sig !== "string" || !signature.sig.trim(),
    )
  ) {
    fail(`${label} is not a DSSE provenance bundle.`);
  }

  try {
    return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
  } catch {
    fail(`${label} contains an unreadable provenance statement.`);
  }
}

function expectedSourceUri(expected) {
  return `git+https://github.com/${expected.repository}@refs/tags/${expected.tag}`;
}

function validateNpmProvenance(attestations, expected) {
  const entries = attestations?.attestations;
  if (!Array.isArray(entries)) {
    fail("npm did not return a provenance attestation list.");
  }

  const matches = entries.filter(
    (entry) => entry?.predicateType === "https://slsa.dev/provenance/v1",
  );
  exactArray(matches, 1, "npm SLSA provenance");
  const statement = decodeStatement(matches[0].bundle, "npm SLSA provenance");
  const subject = exactArray(statement.subject, 1, "npm provenance subject")[0];
  const expectedSubject = `pkg:npm/${expected.packageName}@${expected.version}`;

  if (
    statement.predicateType !== "https://slsa.dev/provenance/v1" ||
    subject?.name !== expectedSubject ||
    subject?.digest?.sha512 !== expected.tarballDigests.sha512
  ) {
    fail("npm provenance does not name the exact package artifact.");
  }

  const build = statement.predicate?.buildDefinition;
  const workflow = build?.externalParameters?.workflow;
  if (
    workflow?.ref !== `refs/tags/${expected.tag}` ||
    workflow?.repository !== `https://github.com/${expected.repository}` ||
    workflow?.path !== WORKFLOW_PATH
  ) {
    fail(
      "npm provenance source workflow does not match the immutable release tag.",
    );
  }

  const sourceUri = expectedSourceUri(expected);
  const source = build?.resolvedDependencies?.filter(
    (dependency) =>
      dependency?.uri === sourceUri &&
      dependency?.digest?.gitCommit === expected.commit,
  );
  if (!Array.isArray(source) || source.length !== 1) {
    fail("npm provenance source commit does not match the release tag commit.");
  }
}

function validateGithubProvenance(bytes, expected, label) {
  let bundle;
  try {
    bundle = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON.`);
  }

  const statement = decodeStatement(bundle, label);
  const subject = exactArray(statement.subject, 1, `${label} subject`)[0];
  if (
    statement.predicateType !== "https://slsa.dev/provenance/v0.2" ||
    subject?.name !== expected.tarballName ||
    subject?.digest?.sha256 !== expected.tarballDigests.sha256
  ) {
    fail(`${label} does not name the exact release tarball.`);
  }

  const sourceUri = expectedSourceUri(expected);
  const config = statement.predicate?.invocation?.configSource;
  if (
    config?.uri !== sourceUri ||
    config?.digest?.sha1 !== expected.commit ||
    config?.entryPoint !== WORKFLOW_PATH
  ) {
    fail(`${label} source workflow does not match the immutable release tag.`);
  }

  const source = statement.predicate?.materials?.filter(
    (material) =>
      material?.uri === sourceUri && material?.digest?.sha1 === expected.commit,
  );
  if (!Array.isArray(source) || source.length !== 1) {
    fail(`${label} source material does not match the release tag commit.`);
  }
}

function validateNpmIdentity(metadata, expected) {
  if (
    metadata?.name !== expected.packageName ||
    metadata?.version !== expected.version
  ) {
    fail("npm returned package identity that does not match the release.");
  }
}

function validateNpmArtifact(metadata, tarballBytes, expected) {
  const remoteBytes = Buffer.from(tarballBytes ?? []);
  const remoteDigests = artifactDigests(remoteBytes);
  if (
    remoteDigests.sha256 !== expected.tarballDigests.sha256 ||
    remoteDigests.integrity !== expected.tarballDigests.integrity
  ) {
    fail(
      "npm already has this version with different tarball bytes; a new patch version is mandatory.",
    );
  }

  if (
    metadata.dist?.integrity !== remoteDigests.integrity ||
    (metadata.dist?.shasum && metadata.dist.shasum !== remoteDigests.sha1)
  ) {
    fail("npm registry digest metadata does not match the downloaded tarball.");
  }
}

function validateNpmObservation(npm, expected) {
  validateNpmIdentity(npm?.metadata, expected);
  validateNpmArtifact(npm.metadata, npm.tarballBytes, expected);
  validateNpmProvenance(npm.attestations, expected);
}

function validateAsset(asset, expected, { exactProvenanceBytes = null } = {}) {
  if (asset?.state !== "uploaded") {
    fail(
      `GitHub Release asset ${asset?.name ?? "<unknown>"} is not fully uploaded.`,
    );
  }

  const bytes = Buffer.from(asset.bytes ?? []);
  if (bytes.length > MAX_REMOTE_ARTIFACT_BYTES) {
    fail(
      `GitHub Release asset ${asset.name} exceeds the recovery inspection limit.`,
    );
  }
  const digest = artifactDigests(bytes).sha256;
  if (asset.digest !== `sha256:${digest}` || asset.size !== bytes.length) {
    fail(
      `GitHub Release asset ${asset.name} digest metadata does not match its bytes.`,
    );
  }

  if (asset.name === expected.tarballName) {
    if (digest !== expected.tarballDigests.sha256) {
      fail("GitHub Release tarball differs from the exact npm artifact.");
    }
    return;
  }

  if (asset.name === expected.provenanceName) {
    validateGithubProvenance(bytes, expected, "GitHub Release provenance");
    if (
      exactProvenanceBytes &&
      !bytes.equals(Buffer.from(exactProvenanceBytes))
    ) {
      fail(
        "The existing draft provenance differs from this run's signed provenance; a full rerun cannot finalize it.",
      );
    }
  }
}

function validateRelease(release, expected, localProvenanceBytes) {
  if (
    !Number.isSafeInteger(release?.id) ||
    release.id <= 0 ||
    release?.tag_name !== expected.tag ||
    release?.prerelease !== false ||
    typeof release?.draft !== "boolean"
  ) {
    fail("GitHub Release identity does not match the stable release tag.");
  }

  if (release.name !== expected.releaseTitle) {
    fail(
      `GitHub Release title must exactly match ${expected.releaseTitle}; received ${JSON.stringify(
        release.name ?? null,
      )}.`,
    );
  }
  const actualBody =
    typeof release.body === "string"
      ? release.body.replaceAll("\r\n", "\n").trimEnd()
      : "";
  const expectedBody = expected.releaseNotes.replaceAll("\r\n", "\n").trimEnd();
  const legacyEmptyBody =
    !release.draft &&
    expected.allowEmptyPublishedReleaseNotes === true &&
    actualBody === "";
  if (actualBody !== expectedBody && !legacyEmptyBody) {
    fail(
      "GitHub Release body does not match the reviewed CHANGELOG.md release notes.",
    );
  }

  const allowedNames = new Set([expected.tarballName, expected.provenanceName]);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const names = assets.map((asset) => asset?.name);
  const ids = assets.map((asset) => asset?.id);
  if (new Set(names).size !== names.length) {
    fail("GitHub Release contains duplicate asset names.");
  }
  if (
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    fail("GitHub Release contains invalid or duplicate asset identifiers.");
  }
  for (const name of names) {
    if (!allowedNames.has(name)) {
      fail(`GitHub Release contains unexpected asset ${name ?? "<unknown>"}.`);
    }
  }
  for (const asset of assets) {
    validateAsset(asset, expected, {
      exactProvenanceBytes: release.draft ? localProvenanceBytes : null,
    });
  }

  if (release.draft) {
    if (release.immutable === true) {
      fail("GitHub reported a draft release as immutable.");
    }
    return { kind: "draft", assetCount: assets.length };
  }

  if (release.immutable !== true) {
    fail(
      "The published GitHub Release is not immutable; refusing automated recovery.",
    );
  }
  if (assets.length !== allowedNames.size) {
    fail(
      "The published immutable GitHub Release is empty or partial; a new patch version is mandatory.",
    );
  }
  return { kind: "published", assetCount: assets.length };
}

export function classifyReleaseState({
  expected,
  npm = null,
  releases = [],
  localProvenanceBytes = null,
  stageRecord = null,
  expectedStageId = null,
  sourceRunId = null,
}) {
  if (!expected || !Buffer.isBuffer(expected.tarballBytes)) {
    fail("Expected release identity and exact tarball bytes are required.");
  }
  if (!Array.isArray(releases)) {
    fail("GitHub Release observations must be an array.");
  }

  const normalized = normalizeReleaseVersion(expected.version);
  if (
    expected.packageName !== PACKAGE_NAME ||
    expected.repository !== REPOSITORY ||
    expected.tag !== `v${normalized}` ||
    !/^[0-9a-f]{40}$/u.test(expected.commit) ||
    expected.releaseTitle !== expected.tag ||
    typeof expected.releaseNotes !== "string" ||
    !expected.releaseNotes.trim() ||
    typeof expected.allowEmptyPublishedReleaseNotes !== "boolean" ||
    (expected.allowEmptyPublishedReleaseNotes &&
      !LEGACY_EMPTY_RELEASE_NOTE_VERSIONS.has(normalized))
  ) {
    fail(
      "Release package, repository, tag, commit, title, or reviewed notes identity is invalid.",
    );
  }

  const computed = artifactDigests(expected.tarballBytes);
  if (
    expected.tarballDigests?.sha256 !== computed.sha256 ||
    expected.tarballDigests?.integrity !== computed.integrity
  ) {
    fail("Expected tarball digest does not match the supplied artifact bytes.");
  }
  if (localProvenanceBytes) {
    validateGithubProvenance(
      localProvenanceBytes,
      expected,
      "Local signed provenance",
    );
  }

  if (releases.length > 1) {
    fail(
      "Multiple GitHub Releases use the same tag; refusing ambiguous recovery.",
    );
  }
  const releaseObservation = releases[0]
    ? validateRelease(releases[0], expected, localProvenanceBytes)
    : { kind: "absent", assetCount: 0 };
  const releaseKind = releaseObservation.kind;
  const validatedStageRecord = stageRecord
    ? validateStageRecord(stageRecord, expected, {
        expectedStageId,
        sourceRunId,
      })
    : null;

  if (!npm) {
    if (releaseKind === "published") {
      fail(
        "A published GitHub Release exists while npm is absent; the release is inconsistent and a new patch version is mandatory.",
      );
    }
    if (validatedStageRecord) return RELEASE_STATES.STAGED;
    if (releaseKind !== "absent") {
      fail(
        "A GitHub Release draft exists before npm staging has a durable exact-candidate record.",
      );
    }
    return RELEASE_STATES.BEFORE_STAGE;
  }

  validateNpmObservation(npm, expected);
  if (releaseKind === "published") return RELEASE_STATES.COMPLETE;
  if (
    validatedStageRecord &&
    (releaseKind !== "draft" || releaseObservation.assetCount !== 2)
  ) {
    fail(
      "The approved npm stage does not have one complete exact GitHub Release draft; finalization is blocked.",
    );
  }
  if (npm.packument?.["dist-tags"]?.latest !== expected.version) {
    fail(
      "npm latest no longer points to this incomplete version; automated resume is blocked and a new patch version is mandatory.",
    );
  }
  const deprecated = npm.metadata?.deprecated;
  if (deprecated !== undefined && typeof deprecated !== "string") {
    fail(
      "npm returned malformed deprecation metadata; automated recovery state is unknown.",
    );
  }
  if (deprecated?.trim()) {
    fail(
      "npm marks this incomplete version as deprecated; automated resume is blocked and a new patch version is mandatory.",
    );
  }
  return RELEASE_STATES.AFTER_NPM;
}

function assertHttpsHost(input, host, label) {
  let url;
  try {
    url = new URL(input);
  } catch {
    fail(`${label} URL is invalid.`);
  }
  if (url.protocol !== "https:" || url.hostname !== host) {
    fail(`${label} URL is outside the trusted ${host} origin.`);
  }
  return url;
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
}

async function readBytes(response, label) {
  const declaredSize = Number(response.headers?.get?.("content-length"));
  if (
    Number.isFinite(declaredSize) &&
    declaredSize > MAX_REMOTE_ARTIFACT_BYTES
  ) {
    fail(`${label} exceeds the recovery inspection limit.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_REMOTE_ARTIFACT_BYTES) {
    fail(`${label} exceeds the recovery inspection limit.`);
  }
  return bytes;
}

function githubHeaders(token, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "commitment-issues-release-recovery",
  };
}

function npmHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": "commitment-issues-release-recovery",
  };
}

async function requireStatus(response, expectedStatus, label) {
  if (response.status !== expectedStatus) {
    fail(`${label} check failed with HTTP ${response.status}.`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function npmPropagationError(label) {
  fail(
    `${label} remained unavailable with HTTP 404; the npm propagation retry budget was exhausted or its ${NPM_PROPAGATION_RETRY_POLICY.deadlineMs / 1_000}-second deadline left no room for another bounded retry.`,
  );
}

function npmPropagationDeadlineError() {
  fail(
    `npm propagation inspection exceeded its ${NPM_PROPAGATION_RETRY_POLICY.deadlineMs / 1_000}-second deadline.`,
  );
}

async function withNpmDeadline(propagation, operation) {
  if (!propagation) return operation();

  const remaining = Math.ceil(propagation.deadlineAt - propagation.now());
  if (remaining <= 0) {
    npmPropagationDeadlineError();
  }

  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = propagation.scheduleTimeout(() => {
      controller.abort();
      reject(new Error("npm propagation inspection deadline elapsed"));
    }, remaining);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } catch (error) {
    if (controller.signal.aborted) {
      npmPropagationDeadlineError();
    }
    throw error;
  } finally {
    propagation.cancelTimeout(timer);
  }
}

async function requestNpmResource(request, url, options, propagation, inspect) {
  return withNpmDeadline(propagation, async (signal) => {
    const response = await request(
      url,
      signal ? { ...options, signal } : options,
    );
    return inspect(response);
  });
}

async function retryNpmNotFound(label, propagation) {
  const delay = NPM_PROPAGATION_RETRY_POLICY.backoffMs[propagation.retryIndex];
  const remaining = propagation.deadlineAt - propagation.now();
  if (delay === undefined || delay >= remaining) {
    npmPropagationError(label);
  }

  propagation.onRetry({
    label,
    delayMs: delay,
    attempt: propagation.retryIndex + 2,
    maxAttempts: NPM_PROPAGATION_RETRY_POLICY.backoffMs.length + 1,
  });
  propagation.retryIndex += 1;
  await propagation.sleep(delay);
}

async function fetchNpmObservation(expected, request, propagation = null) {
  const metadataUrl = `${NPM_REGISTRY}/${encodeURIComponent(expected.packageName)}/${encodeURIComponent(expected.version)}`;
  while (true) {
    const metadataResult = await requestNpmResource(
      request,
      metadataUrl,
      {
        headers: npmHeaders(),
        redirect: "error",
      },
      propagation,
      async (response) => {
        if (response.status === 404) return { notFound: true };
        await requireStatus(response, 200, "npm package");
        const metadata = await readJson(response, "npm package");
        validateNpmIdentity(metadata, expected);
        return { notFound: false, metadata };
      },
    );
    if (metadataResult.notFound) {
      if (!propagation) return null;
      await retryNpmNotFound("npm package", propagation);
      continue;
    }
    const { metadata } = metadataResult;

    const tarballUrl = assertHttpsHost(
      metadata?.dist?.tarball,
      "registry.npmjs.org",
      "npm tarball",
    );
    const tarballBytes = await requestNpmResource(
      request,
      tarballUrl,
      {
        headers: { "User-Agent": "commitment-issues-release-recovery" },
        redirect: "error",
      },
      propagation,
      async (response) => {
        await requireStatus(response, 200, "npm tarball");
        const bytes = await readBytes(response, "npm tarball");
        validateNpmArtifact(metadata, bytes, expected);
        return bytes;
      },
    );

    const attestationUrl = assertHttpsHost(
      metadata?.dist?.attestations?.url,
      "registry.npmjs.org",
      "npm attestation",
    );
    const attestationResult = await requestNpmResource(
      request,
      attestationUrl,
      {
        headers: npmHeaders(),
        redirect: "error",
      },
      propagation,
      async (response) => {
        if (response.status === 404) return { notFound: true };
        await requireStatus(response, 200, "npm attestation");
        const attestations = await readJson(response, "npm attestation");
        validateNpmProvenance(attestations, expected);
        return { notFound: false, attestations };
      },
    );
    if (attestationResult.notFound && propagation) {
      await retryNpmNotFound("npm attestation", propagation);
      continue;
    }
    if (attestationResult.notFound) {
      fail("npm attestation check failed with HTTP 404.");
    }
    const { attestations } = attestationResult;

    const packument = await requestNpmResource(
      request,
      `${NPM_REGISTRY}/${encodeURIComponent(expected.packageName)}`,
      {
        headers: npmHeaders(),
        redirect: "error",
      },
      propagation,
      async (response) => {
        await requireStatus(response, 200, "npm packument");
        return readJson(response, "npm packument");
      },
    );

    return { metadata, tarballBytes, attestations, packument };
  }
}

async function fetchGithubReleases(expected, token, request) {
  const releases = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const url = `${GITHUB_API}/repos/${expected.repository}/releases?per_page=100&page=${page}`;
    const response = await request(url, {
      headers: githubHeaders(token),
      redirect: "error",
    });
    await requireStatus(response, 200, "GitHub Releases");
    const pageReleases = await readJson(response, "GitHub Releases");
    if (!Array.isArray(pageReleases)) {
      fail("GitHub Releases returned an invalid list.");
    }
    releases.push(
      ...pageReleases.filter((release) => release?.tag_name === expected.tag),
    );
    if (pageReleases.length < 100) break;
    if (page === MAX_RELEASE_PAGES) {
      fail(
        "GitHub Releases pagination exceeded the recovery inspection limit.",
      );
    }
  }

  const expectedNames = new Set([
    expected.tarballName,
    expected.provenanceName,
  ]);
  for (const release of releases) {
    if (!Number.isSafeInteger(release?.id) || release.id <= 0) {
      fail("GitHub Release is missing an exact numeric identifier.");
    }
    const assets = [];
    for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
      const url = `${GITHUB_API}/repos/${expected.repository}/releases/${release.id}/assets?per_page=100&page=${page}`;
      const response = await request(url, {
        headers: githubHeaders(token),
        redirect: "error",
      });
      await requireStatus(response, 200, "GitHub Release assets");
      const pageAssets = await readJson(response, "GitHub Release assets");
      if (!Array.isArray(pageAssets)) {
        fail("GitHub Release assets returned an invalid list.");
      }
      assets.push(...pageAssets);
      if (pageAssets.length < 100) break;
      if (page === MAX_RELEASE_PAGES) {
        fail(
          "GitHub Release asset pagination exceeded the recovery inspection limit.",
        );
      }
    }
    release.assets = assets;
    for (const asset of assets) {
      if (!expectedNames.has(asset?.name)) continue;
      const assetUrl = assertHttpsHost(
        asset.url,
        "api.github.com",
        "GitHub Release asset",
      );
      const response = await request(assetUrl, {
        headers: githubHeaders(token, "application/octet-stream"),
        redirect: "follow",
      });
      await requireStatus(response, 200, `GitHub Release asset ${asset.name}`);
      asset.bytes = await readBytes(
        response,
        `GitHub Release asset ${asset.name}`,
      );
    }
  }
  return releases;
}

export function validateSourceWorkflowRun(run, expected, stageRecord) {
  if (
    !run ||
    typeof run !== "object" ||
    Array.isArray(run) ||
    run.id !== Number(stageRecord.workflowRunId) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < Number(stageRecord.workflowRunAttempt) ||
    run.event !== "push" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_branch !== expected.tag ||
    run.head_sha !== expected.commit ||
    run.path !== WORKFLOW_PATH ||
    run.repository?.full_name !== expected.repository
  ) {
    fail(
      "The selected source workflow run is not the successful tag run that created this staged candidate.",
    );
  }
  return run;
}

async function fetchSourceWorkflowRun(
  expected,
  stageRecord,
  sourceRunId,
  token,
  request,
) {
  if (sourceRunId === null) return null;
  const normalized = String(sourceRunId);
  if (!/^[1-9][0-9]*$/u.test(normalized)) {
    fail("Source workflow run ID must be a positive integer.");
  }
  const response = await request(
    `${GITHUB_API}/repos/${expected.repository}/actions/runs/${normalized}`,
    {
      headers: githubHeaders(token),
      redirect: "error",
    },
  );
  await requireStatus(response, 200, "Source workflow run");
  const run = await readJson(response, "Source workflow run");
  return validateSourceWorkflowRun(run, expected, stageRecord);
}

export function expectedRelease({
  packageName = PACKAGE_NAME,
  version,
  tag,
  commit,
  repository = REPOSITORY,
  tarballBytes,
  releaseTitle,
  releaseNotes,
  allowEmptyPublishedReleaseNotes = false,
}) {
  const normalized = normalizeReleaseVersion(version);
  const tarballName = `${packageName}-${normalized}.tgz`;
  const bytes = Buffer.from(tarballBytes);
  return {
    packageName,
    version: normalized,
    tag,
    commit,
    repository,
    tarballName,
    provenanceName: `${tarballName}.intoto.jsonl`,
    tarballBytes: bytes,
    tarballDigests: artifactDigests(bytes),
    releaseTitle,
    releaseNotes,
    allowEmptyPublishedReleaseNotes,
  };
}

export function validateArtifactBasenames({
  tarballPath,
  provenancePath = null,
  packageName = PACKAGE_NAME,
  version,
}) {
  const normalized = normalizeReleaseVersion(version);
  const tarballName = `${packageName}-${normalized}.tgz`;
  const provenanceName = `${tarballName}.intoto.jsonl`;
  if (path.basename(String(tarballPath ?? "")) !== tarballName) {
    fail(`Release tarball must use the exact basename ${tarballName}.`);
  }
  if (
    provenancePath !== null &&
    path.basename(String(provenancePath)) !== provenanceName
  ) {
    fail(`Release provenance must use the exact basename ${provenanceName}.`);
  }
  return { tarballName, provenanceName };
}

export async function inspectReleaseState(
  input,
  {
    request = fetch,
    retryNpmPropagation = false,
    sleep: wait = sleep,
    now = Date.now,
    scheduleTimeout = setTimeout,
    cancelTimeout = clearTimeout,
    onNpmPropagationRetry = () => {},
  } = {},
) {
  const expected = expectedRelease(input);
  const stageRecord = input.stageRecord
    ? validateStageRecord(input.stageRecord, expected, {
        expectedStageId: input.expectedStageId ?? null,
        sourceRunId: input.sourceRunId ?? null,
      })
    : null;
  const propagation = retryNpmPropagation
    ? {
        deadlineAt: now() + NPM_PROPAGATION_RETRY_POLICY.deadlineMs,
        now,
        sleep: wait,
        scheduleTimeout,
        cancelTimeout,
        onRetry: onNpmPropagationRetry,
        retryIndex: 0,
      }
    : null;
  const [npm, releases, sourceRun] = await Promise.all([
    fetchNpmObservation(expected, request, propagation),
    fetchGithubReleases(expected, input.githubToken, request),
    stageRecord
      ? fetchSourceWorkflowRun(
          expected,
          stageRecord,
          input.sourceRunId ?? null,
          input.githubToken,
          request,
        )
      : null,
  ]);
  const localProvenanceBytes = input.provenanceBytes
    ? Buffer.from(input.provenanceBytes)
    : null;
  const state = classifyReleaseState({
    expected,
    npm,
    releases,
    localProvenanceBytes,
    stageRecord,
    expectedStageId: input.expectedStageId ?? null,
    sourceRunId: input.sourceRunId ?? null,
  });
  return {
    state,
    expected,
    npmPresent: npm !== null,
    releases,
    sourceRun,
  };
}

export function releaseOutputs(state) {
  if (!Object.values(RELEASE_STATES).includes(state)) {
    fail(`Unknown release state '${state}'.`);
  }
  return {
    state,
    stage_npm: String(state === RELEASE_STATES.BEFORE_STAGE),
    finalize_release: String(state === RELEASE_STATES.AFTER_NPM),
    release_needed: String(state !== RELEASE_STATES.COMPLETE),
  };
}

export function requireNpmBoundary(state) {
  if (
    state === RELEASE_STATES.BEFORE_STAGE ||
    state === RELEASE_STATES.STAGED
  ) {
    fail(
      "npm still does not contain the exact staged release artifact; approval may be pending, rejected, or missing.",
    );
  }
}

export function requirePreparedDraftBoundary(result) {
  const release = result?.releases?.[0];
  if (
    result?.state !== RELEASE_STATES.STAGED ||
    result.releases.length !== 1 ||
    release?.draft !== true ||
    !Array.isArray(release.assets) ||
    release.assets.length !== 2
  ) {
    fail(
      "Maintainer approval requires one complete exact GitHub Release draft with both immutable assets.",
    );
  }
}

export function requireExpectedState(state, expectedStates) {
  const allowed = Array.isArray(expectedStates)
    ? expectedStates
    : [expectedStates];
  if (
    allowed.length === 0 ||
    allowed.some((value) => !Object.values(RELEASE_STATES).includes(value))
  ) {
    fail("Expected release states contain an unknown value.");
  }
  if (!allowed.includes(state)) {
    fail(
      `Release state ${state} does not match the required state${allowed.length === 1 ? "" : "s"} ${allowed.join(", ")}.`,
    );
  }
}

function parseArgs(argv) {
  const options = {
    requireNpm: false,
    requirePreparedDraft: false,
    expectedStates: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-npm") {
      options.requireNpm = true;
      continue;
    }
    if (argument === "--require-prepared-draft") {
      options.requirePreparedDraft = true;
      continue;
    }
    if (
      argument === "--tarball" ||
      argument === "--provenance" ||
      argument === "--stage-record" ||
      argument === "--source-run-id" ||
      argument === "--expected-stage-id" ||
      argument === "--expect-state"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${argument} requires a value.`);
      }
      if (argument === "--expect-state") {
        options.expectedStates.push(value);
        index += 1;
        continue;
      }
      const key = {
        "--tarball": "tarball",
        "--provenance": "provenance",
        "--stage-record": "stageRecord",
        "--source-run-id": "sourceRunId",
        "--expected-stage-id": "expectedStageId",
      }[argument];
      if (options[key]) fail(`${argument} may be provided only once.`);
      options[key] = value;
      index += 1;
      continue;
    }
    fail(`Unknown release recovery option '${argument}'.`);
  }
  if (!options.tarball) fail("--tarball is required.");
  if (
    (options.sourceRunId || options.expectedStageId) &&
    !options.stageRecord
  ) {
    fail("--source-run-id and --expected-stage-id require --stage-record.");
  }
  return options;
}

function readRegularFile(input, label) {
  const resolved = path.resolve(input);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`${label} does not exist.`);
  }
  if (!stat.isFile()) fail(`${label} is not a regular file.`);
  return fs.readFileSync(resolved);
}

function readJsonRegularFile(input, label) {
  try {
    return JSON.parse(readRegularFile(input, label).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON.`);
    throw error;
  }
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required for release recovery.`);
  return value;
}

function resolveGitCommit(ref, label) {
  const result = spawnSync(
    "git",
    ["rev-parse", "--verify", `${ref}^{commit}`],
    {
      encoding: "utf8",
    },
  );
  if (result.error || result.status !== 0) {
    fail(`Cannot resolve ${label}; refusing release recovery.`);
  }
  return result.stdout.trim();
}

function validateWorkflowSource(tag, commit) {
  const head = resolveGitCommit("HEAD", "the checked-out release commit");
  const tagged = resolveGitCommit(
    `refs/tags/${tag}`,
    `the immutable ${tag} tag`,
  );
  if (head !== commit || tagged !== commit) {
    fail(
      "The checked-out source, release tag, and GitHub event commit do not match.",
    );
  }
}

function appendGithubOutputs(file, outputs) {
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  fs.appendFileSync(file, `${lines}\n`, "utf8");
}

function escapeWorkflowCommand(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const version = normalizeReleaseVersion(packageJson.version);
  const tag = process.env.RELEASE_TAG || requireEnvironment("GITHUB_REF_NAME");
  const commit = process.env.RELEASE_COMMIT || requireEnvironment("GITHUB_SHA");
  const repository = requireEnvironment("GITHUB_REPOSITORY");
  const githubToken = requireEnvironment("GITHUB_TOKEN");
  const releaseMetadata = validateReleaseMetadata({ tag });
  if (
    packageJson.name !== PACKAGE_NAME ||
    repository !== REPOSITORY ||
    tag !== `v${version}` ||
    releaseMetadata.version !== version
  ) {
    fail("Package metadata and GitHub release identity do not match.");
  }
  validateArtifactBasenames({
    tarballPath: options.tarball,
    provenancePath: options.provenance ?? null,
    packageName: packageJson.name,
    version,
  });
  validateWorkflowSource(tag, commit);

  const result = await inspectReleaseState(
    {
      packageName: packageJson.name,
      version,
      tag,
      commit,
      repository,
      githubToken,
      tarballBytes: readRegularFile(options.tarball, "Release tarball"),
      releaseTitle: releaseMetadata.title,
      releaseNotes: releaseMetadata.notes,
      allowEmptyPublishedReleaseNotes:
        releaseMetadata.historical?.releaseNotesState === "legacy-empty",
      provenanceBytes: options.provenance
        ? readRegularFile(options.provenance, "Release provenance")
        : null,
      stageRecord: options.stageRecord
        ? readJsonRegularFile(options.stageRecord, "npm stage record")
        : null,
      sourceRunId: options.sourceRunId ?? null,
      expectedStageId: options.expectedStageId ?? null,
    },
    {
      retryNpmPropagation: options.requireNpm,
      onNpmPropagationRetry: ({ label, delayMs, attempt, maxAttempts }) => {
        console.log(
          `${label} returned HTTP 404; retrying in ${delayMs / 1_000}s (attempt ${attempt}/${maxAttempts}).`,
        );
      },
    },
  );
  if (options.requireNpm) requireNpmBoundary(result.state);
  if (options.requirePreparedDraft) requirePreparedDraftBoundary(result);
  if (options.expectedStates.length > 0) {
    requireExpectedState(result.state, options.expectedStates);
  }

  const releaseId = result.releases[0]?.id;
  const outputs = {
    ...releaseOutputs(result.state),
    release_id: releaseId ? String(releaseId) : "",
  };
  if (process.env.GITHUB_OUTPUT) {
    appendGithubOutputs(process.env.GITHUB_OUTPUT, outputs);
  }
  console.log(`Release recovery state: ${result.state}.`);
  console.log(
    `npm stage: ${outputs.stage_npm}; GitHub finalization: ${outputs.finalize_release}; downstream release work: ${outputs.release_needed}.`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(
      `::error title=Release recovery refused::${escapeWorkflowCommand(error.message)}`,
    );
    process.exitCode = 1;
  }
}
