# Release Verification

This document explains how `commitment-issues` releases are identified and how users can verify release provenance.

## Release identifiers

Official releases use unique semantic version identifiers, such as `3.3.2`.

Release identifiers appear in:

- the npm package version;
- both root version records in `package-lock.json`;
- the immutable `vX.Y.Z` Git tag and GitHub Release title; and
- exactly one dated `CHANGELOG.md` release entry.

## Release notes

For releases after v3.3.2, the workflow extracts the body beneath the matching
dated `CHANGELOG.md` heading and publishes it verbatim as a non-empty GitHub
Release body. `CHANGELOG.md` is the reviewed source; the Release is not a
separately maintained copy.

Before the release PR merges, a human must choose the correct semantic-version
impact and confirm that the extracted notes accurately describe functional,
breaking, and security-relevant changes when disclosure timing permits. The
validator catches structural drift but cannot judge editorial completeness:

```bash
npm run release:validate -- --tag vX.Y.Z
```

Historical irregularities are preserved in the machine-readable
`.github/release-history.json` ledger. It is not a prospective exception
mechanism: v3.3.0 and v3.3.2 have immutable Releases with legacy empty bodies,
while v3.3.1 consumed a tag but intentionally has no npm package or GitHub
Release. New releases must have exact reviewed notes.

## npm package provenance

Official npm releases should be published using npm trusted publishing and provenance when available.

Set the exact version you intend to verify; do not rely on the moving `latest`
tag:

```bash
VERSION=3.3.2
```

Users can inspect the registry integrity and signature metadata for an exact
version with:

```bash
npm view "commitment-issues@$VERSION" dist.integrity dist.signatures
```

To cryptographically verify npm registry signatures and provenance attestations,
install the exact version in a clean project and run npm's supported verifier:

```bash
mkdir commitment-issues-verification
cd commitment-issues-verification
npm init -y
npm install "commitment-issues@$VERSION" --ignore-scripts
npm audit signatures
```

The npm package page also shows the provenance badge and source-workflow
details when an attestation is available:

<https://www.npmjs.com/package/commitment-issues>

## SLSA provenance

The project release workflow publishes through GitHub Actions using npm trusted
publishing. npm associates the package with the GitHub workflow that produced
it and exposes a registry provenance attestation.

Users should verify that:

- the package name is `commitment-issues`;
- the version matches the intended release;
- the package is published from the expected GitHub repository;
- the provenance points to the expected GitHub Actions release workflow;
- the tarball integrity value matches npm metadata.

## Reviewed-mainline authorization

Provenance identifies the source commit, but it does not by itself prove that
the commit passed the repository's mainline process. Before any install, pack,
or publish-capable release step, the workflow fetches complete history and
fails unless the tagged commit is an ancestor of canonical `origin/main`.

Maintainers and independent verifiers can repeat that decision locally:

```bash
git fetch --no-tags origin \
  +refs/heads/main:refs/remotes/origin/main
git merge-base --is-ancestor \
  "v$VERSION^{commit}" refs/remotes/origin/main
```

Exit status zero means the tagged commit belongs to the current mainline
history; any other status must be treated as a failed release authorization.
Repository tag rules must separately restrict `v*` creation to the release
authority and prevent consumed tags from being updated or deleted. This
settings-owned boundary prevents a writer from supplying an off-main workflow
that omits the repository-controlled check.

## Verifying an installed package

To inspect the installed version:

```bash
npm ls commitment-issues
```

To inspect package metadata without installing:

```bash
npm view "commitment-issues@$VERSION" version dist.integrity repository license
```

To download the package tarball for inspection:

```bash
npm pack "commitment-issues@$VERSION"
```

## GitHub release assets

Beginning with v3.3.2, the npm and GitHub Release tarballs are byte-identical and
the matching signed `.intoto.jsonl` SLSA provenance asset names that artifact.
The Audit 7 workflow adds a stronger pre-publication invariant: it packs once,
passes that exact path to the lifecycle integration, confirms its CLI entry
point, shebang, and reported version on every platform, and enforces executable
and non-executable archive modes on the POSIX lanes and Ubuntu release producer.
Windows lanes independently verify the installed bin shim, shebang, version,
installability, and unchanged digest because Windows metadata does not carry
authoritative POSIX mode information. The workflow then hashes, publishes, and
retains the unchanged tarball as a workflow artifact. The provenance generator
retains its signed output separately. One final release action receives both
files before publishing the immutable GitHub Release, so no later job needs to
attach or replace an asset.

Download both assets from the release page and compare the GitHub tarball with
the tarball downloaded from npm:

```bash
npm pack "commitment-issues@$VERSION"
```

Then verify the GitHub tarball against its SLSA bundle with the official
[`slsa-verifier`](https://github.com/slsa-framework/slsa-verifier):

```bash
slsa-verifier verify-artifact "commitment-issues-$VERSION.tgz" \
  --provenance-path "commitment-issues-$VERSION.tgz.intoto.jsonl" \
  --source-uri github.com/RoryGlenn/commitment-issues \
  --source-tag "v$VERSION"
```

A successful verification proves that the signed statement names the tarball's
SHA-256, expected source repository and tag, builder identity, workflow entry
point, and source commit. npm's registry attestation is a separate publication
surface and should also pass `npm audit signatures`.

Generated binaries or opaque release artifacts should not be committed to the repository.

## Validated release baseline

v3.3.2 is the first release validated end to end against the artifact invariant:
the npm and GitHub tarballs are byte-identical, the SLSA subject names that
SHA-256, and independent `slsa-verifier` and npm signature checks pass. Its
immutable GitHub Release body is empty, so it is also the final documented
release-note exception before the prospective metadata gate.

Earlier fix-forward history remains immutable and should not be mistaken for
that baseline: v3.3.0 reached npm but its GitHub Release could not accept the
later provenance upload, and v3.3.1 consumed a tag before GitHub rejected the
reusable-workflow permission contract. Neither tag was moved or reused; v3.3.2
fixed forward with pre-merge workflow validation.

## Partial publication and recovery

A release crosses separate external boundaries. Classify all of them before
retrying a failed workflow:

| State                                        | Required evidence                                                                                                                                                                                                                               | Decision                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before npm                                   | The run is for the expected tag and commit; the exact npm version and every GitHub Release state, including drafts, are absent.                                                                                                                 | Retry the same run only when the failure is transient and the tagged source and workflow need no edits. Otherwise use a new patch.                                                |
| After npm, before a published GitHub Release | The npm tarball, npm provenance, `latest`, tag, source commit, workflow run, and rebuilt or retained tarball bytes match; any GitHub Release is still an unpublished draft with the exact reviewed title/body and no assets or an exact subset. | Prefer rerunning failed jobs. A full rerun additionally requires that the tagged workflow needs no edits and any draft does not already contain provenance from the original run. |
| Complete                                     | npm and an immutable GitHub Release contain the same tarball and matching provenance for the expected tag and commit, plus the exact validated title and reviewed changelog body.                                                               | No action; verification is idempotent.                                                                                                                                            |
| Inconsistent                                 | A service cannot be checked, source or digest differs, an unexpected asset exists, or a published release is empty or partial outside the fixed historical ledger.                                                                              | Fail closed, preserve the tag and public artifacts, record the incident, and release a new patch.                                                                                 |

The final release job cryptographically verifies the local SLSA bundle before
it inspects or publishes a draft. A draft's title and body must already match
the validated tag and reviewed changelog section, and every existing draft
asset must be byte-identical to the corresponding locally verified artifact.
An exact empty-asset or tarball-only subset may survive an exact full rerun. If
a draft already contains provenance, only a failed-job rerun retaining the
original provenance artifact can match those signed bytes; a full rerun must
stop and use a new patch. A draft with mismatched metadata or assets cannot be
overwritten as routine recovery. Once a release is published, its tag and
assets are immutable in this repository. A published empty or partial release
therefore cannot be completed later. Only the already-observed v3.3.0 and
v3.3.2 Releases may retain an empty body; the validator fixes that boundary in
`.github/release-history.json`, so no prospective release can claim it.

For a candidate retry, verify that the workflow event is a tag push, the run's
head SHA equals the tag's peeled commit, and npm provenance names
`RoryGlenn/commitment-issues`, `.github/workflows/publish.yml`, the exact tag,
and that same commit. An npm `E404` means the version is absent; any other
lookup failure is unknown state and must stop recovery.

An incomplete or draft release may resume automatically only while npm's
`dist-tags.latest` still equals the candidate version. If an owner rolled the
pointer back or a newer release moved it forward, automatic resume must stop.
Do not move `latest` merely to satisfy recovery; the owner must choose the
incident disposition and publish a new patch for any later automated release.

npm's `dist.integrity` and registry attestation subject use SHA-512. The
workflow's generic SLSA subject uses SHA-256. To prove byte identity, download
the exact npm tarball and calculate SHA-256 over those bytes before comparing
it with the rebuilt or retained workflow tarball and the SLSA subject. Do not
compare a SHA-512 integrity string directly with the workflow's SHA-256.

When every source and digest check matches, maintainers should prefer:

```bash
gh run rerun "$RUN_ID" --failed
```

This leaves a successful npm job untouched. A full rerun may be used only when
the tagged workflow itself needs no edit and its `tools/release-recovery.mjs`
gate proves the rebuilt artifact is byte-identical to the existing npm version
before treating publication as a no-op. `latest` must still equal the candidate,
and a draft must not already contain provenance from the original run. Never
invoke `npm publish` again for an existing exact version. If the original
provenance bytes are required, use a failed-job rerun that retains them. If
neither a retained artifact nor a byte-identical rebuild is available, the
rebuild differs, or a workflow change is required, use a new patch version.

npm dist-tags are moving convenience pointers, not release identities. If an
incomplete version became `latest`, an npm owner may explicitly restore
`latest` to an independently verified complete version and deprecate the
incomplete exact version with a replacement message. Those registry mutations
are manual incident actions; recovery automation must not perform them. Never
use `npm unpublish`: removal is destructive and does not make the version
reusable.

The historical states demonstrate each fail-closed path. v3.3.0 has npm
provenance but a published immutable GitHub Release with no assets, so it is a
published partial release and cannot resume. v3.3.1 has a consumed tag but no
npm version or GitHub Release; its tagged workflow required a fix, so it could
not be retried unchanged. v3.3.2 is the complete replacement.

## Immutable release tags

A `vX.Y.Z` tag must never be moved or reused once it is pushed or consumed by a
release workflow. An exact retry resumes work attached to that same immutable
identity; it does not move or reuse the tag. Any source, workflow, provenance,
or digest change requires a new patch version and tag.

The historical `v3.1.0` tag predates this prospective policy and remains an
unchanged baseline exception. It must not be rewritten again.

Before creating a version commit or tag, maintainers run:

```bash
npm run release:preflight -- <version>
npm run release:validate -- --tag v<version>
```

The preflight fails if the local or remote Git tag, GitHub Release, or npm
package version already exists. The metadata validator requires the package,
both lockfile root records, proposed tag, one dated changelog heading, and its
non-empty reviewed notes to agree. The only deletion exception is a tag proven
unconsumed: no workflow observed it and no public GitHub or npm artifact exists.
Once any public system has consumed the tag, preserve it permanently. Only the
exact matching downstream recovery described above may continue that release;
all other recovery uses a new patch version.

Changes to the release workflow trigger a non-publishing pull-request job. This
forces GitHub to validate referenced reusable workflows and their permission
contracts before the change can merge; all package and release jobs remain
restricted to version-tag pushes.

The repository's live tag rules are part of the release control, not optional
documentation. Before pushing a release tag, confirm that only the release
authority can create matching `v*` tags and that update/deletion restrictions
remain active. Do not test those controls by pushing a disposable `v*` tag:
every matching tag is a publication trigger.

## Signing keys

For npm provenance and GitHub Actions trusted publishing, the signing and identity material is managed by the publishing platform rather than by a long-lived project private key stored on the distribution site.

If the project later adopts maintainer-managed signing keys for release assets or Git tags, this document must be updated with public-key discovery and verification instructions.
