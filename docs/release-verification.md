# Release Verification

This document explains how `commitment-issues` releases are identified and how users can verify release provenance.

## Release identifiers

Official releases use unique semantic version identifiers, such as `3.3.2`.

Release identifiers appear in:

- the npm package version;
- GitHub releases and version tags when used;
- `CHANGELOG.md` release entries.

## Release notes

Each official release should describe functional changes and security-relevant changes in `CHANGELOG.md` and/or GitHub release notes.

Security fixes should be clearly identified when disclosure timing permits.

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
point, shebang, executable mode, file modes, and reported version, and then
hashes, publishes, and retains the unchanged tarball as a workflow artifact.
The provenance generator retains its signed output separately. One final
release action receives both files before publishing the immutable GitHub
Release, so no later job needs to attach or replace an asset.

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

v3.3.2 is the first release validated end to end against the current invariant:
the npm and GitHub tarballs are byte-identical, the SLSA subject names that
SHA-256, and independent `slsa-verifier` and npm signature checks pass.

Earlier fix-forward history remains immutable and should not be mistaken for
that baseline: v3.3.0 reached npm but its GitHub Release could not accept the
later provenance upload, and v3.3.1 consumed a tag before GitHub rejected the
reusable-workflow permission contract. Neither tag was moved or reused; v3.3.2
fixed forward with pre-merge workflow validation.

## Immutable release tags

A `vX.Y.Z` tag must never be moved or reused once it is pushed or consumed by a
release workflow. If publishing fails after a tag is pushed, fix forward with a
new patch version and a new tag.

The historical `v3.1.0` tag predates this prospective policy and remains an
unchanged baseline exception. It must not be rewritten again.

Before creating a version commit or tag, maintainers run:

```bash
npm run release:preflight -- <version>
```

The preflight fails if the local or remote Git tag, GitHub Release, or npm
package version already exists. The only deletion exception is a tag proven
unconsumed: no workflow observed it and no public GitHub or npm artifact exists.
Once any public system has consumed the tag, recovery is always a new patch
version.

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
