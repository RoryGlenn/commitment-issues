import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  globToRegExp,
  isThirdPartyPath,
  normalizeRepoPath,
  shortFileList,
} from "../scripts/lib/files.mjs";
import {
  eslintManualIssues,
  parseNodeTestSummary,
  parsePrettierList,
  summarizeEslintJson,
} from "../scripts/lib/checks.mjs";

// Property-based tests (fast-check) for the pure parsing and path helpers —
// the code that consumes arbitrary tool output and git paths. Each property
// runs against generated inputs, so these double as a lightweight fuzz layer
// (and satisfy the OpenSSF Scorecard fuzzing check, which detects fast-check).
//
// NOTE: this file is intentionally `.js`, not `.mjs`. Scorecard's detector
// only scans `*.js`/`*.jsx` files for the fast-check import, and the package
// is `"type": "module"` so `.js` is still ESM. Do not rename it to `.mjs`.

// One path segment with no separators or glob wildcards, but including regex
// metacharacters so escaping bugs surface.
const regexHostileSegment = fc.string({
  unit: fc.constantFrom(..."abZ09._+^$(){}[]|-"),
  minLength: 1,
  maxLength: 8,
});

const plainSegment = fc.string({
  unit: fc.constantFrom(..."abcxyz09"),
  minLength: 1,
  maxLength: 6,
});

test("normalizeRepoPath is idempotent and yields git-style paths", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary", maxLength: 40 }), (raw) => {
      const once = normalizeRepoPath(raw);
      assert.equal(normalizeRepoPath(once), once);
      assert.ok(!once.includes("\\"));
      assert.ok(!once.includes("//"));
      assert.ok(!once.startsWith("./"));
    }),
  );
});

test("globToRegExp: a literal path used as its own glob matches itself", () => {
  fc.assert(
    fc.property(
      fc.array(regexHostileSegment, { minLength: 1, maxLength: 5 }),
      (segments) => {
        const literalPath = segments.join("/");
        // Matchers are always applied to normalized repo paths (isUserExempt
        // normalizes before testing), and globToRegExp normalizes the glob the
        // same way — so the contract is against the normalized candidate.
        // (Found by fast-check: raw "./a" vs the normalized glob "a".)
        assert.ok(
          globToRegExp(literalPath).test(normalizeRepoPath(literalPath)),
        );
      },
    ),
  );
});

test("globToRegExp: **/ matches the suffix at any directory depth", () => {
  fc.assert(
    fc.property(
      fc.array(plainSegment, { minLength: 0, maxLength: 4 }),
      plainSegment,
      (dirs, name) => {
        const matcher = globToRegExp(`**/${name}`);
        assert.ok(matcher.test([...dirs, name].join("/")));
      },
    ),
  );
});

test("globToRegExp: ? matches exactly one non-separator character", () => {
  fc.assert(
    fc.property(
      fc.string({
        unit: fc.constantFrom(..."abc/"),
        minLength: 1,
        maxLength: 12,
      }),
      (candidate) => {
        const matcher = globToRegExp("?".repeat(candidate.length));
        assert.equal(matcher.test(candidate), !candidate.includes("/"));
      },
    ),
  );
});

test("globToRegExp never throws on arbitrary glob or candidate strings", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: "binary", maxLength: 30 }),
      fc.string({ unit: "binary", maxLength: 50 }),
      (glob, candidate) => {
        // Untrusted testExempt globs must never produce an invalid RegExp or
        // a matcher that throws.
        globToRegExp(glob).test(candidate);
      },
    ),
  );
});

test("isThirdPartyPath agrees across Windows and POSIX separators", () => {
  fc.assert(
    fc.property(
      fc.array(plainSegment, { minLength: 1, maxLength: 5 }),
      (segments) => {
        assert.equal(
          isThirdPartyPath(segments.join("\\")),
          isThirdPartyPath(segments.join("/")),
        );
      },
    ),
  );
});

test("isThirdPartyPath flags any path with a node_modules segment", () => {
  fc.assert(
    fc.property(
      fc.array(plainSegment, { maxLength: 3 }),
      fc.array(plainSegment, { maxLength: 3 }),
      (before, after) => {
        const withSegment = [...before, "node_modules", ...after].join("/");
        assert.equal(isThirdPartyPath(withSegment), true);
        const withoutSegment = [...before, ...after].join("/");
        assert.equal(isThirdPartyPath(withoutSegment), false);
      },
    ),
  );
});

test("parseNodeTestSummary round-trips generated reporter summaries", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 1_000_000 }),
      fc.nat({ max: 1_000_000 }),
      fc.constantFrom("# ", "\u2139 "),
      (passed, failed, prefix) => {
        const output = `TAP version 13\n${prefix}pass ${passed}\n${prefix}fail ${failed}\n`;
        assert.deepEqual(parseNodeTestSummary(output), { passed, failed });
      },
    ),
  );
});

test("parseNodeTestSummary is total: null or non-negative counts", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary", maxLength: 200 }), (raw) => {
      const summary = parseNodeTestSummary(raw);
      if (summary !== null) {
        assert.ok(Number.isInteger(summary.passed) && summary.passed >= 0);
        assert.ok(Number.isInteger(summary.failed) && summary.failed >= 0);
      }
    }),
  );
});

test("parsePrettierList is total and never lists files for a crash", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ unit: "binary", maxLength: 80 }), { maxLength: 3 }),
      (streams) => {
        const result = parsePrettierList(...streams);
        assert.equal(typeof result.failed, "boolean");
        assert.ok(Array.isArray(result.files));
        if (result.failed) {
          assert.equal(result.files.length, 0);
        }
        for (const file of result.files) {
          assert.ok(file.length > 0);
          assert.equal(file, file.trim());
        }
      },
    ),
  );
});

test("ESLint JSON parsers never throw on malformed output", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary", maxLength: 200 }), (raw) => {
      const { issueCount, fixableCount } = summarizeEslintJson(raw);
      assert.equal(typeof issueCount, "number");
      assert.equal(typeof fixableCount, "number");
      assert.ok(Array.isArray(eslintManualIssues(raw)));
    }),
  );
});

test("shortFileList shows at most max entries and accurate overflow", () => {
  fc.assert(
    fc.property(
      fc.array(plainSegment, { maxLength: 12 }),
      fc.integer({ min: 1, max: 10 }),
      (files, max) => {
        const rendered = shortFileList(files, max);
        if (files.length === 0) {
          assert.equal(rendered, "");
        } else if (files.length <= max) {
          assert.equal(rendered, files.join(", "));
        } else {
          assert.equal(
            rendered,
            `${files.slice(0, max).join(", ")} (+${files.length - max} more)`,
          );
        }
      },
    ),
  );
});
