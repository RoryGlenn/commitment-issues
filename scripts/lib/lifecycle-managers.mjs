// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

export const SUPPORTED_LIFECYCLE_MANAGERS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
]);

export const SUPPLIED_TARBALL_DIGEST_PREFIX =
  "[lifecycle smoke] supplied tarball sha256:";

export function formatLifecycleManagers() {
  return [...SUPPORTED_LIFECYCLE_MANAGERS].join(", ");
}

export function hasExactOutputLine(output, expected) {
  return String(output ?? "")
    .split(/\r?\n/u)
    .some((line) => line.trim() === expected);
}

export function hasSuppliedTarballDigest(output, expectedHash) {
  if (!/^[0-9a-f]{64}$/u.test(expectedHash)) return false;
  const expectedMarker = `${SUPPLIED_TARBALL_DIGEST_PREFIX} ${expectedHash}`;
  return String(output ?? "")
    .split(/\r?\n/u)
    .some((line) => {
      const markerIndex = line.indexOf(SUPPLIED_TARBALL_DIGEST_PREFIX);
      return (
        markerIndex !== -1 && line.slice(markerIndex).trim() === expectedMarker
      );
    });
}

export function shouldEnforcePosixPackageModes(platform = process.platform) {
  return platform !== "win32";
}
