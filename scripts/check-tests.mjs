import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import boxen from "boxen";
import pc from "picocolors";

const testSuffixes = [
  ".test.js",
  ".spec.js",
  ".test.mjs",
  ".spec.mjs",
];

function printBox(message, color = (value) => value, options = {}) {
  console.log(
    boxen(color(message), {
      padding: 1,
      borderStyle: "round",
      margin: {
        top: 1,
        bottom: 1,
      },
      ...options,
    }),
  );
}

function findTestFile(file) {
  const dirname = path.dirname(file);
  const basename = path.basename(file, path.extname(file));

  const candidates = [
    ...testSuffixes.map((suffix) => path.join(dirname, `${basename}${suffix}`)),
    ...testSuffixes.map((suffix) => path.join(dirname, "__tests__", `${basename}${suffix}`)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const stagedFiles = process.argv.slice(2).filter((file) => file && file.trim());
const testFiles = new Set();
const missingTests = [];

for (const file of stagedFiles) {
  if (file.endsWith(".test.js") || file.endsWith(".spec.js") || file.endsWith(".test.mjs") || file.endsWith(".spec.mjs")) {
    continue;
  }

  const testFile = findTestFile(file);
  if (testFile) {
    testFiles.add(testFile);
  } else {
    missingTests.push(file);
  }
}

if (missingTests.length > 0) {
  printBox(
    [
      pc.bold("Missing unit test files for staged source files."),
      "",
      ...missingTests.map((file) => `  ${file}`),
      "",
      pc.dim("Create a corresponding .test.js or .spec.js file in the same directory or __tests__ folder."),
    ].join("\n"),
    pc.yellow,
    {
      title: "tests",
      titleAlignment: "center",
    },
  );
}

if (testFiles.size === 0) {
  process.exit(0);
}

const testArgs = ["--test", ...Array.from(testFiles)];
printBox(
  [
    pc.bold("Running unit tests for staged files..."),
    "",
    ...Array.from(testFiles).map((file) => `  ${file}`),
  ].join("\n"),
  pc.cyan,
  {
    title: "tests",
    titleAlignment: "center",
  },
);

const result = spawnSync("node", testArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  printBox(
    [
      pc.bold("One or more unit tests failed."),
      "",
      pc.dim("Commit will continue anyway. Fix the failing tests before pushing."),
    ].join("\n"),
    pc.red,
    {
      title: "tests",
      titleAlignment: "center",
    },
  );
  process.exit(0);
}

printBox(pc.green("All staged unit tests passed."), pc.green, {
  title: "tests",
  titleAlignment: "center",
});
process.exit(0);
