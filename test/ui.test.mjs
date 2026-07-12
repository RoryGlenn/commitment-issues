// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  printBox,
  printBoxModel,
  printHookBoxModel,
  shouldRenderHookModel,
  infoBox,
  successBox,
  warningBox,
  errorBox,
} from "../scripts/lib/ui.mjs";

function capture(fn) {
  const original = console.log;
  let output = "";
  console.log = (value) => {
    output += `${value}\n`;
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return output;
}

test("printBox renders the message inside a box", () => {
  const output = capture(() => printBox("hello box"));
  assert.match(output, /hello box/);
});

test("severity boxes render the lines with their title", () => {
  assert.match(
    capture(() => infoBox(["info line"])),
    /info line/,
  );
  assert.match(
    capture(() => successBox(["ok line"])),
    /ok line/,
  );
  assert.match(
    capture(() => warningBox(["warn line"])),
    /warn line/,
  );
  assert.match(
    capture(() => errorBox(["err line"])),
    /err line/,
  );
  assert.match(
    capture(() => warningBox({ lines: ["model line"] })),
    /model line/,
  );
  assert.match(
    capture(() => infoBox(42)),
    /42/,
  );
  assert.match(
    capture(() => infoBox(null)),
    /info/,
  );
});

test("printBoxModel dispatches to the requested severity", () => {
  const output = capture(() =>
    printBoxModel({ severity: "warning", lines: ["combined warning"] }),
  );

  assert.match(output, /warning/);
  assert.match(output, /combined warning/);
});

test("printBoxModel falls back to an empty info box for an invalid model", () => {
  const output = capture(() => printBoxModel({ severity: "unknown" }));

  assert.match(output, /info/);
});

test("printBoxModel accepts an omitted model", () => {
  assert.match(
    capture(() => printBoxModel()),
    /info/,
  );
});

test("problems-only suppresses final info and success hook models", () => {
  assert.equal(shouldRenderHookModel(), false);
  assert.equal(
    shouldRenderHookModel({ severity: "info" }, "problems-only"),
    false,
  );
  assert.equal(
    shouldRenderHookModel({ severity: "success" }, "problems-only"),
    false,
  );
  assert.equal(
    capture(() =>
      printHookBoxModel({ severity: "success", lines: ["all clear"] }),
    ),
    "",
  );
  assert.equal(
    capture(() => printHookBoxModel()),
    "",
  );
});

test("problems-only always renders warning and error hook models", () => {
  const warning = capture(() =>
    printHookBoxModel({
      severity: "warning",
      lines: ["checks passed", "protected branch warning"],
    }),
  );
  const error = capture(() =>
    printHookBoxModel({ severity: "error", lines: ["blocked"] }),
  );

  assert.match(warning, /checks passed/);
  assert.match(warning, /protected branch warning/);
  assert.match(error, /blocked/);
});

test("normal renders every final hook severity", () => {
  for (const severity of ["info", "success", "warning", "error"]) {
    assert.match(
      capture(() =>
        printHookBoxModel(
          { severity, lines: [`${severity} result`] },
          "normal",
        ),
      ),
      new RegExp(`${severity} result`),
    );
  }
});

test("severity boxes color the entire border, not just the body", () => {
  // picocolors/chalk disable ANSI on a non-TTY pipe, so force color on in a
  // child process and assert a box-drawing border glyph is wrapped in a color
  // escape — i.e. the border itself is colored, not only the body text.
  const uiUrl = new URL("../scripts/lib/ui.mjs", import.meta.url);
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { errorBox } from ${JSON.stringify(uiUrl.href)}; errorBox(["boom"]);`,
    ],
    { encoding: "utf8", env: { ...process.env, FORCE_COLOR: "1" } },
  );

  assert.equal(child.status, 0);
  // An ANSI color escape immediately preceding a rounded-box border character.
  assert.match(child.stdout, /\u001b\[[0-9;]*m[╭╮╰╯│─]/u);
});
