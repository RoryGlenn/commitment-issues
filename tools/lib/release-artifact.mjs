// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";

function sha(bytes, algorithm, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

export function artifactDigests(bytes) {
  const content = Buffer.from(bytes);
  return {
    sha1: sha(content, "sha1"),
    sha256: sha(content, "sha256"),
    sha512: sha(content, "sha512"),
    integrity: `sha512-${sha(content, "sha512", "base64")}`,
  };
}
