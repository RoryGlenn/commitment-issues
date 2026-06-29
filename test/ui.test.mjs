import test from "node:test";
import assert from "node:assert/strict";
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
