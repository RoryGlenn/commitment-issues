import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(helpersDir, "..", "..");

// Absolute path to the real git, captured once so the fake-git shim can
// delegate non-failing invocations to it regardless of PATH overrides.
export const REAL_GIT =
  spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim() || "git";

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

export function createTempRepo({ commit = true } = {}) {
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
  // Symlink (instead of copy) the real scripts so subprocess runs resolve to
  // the repo's actual files. Node attributes V8 coverage to a module's realpath,
  // so this lets the entry-script subprocesses count toward the coverage report
  // (a copy would attribute coverage to the ephemeral temp path instead).
  fs.symlinkSync(path.join(repoRoot, "scripts"), path.join(tempDir, "scripts"));
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(tempDir, "node_modules"),
  );

  writeFile(path.join(tempDir, ".gitignore"), "node_modules/\nscripts/\n");
  if (commit) {
    run("git", ["add", "."], tempDir);
    run("git", ["commit", "-m", "init"], tempDir);
  }

  return tempDir;
}

export function cleanupTempRepo(tempDir) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Overwrite the temp repo's precommitChecks config block.
export function setPrecommitConfig(tempDir, precommitChecks) {
  const pkg = JSON.parse(readFile(tempDir, "package.json"));
  pkg.precommitChecks = precommitChecks;
  writeFile(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
}

// Give the temp repo an upstream (bare remote + tracking branch on `main`) so
// commands that fall back to `@{u}` have something to diff against.
export function addBareRemote(tempDir) {
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "precommit-remote-"));
  run("git", ["init", "--bare"], remoteDir);
  run("git", ["branch", "-M", "main"], tempDir);
  run("git", ["remote", "add", "origin", remoteDir], tempDir);
  run("git", ["push", "-u", "origin", "main"], tempDir);
  return remoteDir;
}

// Build an env that puts a fake `git` first on PATH. The shim exits 1 for any
// invocation whose joined args contain `matchSubstring`, and delegates to the
// real git otherwise — used to exercise the scripts' defensive "git command
// failed" branches without corrupting a real repository.
export function fakeGitEnv(tempDir, matchSubstring) {
  const binDir = path.join(tempDir, ".fakebin");
  fs.mkdirSync(binDir, { recursive: true });
  const gitPath = path.join(binDir, "git");
  fs.writeFileSync(
    gitPath,
    `#!/bin/sh
if [ -n "$FAKE_GIT_MATCH" ]; then
  case "$*" in
    *"$FAKE_GIT_MATCH"*) exit 1 ;;
  esac
fi
exec "$FAKE_GIT_REAL" "$@"
`,
  );
  fs.chmodSync(gitPath, 0o755);
  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_GIT_MATCH: matchSubstring,
    FAKE_GIT_REAL: REAL_GIT,
  };
}

// Build an env that puts a stub executable named `name` first on PATH which
// does nothing but exit with `exitCode`. Used to force a spawned helper (e.g.
// `npx husky`) to succeed-as-a-no-op or fail on demand.
export function stubBinEnv(tempDir, name, exitCode = 1) {
  const binDir = path.join(tempDir, ".fakebin");
  fs.mkdirSync(binDir, { recursive: true });
  const binPath = path.join(binDir, name);
  fs.writeFileSync(binPath, `#!/bin/sh\nexit ${exitCode}\n`);
  fs.chmodSync(binPath, 0o755);
  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
  };
}
