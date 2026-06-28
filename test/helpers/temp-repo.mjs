import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(helpersDir, "..", "..");

export function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...options,
  });
}

export function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function readFile(tempDir, relativePath) {
  return fs.readFileSync(path.join(tempDir, relativePath), "utf8");
}

export function readHeadFile(tempDir, relativePath) {
  const result = run("git", ["show", `HEAD:${relativePath}`], tempDir);
  return result.stdout;
}

export function createTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "precommit-checks-"));

  run("git", ["init"], tempDir);
  run("git", ["config", "user.name", "test"], tempDir);
  run("git", ["config", "user.email", "test@example.com"], tempDir);

  writeFile(
    path.join(tempDir, "package.json"),
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  writeFile(
    path.join(tempDir, "eslint.config.js"),
    fs.readFileSync(path.join(repoRoot, "eslint.config.js"), "utf8"),
  );
  writeFile(
    path.join(tempDir, "README.md"),
    fs.readFileSync(path.join(repoRoot, "README.md"), "utf8"),
  );
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(tempDir, "scripts"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(tempDir, "node_modules"),
  );

  writeFile(path.join(tempDir, ".gitignore"), "node_modules/\n");
  run("git", ["add", "."], tempDir);
  run("git", ["commit", "-m", "init"], tempDir);

  return tempDir;
}

export function cleanupTempRepo(tempDir) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
