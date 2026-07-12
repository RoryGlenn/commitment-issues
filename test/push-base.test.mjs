// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  firstPushBase,
  remoteBaseRefs,
  resolveEmptyTree,
  selectFirstPushBase,
} from "../scripts/lib/push-base.mjs";

const SHA1_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function ok(stdout = "") {
  return { status: 0, signal: null, stdout, stderr: "", error: null };
}

function failed(status = 1) {
  return { status, signal: null, stdout: "", stderr: "failed", error: null };
}

test("resolveEmptyTree uses Git output and falls back safely", () => {
  assert.equal(
    resolveEmptyTree(() => ok("custom-empty-tree\n")),
    "custom-empty-tree",
  );
  assert.equal(
    resolveEmptyTree(() => ok()),
    SHA1_EMPTY_TREE,
  );
  assert.equal(
    resolveEmptyTree(() => failed()),
    SHA1_EMPTY_TREE,
  );
  assert.equal(
    resolveEmptyTree(() => ({ ...failed(), error: new Error("missing git") })),
    SHA1_EMPTY_TREE,
  );
});

test("remoteBaseRefs prioritizes an upstream and de-duplicates remote refs", () => {
  const run = (_command, args) => {
    if (args[0] === "rev-parse") {
      return ok("refs/remotes/origin/main\n");
    }
    assert.equal(args[0], "for-each-ref");
    return ok(
      "refs/remotes/origin/HEAD\n" +
        "refs/remotes/origin/main\n" +
        "refs/remotes/origin/feature\n",
    );
  };

  assert.deepEqual(remoteBaseRefs("refs/heads/feature", "origin", run), [
    { ref: "refs/remotes/origin/main", priority: 0 },
    { ref: "refs/remotes/origin/HEAD", priority: 1 },
    { ref: "refs/remotes/origin/feature", priority: 2 },
  ]);
});

test("remoteBaseRefs accepts local upstreams when ref enumeration fails", () => {
  const run = (_command, args) =>
    args[0] === "rev-parse" ? ok("refs/heads/main\n") : failed();

  assert.deepEqual(remoteBaseRefs("refs/heads/feature", "origin", run), [
    { ref: "refs/heads/main", priority: 0 },
  ]);
});

test("remoteBaseRefs infers an unambiguous remote and rejects unsafe guesses", () => {
  const noRemoteName = (_command, args) => {
    if (args[0] === "remote") {
      return ok();
    }
    assert.equal(args.at(-1), "refs/remotes/");
    return ok("refs/remotes/fallback/main\n");
  };
  assert.deepEqual(remoteBaseRefs(undefined, undefined, noRemoteName), [
    { ref: "refs/remotes/fallback/main", priority: 2 },
  ]);

  assert.deepEqual(
    remoteBaseRefs(undefined, undefined, () => ({
      ...failed(),
      error: new Error("missing git"),
    })),
    [],
  );
  assert.deepEqual(
    remoteBaseRefs(undefined, undefined, () => failed()),
    [],
  );
  assert.deepEqual(
    remoteBaseRefs(undefined, undefined, () => ok("origin\nfork\n")),
    [],
  );
});

test("remoteBaseRefs ignores failed or mismatched upstream probes", () => {
  const failedUpstream = (_command, args) =>
    args[0] === "rev-parse" ? failed() : ok();
  assert.deepEqual(
    remoteBaseRefs("refs/heads/feature", "origin", failedUpstream),
    [],
  );

  const mismatchedUpstream = (_command, args) =>
    args[0] === "rev-parse"
      ? ok("refs/remotes/fork/main\n")
      : { ...failed(), error: new Error("cannot enumerate") };
  assert.deepEqual(
    remoteBaseRefs("refs/heads/feature", "origin", mismatchedUpstream),
    [],
  );
});

test("selectFirstPushBase ignores unusable candidates", () => {
  const candidates = [
    "merge-error",
    "merge-failure",
    "multiple-bases",
    "no-base",
    "distance-error",
    "distance-failure",
    "distance-not-number",
    "distance-negative",
  ].map((ref) => ({ ref, priority: 2 }));
  const run = (_command, args) => {
    if (args[0] === "hash-object") {
      return ok("empty-tree\n");
    }
    const ref = args.at(-1);
    if (args[0] === "merge-base") {
      if (ref === "merge-error") {
        return { ...failed(), error: new Error("merge-base unavailable") };
      }
      if (ref === "merge-failure") {
        return failed();
      }
      if (ref === "multiple-bases") {
        return ok("base-a\nbase-b\n");
      }
      if (ref === "no-base") {
        return ok();
      }
      return ok(`${ref}-base\n`);
    }

    const base = args.at(-1).split("..")[0];
    if (base === "distance-error-base") {
      return { ...failed(), error: new Error("rev-list unavailable") };
    }
    if (base === "distance-failure-base") {
      return failed();
    }
    if (base === "distance-not-number-base") {
      return ok("unknown\n");
    }
    assert.equal(base, "distance-negative-base");
    return ok("-1\n");
  };

  assert.equal(selectFirstPushBase(candidates, "head", run), "empty-tree");
});

test("selectFirstPushBase orders viable candidates deterministically", () => {
  const candidates = [
    { ref: "far", priority: 0 },
    { ref: "near-low-priority", priority: 2 },
    { ref: "near-z", priority: 1 },
    { ref: "near-a", priority: 1 },
  ];
  const distances = new Map([
    ["far", 4],
    ["near-low-priority", 2],
    ["near-z", 2],
    ["near-a", 2],
  ]);
  let pendingRef;
  const run = (_command, args) => {
    if (args[0] === "merge-base") {
      pendingRef = args.at(-1);
      return ok("shared-base\n");
    }
    return ok(`${distances.get(pendingRef)}\n`);
  };

  assert.equal(selectFirstPushBase(candidates, "head", run), "shared-base");
});

test("selectFirstPushBase falls back when closest candidates disagree", () => {
  const candidates = [
    { ref: "left", priority: 2 },
    { ref: "right", priority: 2 },
  ];
  const run = (_command, args) => {
    if (args[0] === "merge-base") {
      return ok(`${args.at(-1)}-base\n`);
    }
    if (args[0] === "rev-list") {
      return ok("1\n");
    }
    return ok("empty-tree\n");
  };

  assert.equal(selectFirstPushBase(candidates, "head", run), "empty-tree");
});

test("firstPushBase combines remote discovery and candidate selection", () => {
  const run = (_command, args) => {
    if (args[0] === "remote") {
      return ok("origin\n");
    }
    if (args[0] === "for-each-ref") {
      return ok("refs/remotes/origin/main\n");
    }
    if (args[0] === "merge-base") {
      return ok("base\n");
    }
    assert.equal(args[0], "rev-list");
    return ok("1\n");
  };

  assert.equal(
    firstPushBase({
      localRef: undefined,
      localSha: "head",
      remoteName: undefined,
      run,
    }),
    "base",
  );
});
