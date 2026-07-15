// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELEASE_STATES,
  artifactDigests,
  classifyReleaseState,
  expectedRelease,
  inspectReleaseState,
  releaseOutputs,
  requireNpmBoundary,
  validateArtifactBasenames,
} from "../tools/release-recovery.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "4.5.6";
const TAG = `v${VERSION}`;
const COMMIT = "a".repeat(40);
const REPOSITORY = "RoryGlenn/commitment-issues";
const TARBALL = Buffer.from("the exact packed release artifact\n");

function expected() {
  return expectedRelease({
    version: VERSION,
    tag: TAG,
    commit: COMMIT,
    repository: REPOSITORY,
    tarballBytes: TARBALL,
  });
}

function bundle(statement, extra = {}) {
  return {
    mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.3",
    verificationMaterial: { certificate: { rawBytes: "test-certificate" } },
    dsseEnvelope: {
      payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      payloadType: "application/vnd.in-toto+json",
      signatures: [{ sig: "test-signature" }],
    },
    ...extra,
  };
}

function npmStatement(release, { commit = release.commit } = {}) {
  const source = `git+https://github.com/${release.repository}@refs/tags/${release.tag}`;
  return {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        name: `pkg:npm/${release.packageName}@${release.version}`,
        digest: { sha512: release.tarballDigests.sha512 },
      },
    ],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: `refs/tags/${release.tag}`,
            repository: `https://github.com/${release.repository}`,
            path: ".github/workflows/publish.yml",
          },
        },
        resolvedDependencies: [{ uri: source, digest: { gitCommit: commit } }],
      },
    },
  };
}

function githubProvenance(
  release,
  { commit = release.commit, extra = {} } = {},
) {
  const source = `git+https://github.com/${release.repository}@refs/tags/${release.tag}`;
  return Buffer.from(
    JSON.stringify(
      bundle(
        {
          _type: "https://in-toto.io/Statement/v0.1",
          predicateType: "https://slsa.dev/provenance/v0.2",
          subject: [
            {
              name: release.tarballName,
              digest: { sha256: release.tarballDigests.sha256 },
            },
          ],
          predicate: {
            invocation: {
              configSource: {
                uri: source,
                digest: { sha1: commit },
                entryPoint: ".github/workflows/publish.yml",
              },
            },
            materials: [{ uri: source, digest: { sha1: commit } }],
          },
        },
        extra,
      ),
    ),
  );
}

function npmObservation(release, { tarballBytes = TARBALL, commit } = {}) {
  const digests = artifactDigests(tarballBytes);
  return {
    metadata: {
      name: release.packageName,
      version: release.version,
      dist: {
        tarball: `https://registry.npmjs.org/${release.packageName}/-/${release.tarballName}`,
        integrity: digests.integrity,
        shasum: digests.sha1,
        attestations: {
          url: `https://registry.npmjs.org/-/npm/v1/attestations/${release.packageName}@${release.version}`,
        },
      },
    },
    tarballBytes,
    attestations: {
      attestations: [
        {
          predicateType: "https://slsa.dev/provenance/v1",
          bundle: bundle(npmStatement(release, { commit })),
        },
      ],
    },
    packument: { "dist-tags": { latest: release.version } },
  };
}

function asset(name, bytes) {
  const content = Buffer.from(bytes);
  return {
    id: name.endsWith(".intoto.jsonl") ? 2 : name.endsWith(".tgz") ? 1 : 3,
    name,
    state: "uploaded",
    size: content.length,
    digest: `sha256:${artifactDigests(content).sha256}`,
    url: "https://api.github.com/repos/RoryGlenn/commitment-issues/releases/assets/1",
    bytes: content,
  };
}

function githubRelease(
  release,
  { draft = false, assets = [], immutable = !draft } = {},
) {
  return {
    id: 123,
    tag_name: release.tag,
    draft,
    prerelease: false,
    immutable,
    assets,
  };
}

test("classifies the three idempotent release states", () => {
  const release = expected();
  const npm = npmObservation(release);
  const provenance = githubProvenance(release);
  const complete = githubRelease(release, {
    assets: [
      asset(release.tarballName, TARBALL),
      asset(release.provenanceName, provenance),
    ],
  });

  assert.equal(
    classifyReleaseState({ expected: release }),
    RELEASE_STATES.BEFORE_NPM,
  );
  assert.equal(
    classifyReleaseState({ expected: release, npm }),
    RELEASE_STATES.AFTER_NPM,
  );
  assert.equal(
    classifyReleaseState({ expected: release, npm, releases: [complete] }),
    RELEASE_STATES.COMPLETE,
  );
});

test("allows only empty or exact subsets on a mutable draft", () => {
  const release = expected();
  const npm = npmObservation(release);
  const provenance = githubProvenance(release);
  const exactAssets = [
    asset(release.tarballName, TARBALL),
    asset(release.provenanceName, provenance),
  ];

  for (const assets of [[], exactAssets.slice(0, 1), exactAssets]) {
    assert.equal(
      classifyReleaseState({
        expected: release,
        npm,
        releases: [githubRelease(release, { draft: true, assets })],
        localProvenanceBytes: provenance,
      }),
      RELEASE_STATES.AFTER_NPM,
    );
  }
});

test("fails closed on npm artifact and source mismatches", () => {
  const release = expected();
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm: npmObservation(release, {
          tarballBytes: Buffer.from("different public bytes"),
        }),
      }),
    /different tarball bytes.*new patch version is mandatory/u,
  );
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm: npmObservation(release, { commit: "b".repeat(40) }),
      }),
    /source commit does not match/u,
  );
});

test("fails closed on conflicting drafts and immutable partial releases", () => {
  const release = expected();
  const npm = npmObservation(release);
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm,
        releases: [
          githubRelease(release, {
            draft: true,
            assets: [asset("unexpected.zip", Buffer.from("unknown"))],
          }),
        ],
      }),
    /unexpected asset/u,
  );
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm,
        releases: [
          githubRelease(release, {
            assets: [asset(release.tarballName, TARBALL)],
          }),
        ],
      }),
    /immutable GitHub Release is empty or partial.*new patch version is mandatory/u,
  );
});

test("fails closed on mismatched GitHub provenance and duplicate releases", () => {
  const release = expected();
  const npm = npmObservation(release);
  const wrongProvenance = githubProvenance(release, {
    commit: "b".repeat(40),
  });
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm,
        releases: [
          githubRelease(release, {
            draft: true,
            assets: [asset(release.provenanceName, wrongProvenance)],
          }),
        ],
      }),
    /source workflow does not match/u,
  );
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        releases: [
          githubRelease(release, { draft: true }),
          githubRelease(release, { draft: true }),
        ],
      }),
    /Multiple GitHub Releases/u,
  );
});

test("requires a new patch when a public release exists without npm", () => {
  const release = expected();
  const provenance = githubProvenance(release);
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        releases: [
          githubRelease(release, {
            assets: [
              asset(release.tarballName, TARBALL),
              asset(release.provenanceName, provenance),
            ],
          }),
        ],
      }),
    /GitHub Release or draft exists while npm is absent.*new patch version is mandatory/u,
  );
});

test("npm absence rejects even a compatible draft as out of order", () => {
  const release = expected();
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        releases: [githubRelease(release, { draft: true })],
      }),
    /Release or draft exists while npm is absent.*out of order.*new patch version is mandatory/u,
  );
});

test("draft finalization requires this run's exact signed provenance", () => {
  const release = expected();
  const npm = npmObservation(release);
  const remote = githubProvenance(release);
  const local = githubProvenance(release, {
    extra: { verificationMaterial: { different: true } },
  });
  const draft = githubRelease(release, {
    draft: true,
    assets: [asset(release.provenanceName, remote)],
  });
  assert.equal(
    classifyReleaseState({ expected: release, npm, releases: [draft] }),
    RELEASE_STATES.AFTER_NPM,
    "the initial read-only classification may accept semantically exact signed provenance",
  );
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm,
        releases: [draft],
        localProvenanceBytes: local,
      }),
    /draft provenance differs.*full rerun cannot finalize/u,
  );

  const complete = githubRelease(release, {
    assets: [
      asset(release.tarballName, TARBALL),
      asset(release.provenanceName, remote),
    ],
  });
  assert.equal(
    classifyReleaseState({
      expected: release,
      npm,
      releases: [complete],
      localProvenanceBytes: local,
    }),
    RELEASE_STATES.COMPLETE,
    "an immutable complete release is a no-op after semantic validation",
  );
});

test("unsigned or unverifiable provenance bundles fail closed", () => {
  const release = expected();
  const npm = npmObservation(release);
  npm.attestations.attestations[0].bundle.dsseEnvelope.signatures = [];
  assert.throws(
    () => classifyReleaseState({ expected: release, npm }),
    /not a DSSE provenance bundle/u,
  );

  const forged = githubProvenance(release, {
    extra: { verificationMaterial: {} },
  });
  assert.throws(
    () =>
      classifyReleaseState({
        expected: release,
        npm: npmObservation(release),
        releases: [
          githubRelease(release, {
            draft: true,
            assets: [asset(release.provenanceName, forged)],
          }),
        ],
      }),
    /has no verification material/u,
  );
});

test("deprecated incomplete npm versions never resume automatically", () => {
  const release = expected();
  const npm = npmObservation(release);
  npm.metadata.deprecated = "Incomplete release; use a later patch.";
  assert.throws(
    () => classifyReleaseState({ expected: release, npm }),
    /deprecated.*resume is blocked.*new patch version is mandatory/u,
  );

  const malformed = npmObservation(release);
  malformed.metadata.deprecated = { message: "unexpected shape" };
  assert.throws(
    () => classifyReleaseState({ expected: release, npm: malformed }),
    /malformed deprecation metadata.*state is unknown/u,
  );

  const provenance = githubProvenance(release);
  assert.equal(
    classifyReleaseState({
      expected: release,
      npm,
      releases: [
        githubRelease(release, {
          assets: [
            asset(release.tarballName, TARBALL),
            asset(release.provenanceName, provenance),
          ],
        }),
      ],
    }),
    RELEASE_STATES.COMPLETE,
    "an already complete immutable release remains an idempotent no-op",
  );
});

test("incomplete recovery requires npm latest to remain on the candidate", () => {
  const release = expected();
  const npm = npmObservation(release);
  npm.packument["dist-tags"].latest = "4.5.7";
  assert.throws(
    () => classifyReleaseState({ expected: release, npm }),
    /npm latest no longer points.*resume is blocked.*new patch version is mandatory/u,
  );

  const provenance = githubProvenance(release);
  assert.equal(
    classifyReleaseState({
      expected: release,
      npm,
      releases: [
        githubRelease(release, {
          assets: [
            asset(release.tarballName, TARBALL),
            asset(release.provenanceName, provenance),
          ],
        }),
      ],
    }),
    RELEASE_STATES.COMPLETE,
    "later dist-tag movement cannot turn a complete immutable release into a mutation",
  );
});

test("inspects npm bytes and authenticated GitHub drafts through mocked APIs", async () => {
  const release = expected();
  const npm = npmObservation(release);
  const officialTarball = asset(release.tarballName, TARBALL);
  delete officialTarball.bytes;
  const requested = [];
  const responses = new Map([
    [
      `https://registry.npmjs.org/${release.packageName}/${release.version}`,
      () => Response.json(npm.metadata),
    ],
    [npm.metadata.dist.tarball, () => new Response(TARBALL, { status: 200 })],
    [npm.metadata.dist.attestations.url, () => Response.json(npm.attestations)],
    [
      `https://registry.npmjs.org/${release.packageName}`,
      () => Response.json(npm.packument),
    ],
    [
      `https://api.github.com/repos/${release.repository}/releases?per_page=100&page=1`,
      () =>
        Response.json([
          githubRelease(release, {
            draft: true,
            assets: [asset("embedded-shape-is-not-authoritative.zip", "x")],
          }),
        ]),
    ],
    [
      `https://api.github.com/repos/${release.repository}/releases/123/assets?per_page=100&page=1`,
      () => Response.json([officialTarball]),
    ],
    [officialTarball.url, () => new Response(TARBALL, { status: 200 })],
  ]);
  const request = async (url, options) => {
    const key = String(url);
    requested.push({ key, options });
    const response = responses.get(key);
    assert.ok(response, `unexpected request: ${key}`);
    return response();
  };

  const result = await inspectReleaseState(
    {
      packageName: release.packageName,
      version: release.version,
      tag: release.tag,
      commit: release.commit,
      repository: release.repository,
      githubToken: "read-only-test-token",
      tarballBytes: TARBALL,
    },
    { request },
  );

  assert.equal(result.state, RELEASE_STATES.AFTER_NPM);
  assert.deepEqual(
    result.releases[0].assets.map(({ name }) => name),
    [release.tarballName],
    "the authenticated release-assets endpoint, not embedded list data, is authoritative",
  );
  const githubRequest = requested.find(({ key }) =>
    key.startsWith("https://api.github.com/"),
  );
  assert.equal(
    githubRequest.options.headers.Authorization,
    "Bearer read-only-test-token",
  );
  assert.equal(
    requested
      .filter(({ key }) => key.startsWith("https://registry.npmjs.org/"))
      .some(({ options }) => "Authorization" in options.headers),
    false,
    "the GitHub token must never be sent to npm",
  );
});

test("remote API errors and untrusted artifact origins are never absence", async () => {
  const release = expected();
  await assert.rejects(
    inspectReleaseState(
      {
        ...release,
        githubToken: "test-token",
      },
      {
        request: async (url) => {
          if (String(url).startsWith("https://api.github.com/")) {
            return new Response(null, { status: 503 });
          }
          return new Response(null, { status: 404 });
        },
      },
    ),
    /GitHub Releases check failed with HTTP 503/u,
  );

  const npm = npmObservation(release);
  npm.metadata.dist.tarball = "https://example.com/substituted.tgz";
  await assert.rejects(
    inspectReleaseState(
      { ...release, githubToken: "test-token" },
      {
        request: async (url) => {
          if (String(url).startsWith("https://api.github.com/")) {
            return Response.json([]);
          }
          return Response.json(npm.metadata);
        },
      },
    ),
    /outside the trusted registry\.npmjs\.org origin/u,
  );
});

test("GitHub outputs expose only fixed states and booleans", () => {
  assert.deepEqual(releaseOutputs(RELEASE_STATES.BEFORE_NPM), {
    state: "before-npm",
    publish_npm: "true",
    release_needed: "true",
  });
  assert.deepEqual(releaseOutputs(RELEASE_STATES.AFTER_NPM), {
    state: "after-npm",
    publish_npm: "false",
    release_needed: "true",
  });
  assert.deepEqual(releaseOutputs(RELEASE_STATES.COMPLETE), {
    state: "complete",
    publish_npm: "false",
    release_needed: "false",
  });
  assert.throws(
    () => releaseOutputs("tampered\nvalue"),
    /Unknown release state/u,
  );
  assert.throws(
    () => requireNpmBoundary(RELEASE_STATES.BEFORE_NPM),
    /npm still does not contain/u,
  );
  assert.doesNotThrow(() => requireNpmBoundary(RELEASE_STATES.AFTER_NPM));
});

test("release CLI accepts only exact artifact basenames", () => {
  assert.deepEqual(
    validateArtifactBasenames({
      tarballPath: `/tmp/${expected().tarballName}`,
      provenancePath: `/tmp/${expected().provenanceName}`,
      version: VERSION,
    }),
    {
      tarballName: expected().tarballName,
      provenanceName: expected().provenanceName,
    },
  );
  assert.throws(
    () =>
      validateArtifactBasenames({
        tarballPath: "/tmp/renamed.tgz",
        version: VERSION,
      }),
    /exact basename commitment-issues-4\.5\.6\.tgz/u,
  );
  assert.throws(
    () =>
      validateArtifactBasenames({
        tarballPath: `/tmp/${expected().tarballName}`,
        provenancePath: "/tmp/renamed.intoto.jsonl",
        version: VERSION,
      }),
    /exact basename commitment-issues-4\.5\.6\.tgz\.intoto\.jsonl/u,
  );
});

test("the recovery helper is read-only", () => {
  const source = fs.readFileSync(
    path.join(root, "tools/release-recovery.mjs"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:execFile|spawn)Sync\(\s*["']npm["']|method:\s*["']DELETE["']/u,
  );
});
