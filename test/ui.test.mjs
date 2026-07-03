import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  printBox,
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
