// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Git's well-known SHA-1 empty-tree object. Repositories using another object
// format resolve their own empty tree through `git hash-object`; this constant
// is only the conservative fallback when Git cannot provide one.
const SHA1_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function outputLines(output) {
  return (output || "").split("\n").filter(Boolean);
}

export function resolveEmptyTree(run) {
  const result = run("git", ["hash-object", "-t", "tree", "--stdin"], {
    input: "",
  });
  if (result.error || result.status !== 0) {
    return SHA1_EMPTY_TREE;
  }
  return outputLines(result.stdout)[0] || SHA1_EMPTY_TREE;
}

export function remoteBaseRefs(localRef, remoteName, run) {
  const candidates = new Map();
  let upstreamRef = null;
  const add = (ref, priority) => {
    // Both upstream validation and outputLines guarantee a non-empty ref.
    if (!candidates.has(ref)) {
      candidates.set(ref, priority);
    }
  };

  // An explicitly configured upstream is the strongest signal for the branch
  // point, even when the destination branch itself does not exist yet.
  if (localRef?.startsWith("refs/heads/")) {
    const localBranch = localRef.slice("refs/heads/".length);
    const upstream = run("git", [
      "rev-parse",
      "--verify",
      "--symbolic-full-name",
      `${localBranch}@{upstream}`,
    ]);
    if (!upstream.error && upstream.status === 0) {
      [upstreamRef] = outputLines(upstream.stdout);
    }
  }

  // New generated hooks forward Git's destination remote as argv[2]. Older
  // hooks and manual/test runs may not, so infer it only when exactly one remote
  // is configured. A destination-ambiguous repository falls back to the empty
  // tree rather than borrowing a base from the wrong remote.
  if (!remoteName) {
    const remotes = run("git", ["remote"]);
    if (remotes.error || remotes.status !== 0) {
      return [];
    }
    const names = outputLines(remotes.stdout);
    if (names.length > 1) {
      return [];
    }
    [remoteName] = names;
  }

  if (
    upstreamRef?.startsWith("refs/heads/") ||
    (remoteName && upstreamRef?.startsWith(`refs/remotes/${remoteName}/`))
  ) {
    add(upstreamRef, 0);
  }

  const prefix = remoteName ? `refs/remotes/${remoteName}/` : "refs/remotes/";
  const refs = run("git", ["for-each-ref", "--format=%(refname)", prefix]);
  if (!refs.error && refs.status === 0) {
    for (const ref of outputLines(refs.stdout)) {
      add(ref, ref.endsWith("/HEAD") ? 1 : 2);
    }
  }

  return [...candidates].map(([ref, priority]) => ({ ref, priority }));
}

export function selectFirstPushBase(candidates, localSha, run) {
  const viable = [];

  for (const candidate of candidates) {
    const mergeBase = run("git", [
      "merge-base",
      "--all",
      localSha,
      candidate.ref,
    ]);
    if (mergeBase.error || mergeBase.status !== 0) {
      continue;
    }

    // Multiple merge bases (possible after criss-cross merges) do not identify
    // one unambiguous diff boundary. Falling back to the empty tree is more
    // expensive but cannot skip tests.
    const bases = outputLines(mergeBase.stdout);
    if (bases.length !== 1) {
      continue;
    }

    const distance = run("git", [
      "rev-list",
      "--count",
      `${bases[0]}..${localSha}`,
    ]);
    const count = Number(outputLines(distance.stdout)[0]);
    if (
      distance.error ||
      distance.status !== 0 ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      continue;
    }

    viable.push({
      base: bases[0],
      distance: count,
      priority: candidate.priority,
      ref: candidate.ref,
    });
  }

  viable.sort(
    (left, right) =>
      left.distance - right.distance ||
      left.priority - right.priority ||
      left.ref.localeCompare(right.ref),
  );
  if (viable.length === 0) {
    return resolveEmptyTree(run);
  }

  const closestBases = new Set(
    viable
      .filter((candidate) => candidate.distance === viable[0].distance)
      .map((candidate) => candidate.base),
  );
  return closestBases.size === 1 ? viable[0].base : resolveEmptyTree(run);
}

export function firstPushBase({ localRef, localSha, remoteName, run }) {
  return selectFirstPushBase(
    remoteBaseRefs(localRef, remoteName, run),
    localSha,
    run,
  );
}
