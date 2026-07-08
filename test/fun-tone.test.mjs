import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildAdvisoryMessage } from "../scripts/lib/message.mjs";
import {
  cleanupTempRepo,
  createTempRepo,
  run,
  setPrecommitConfig,
  writeFile,
} from "./helpers/temp-repo.mjs";

test("precommit uses fun tone from package config", (t) => {
  const tempDir = createTempRepo();
  t.after(() => cleanupTempRepo(tempDir));

  setPrecommitConfig(tempDir, { tone: "fun" });
  writeFile(
    path.join(tempDir, "src", "lonely.mjs"),
    "export const lonely = 1;\n",
  );

  run("git", ["add", "src/lonely.mjs"], tempDir);

  const result = run("node", ["scripts/precommit.mjs"], tempDir);
  const text = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(text, /Relationship notes/);
  assert.match(text, /Pre-commit suggestions found/);
});

// Each canonical (standard-tone) message string has a fun-tone rewrite in
// funIssueMessage. Exercise every variant in-process, singular and plural,
// so the regex mappings stay in sync with the wording precommit produces.
function funText(message, autoFixable = false) {
  return buildAdvisoryMessage([{ type: "check", autoFixable, message }], {
    tone: "fun",
  }).lines.join("\n");
}

test("fun tone rewrites the Prettier formatting message", () => {
  assert.match(
    funText("1 file need Prettier formatting", true),
    /1 file told Prettier "this is just how I am"/,
  );
  assert.match(
    funText("2 files need Prettier formatting", true),
    /2 files told Prettier "this is just how we are"/,
  );
});

test("fun tone rewrites the missing unit tests message", () => {
  assert.match(
    funText("1 staged source file missing unit tests"),
    /1 staged source file won't commit to a unit test/,
  );
  assert.match(
    funText("2 staged source files missing unit tests"),
    /2 staged source files won't commit to unit tests/,
  );
});

test("fun tone rewrites the manual ESLint issues message", () => {
  assert.match(
    funText("1 ESLint issue needing manual fixes"),
    /1 ESLint issue that flowers won't fix/,
  );
  assert.match(
    funText("2 ESLint issues needing manual fixes"),
    /2 ESLint issues that flowers won't fix/,
  );
});

test("fun tone rewrites the auto-fixable ESLint issues message", () => {
  assert.match(
    funText("1 auto-fixable ESLint issue found", true),
    /1 ESLint issue ready to take you back, no questions asked/,
  );
  assert.match(
    funText("2 auto-fixable ESLint issues found", true),
    /2 ESLint issues ready to take you back, no questions asked/,
  );
});

test("fun tone rewrites the failing staged tests message", () => {
  assert.match(
    funText("1 staged test file failing"),
    /1 staged test file just said "we need to talk"/,
  );
  assert.match(
    funText("2 staged test files failing"),
    /2 staged test files just said "we need to talk"/,
  );
});

test("fun tone passes unrecognized messages through unchanged", () => {
  assert.match(
    funText("something completely bespoke happened"),
    /something completely bespoke happened/,
  );
});
