#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createRhrRun,
  previewRhrRun,
  validateCatalog,
  validateRun,
} from "./lib/rhr.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCatalog = path.join(root, "docs", "rhr-control-catalog-v1.json");
const usage = `Usage:
  node tools/rhr.mjs --run-id RHR-YYYY-QN --reviewer @name \\
    --start-date YYYY-MM-DD --baseline-sha <full-sha> \\
    --trigger <reason> --scope <scope> [--tool-version <name=version>] [--dry-run]
  node tools/rhr.mjs <same options> --create
  node tools/rhr.mjs <same options> --resume

Options:
  --run-id <id>          Immutable RHR identifier.
  --reviewer <name>      Responsible reviewer or reviewers.
  --start-date <date>    Review start date in YYYY-MM-DD form.
  --baseline-sha <sha>   Full 40-character baseline commit SHA.
  --trigger <reason>     Scheduled or event-driven reason for the review.
  --scope <scope>        Full or explicitly scoped review boundary.
  --tool-version <value> Additional relevant tool/runtime version; repeatable.
  --repo <owner/name>    Target repository; defaults to the catalog repository.
  --catalog <path>       Alternate compatible catalog file.
  --dry-run              Print the complete issue payloads without GitHub access (default).
  --create               Create a new run or verify a complete existing run.
  --resume               Fill missing domains only after confirming an interrupted run.
  --help                  Show this help.`;

function parseArguments(args) {
  const options = { toolVersions: [], create: false, resume: false };
  const values = new Map([
    ["--run-id", "runId"],
    ["--reviewer", "reviewer"],
    ["--start-date", "startDate"],
    ["--baseline-sha", "baselineSha"],
    ["--trigger", "trigger"],
    ["--scope", "scope"],
    ["--repo", "repository"],
    ["--catalog", "catalogPath"],
  ]);
  let explicitMode = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (
      argument === "--dry-run" ||
      argument === "--create" ||
      argument === "--resume"
    ) {
      const mode = argument.slice(2);
      if (explicitMode && explicitMode !== mode) {
        throw new Error(
          "--dry-run, --create, and --resume are mutually exclusive.",
        );
      }
      explicitMode = mode;
      options.create = mode === "create" || mode === "resume";
      options.resume = mode === "resume";
      continue;
    }
    if (argument === "--tool-version") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--tool-version requires a value.");
      }
      options.toolVersions.push(value);
      index += 1;
      continue;
    }
    const key = values.get(argument);
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    if (options[key] !== undefined) {
      throw new Error(`${argument} may be supplied only once.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function ghFailure(args, result) {
  const detail =
    result.error?.message || result.stderr?.trim() || "unknown error";
  return new Error(`gh ${args.join(" ")} failed: ${detail}`);
}

function ghJson(args, input) {
  const result = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw ghFailure(args, result);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`gh ${args.join(" ")} returned invalid JSON.`);
  }
}

function issueGateway(repository) {
  const [owner, name] = repository.split("/");
  const base = `repos/${owner}/${name}/issues`;
  return {
    async listIssues() {
      const issues = new Map();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const pages = ghJson([
          "api",
          "--paginate",
          "--slurp",
          `${base}?state=all&per_page=100`,
        ]);
        for (const issue of pages.flat()) {
          if (issue.pull_request) continue;
          issues.set(issue.number, {
            number: issue.number,
            title: issue.title,
            body: issue.body,
            url: issue.html_url,
            state: issue.state,
            stateReason: issue.state_reason,
          });
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      }
      return [...issues.values()];
    },
    createIssue(payload) {
      const issue = ghJson(
        ["api", "--method", "POST", base, "--input", "-"],
        payload,
      );
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        url: issue.html_url,
        state: issue.state,
      };
    },
    updateIssue(number, payload) {
      return ghJson(
        ["api", "--method", "PATCH", `${base}/${number}`, "--input", "-"],
        payload,
      );
    },
  };
}

function loadCatalog(catalogPath) {
  const resolved = path.resolve(root, catalogPath ?? defaultCatalog);
  return validateCatalog(JSON.parse(fs.readFileSync(resolved, "utf8")));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  const catalog = loadCatalog(options.catalogPath);
  const run = validateRun(options, catalog);
  if (!options.create) {
    console.log(JSON.stringify(previewRhrRun(run, catalog), null, 2));
    return;
  }

  const result = await createRhrRun(
    run,
    catalog,
    issueGateway(run.repository),
    {
      resume: options.resume,
    },
  );
  console.log(`${run.runId} is ready at ${result.parent.url}`);
  console.log(
    `Created ${result.created.length}; reused ${result.reused.length}.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`RHR creation failed: ${error.message}`);
  console.error(usage);
  process.exitCode = 1;
}
