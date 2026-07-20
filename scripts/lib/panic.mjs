// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

const CONFLICT_STATUSES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function zeroStatus() {
  return {
    staged: 0,
    unstaged: 0,
    conflicts: 0,
    stagedDeleted: 0,
    unstagedDeleted: 0,
    untracked: 0,
  };
}

/**
 * Parse `git status --porcelain=v1 -z` without treating repository paths as
 * lines or shell text. Paths are intentionally counted, never rendered into a
 * command, so every suggested command remains portable across supported
 * shells and hostile filenames cannot become executable text.
 * @param {string} output - NUL-delimited porcelain status.
 * @returns {ReturnType<typeof zeroStatus>|null} Parsed counts or null when malformed.
 */
export function parsePanicStatus(output) {
  if (output === "") return zeroStatus();
  if (typeof output !== "string" || !output.endsWith("\0")) return null;

  const fields = output.slice(0, -1).split("\0");
  const status = zeroStatus();

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (record.length < 4 || record[2] !== " ") return null;

    const stagedCode = record[0];
    const unstagedCode = record[1];
    const pair = `${stagedCode}${unstagedCode}`;

    if (pair === "??") {
      status.untracked += 1;
      continue;
    }
    if (pair === "!!") continue;

    if (CONFLICT_STATUSES.has(pair)) {
      status.conflicts += 1;
    } else {
      if (stagedCode !== " ") status.staged += 1;
      if (unstagedCode !== " ") status.unstaged += 1;
    }

    if (stagedCode === "D") status.stagedDeleted += 1;
    if (unstagedCode === "D") status.unstagedDeleted += 1;

    if (stagedCode === "R" || stagedCode === "C") {
      index += 1;
      if (index >= fields.length || !fields[index]) return null;
    }
  }

  return status;
}

function succeeded(result) {
  return !result?.error && result?.status === 0;
}

function absentReference(result) {
  return !result?.error && result?.status === 1;
}

function probeReference(runGit, name) {
  const result = runGit(["rev-parse", "--verify", "--quiet", name]);
  if (succeeded(result)) return { present: true, complete: true };
  if (absentReference(result)) return { present: false, complete: true };
  return { present: false, complete: false };
}

function oneLine(output) {
  return String(output || "").replace(/\r?\n$/, "");
}

/**
 * Inspect only facts that can justify conservative recovery guidance.
 * `runGit` is injected so tests can assert the exact read-only probe set.
 * @param {(args: string[]) => object} runGit - Synchronous Git probe.
 * @returns {object} Repository facts used by {@link buildPanicGuide}.
 */
export function inspectPanicRepository(runGit) {
  const insideResult = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (!succeeded(insideResult)) {
    return !insideResult?.error && typeof insideResult?.status === "number"
      ? { location: "not-working-tree", inspectionComplete: true }
      : { location: "unknown", inspectionComplete: false };
  }
  if (oneLine(insideResult.stdout) !== "true") {
    return { location: "not-working-tree", inspectionComplete: true };
  }

  const statusResult = runGit([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const status = succeeded(statusResult)
    ? parsePanicStatus(statusResult.stdout || "")
    : null;

  const branchResult = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  let branch = null;
  let detached = false;
  let branchComplete = true;
  if (succeeded(branchResult)) {
    branch = oneLine(branchResult.stdout);
  } else if (absentReference(branchResult)) {
    detached = true;
  } else {
    branchComplete = false;
  }

  const head = probeReference(runGit, "HEAD");
  const merge = probeReference(runGit, "MERGE_HEAD");
  const rebase = probeReference(runGit, "REBASE_HEAD");
  const cherryPick = probeReference(runGit, "CHERRY_PICK_HEAD");

  const previousResult = runGit([
    "rev-parse",
    "--verify",
    "--quiet",
    "--symbolic-full-name",
    "@{-1}",
  ]);
  let previousBranch = false;
  let previousComplete = true;
  if (succeeded(previousResult)) {
    previousBranch = oneLine(previousResult.stdout).startsWith("refs/heads/");
  } else if (!absentReference(previousResult)) {
    previousComplete = false;
  }

  const operation = rebase.present
    ? "rebase"
    : merge.present
      ? "merge"
      : cherryPick.present
        ? "cherry-pick"
        : null;
  const inspectionComplete = Boolean(
    status &&
    branchComplete &&
    head.complete &&
    merge.complete &&
    rebase.complete &&
    cherryPick.complete &&
    previousComplete,
  );

  return {
    location: "working-tree",
    inspectionComplete,
    status: status || zeroStatus(),
    branch,
    detached,
    hasHead: head.present,
    operation,
    previousBranch,
  };
}

function countPhrase(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function repositoryStateLine(facts) {
  const identity = facts.detached
    ? "detached HEAD"
    : facts.branch
      ? `branch "${facts.branch}"`
      : "a Git working tree";
  const details = [];

  if (facts.operation) details.push(`${facts.operation} in progress`);
  if (facts.status.conflicts > 0) {
    details.push(countPhrase(facts.status.conflicts, "unresolved path"));
  }
  if (facts.status.staged > 0) {
    details.push(countPhrase(facts.status.staged, "staged change"));
  }
  if (facts.status.unstaged > 0) {
    details.push(countPhrase(facts.status.unstaged, "unstaged change"));
  }
  if (facts.status.stagedDeleted > 0) {
    details.push(countPhrase(facts.status.stagedDeleted, "staged deletion"));
  }
  if (facts.status.unstagedDeleted > 0) {
    details.push(
      countPhrase(facts.status.unstagedDeleted, "unstaged deletion"),
    );
  }
  if (facts.status.untracked > 0) {
    details.push(countPhrase(facts.status.untracked, "untracked file"));
  }

  return details.length > 0
    ? `Current state: ${identity}; ${details.join(", ")}.`
    : `Current state: ${identity}; the working tree is clean.`;
}

function inspection(command, description) {
  return { kind: "inspection", command, description };
}

function reversible(command, description) {
  return { kind: "reversible", command, description };
}

/**
 * Build the deterministic, path-free guide. Recovery commands are suggestions
 * only; the caller renders the model and never executes any step.
 * @param {object} facts - Facts returned by {@link inspectPanicRepository}.
 * @returns {{severity: "info"|"warning", exitCode: number, currentState: string, steps: object[], notes: string[]}}
 */
export function buildPanicGuide(facts) {
  const statusStep = inspection(
    "git status",
    "Shows the current branch, active operation, staged changes, working-tree changes, and conflicts without changing them.",
  );

  if (facts.location === "not-working-tree") {
    return {
      severity: "warning",
      exitCode: 1,
      currentState:
        "Current state: this location is not inside a Git working tree.",
      steps: [statusStep],
      notes: [
        "Move into the project directory and run this guide again.",
        "This guide did not change any files or Git state.",
      ],
    };
  }

  if (facts.location !== "working-tree" || !facts.inspectionComplete) {
    return {
      severity: "warning",
      exitCode: 1,
      currentState:
        "Current state: Git could not safely inspect the complete repository state.",
      steps: [statusStep],
      notes: [
        "Do not guess at a recovery step while Git state is unavailable.",
        "This guide did not change any files or Git state.",
      ],
    };
  }

  const steps = [statusStep];
  const { status } = facts;

  if (status.conflicts > 0) {
    steps.push(
      inspection(
        "git diff --name-only --diff-filter=U",
        "Lists only unresolved paths without changing conflict markers, staging, or files.",
      ),
    );
  }
  if (status.staged > 0 || status.stagedDeleted > 0) {
    steps.push(
      inspection(
        "git diff --cached",
        "Shows exactly what is staged for the next commit without changing it.",
      ),
    );
  }
  if (status.unstaged > 0 || status.unstagedDeleted > 0) {
    steps.push(
      inspection(
        "git diff",
        "Shows unstaged edits and deletions without changing working-tree files.",
      ),
    );
  }
  if (status.untracked > 0) {
    steps.push(
      inspection(
        "git ls-files --others --exclude-standard --full-name -- :/",
        "Lists untracked, non-ignored files without adding or deleting them.",
      ),
    );
  }
  if (facts.detached && facts.hasHead) {
    steps.push(
      inspection(
        "git log -1 --oneline --decorate",
        "Shows the current detached commit and any names pointing to it without moving HEAD.",
      ),
    );
  }

  const clean =
    !facts.operation &&
    status.conflicts === 0 &&
    status.staged === 0 &&
    status.unstaged === 0 &&
    status.untracked === 0;
  if (facts.detached || facts.previousBranch || clean) {
    steps.push(
      inspection(
        "git reflog -n 10 --oneline",
        "Shows recent local HEAD movements so you can inspect branch switches and commits without changing them.",
      ),
    );
  }

  const safeToSuggestMutation =
    !facts.operation && status.conflicts === 0 && facts.inspectionComplete;
  if (
    safeToSuggestMutation &&
    facts.hasHead &&
    (status.staged > 0 || status.stagedDeleted > 0)
  ) {
    steps.push(
      reversible(
        "git restore --staged -- :/",
        "Removes every change from staging while leaving working-tree files and deletions in place.",
      ),
    );
  }
  if (safeToSuggestMutation && facts.previousBranch) {
    steps.push(
      reversible(
        "git switch -",
        "Returns to the previously checked-out branch; Git refuses if switching would overwrite working-tree changes.",
      ),
    );
  }

  const hasConcern =
    Boolean(facts.operation) ||
    facts.detached ||
    status.conflicts > 0 ||
    status.staged > 0 ||
    status.unstaged > 0 ||
    status.untracked > 0;

  return {
    severity: hasConcern ? "warning" : "info",
    exitCode: 0,
    currentState: repositoryStateLine(facts),
    steps,
    notes: [
      "This guide did not change files, staging, branches, commits, or Git configuration.",
      "Run a reversible option only when its description matches what you intend; otherwise back up important files and ask for help.",
    ],
  };
}

function stepLines(step) {
  return [`  ${step.command}`, `    ${step.description}`];
}

/**
 * Format one intentional message model for the shared terminal renderer.
 * @param {ReturnType<typeof buildPanicGuide>} guide - Panic guide model.
 * @returns {{severity: "info"|"warning", lines: string[]}} Box model.
 */
export function panicGuideMessage(guide) {
  const inspections = guide.steps.filter((step) => step.kind === "inspection");
  const reversibleSteps = guide.steps.filter(
    (step) => step.kind === "reversible",
  );
  const [firstInspection, ...otherInspections] = inspections;
  const lines = [
    guide.currentState,
    "",
    "Safest first step — inspection only",
    ...stepLines(firstInspection),
  ];

  if (otherInspections.length > 0) {
    lines.push(
      "",
      "Other inspection steps",
      ...otherInspections.flatMap(stepLines),
    );
  }
  if (reversibleSteps.length > 0) {
    lines.push(
      "",
      "Reversible options — only if the description matches your intent",
      ...reversibleSteps.flatMap(stepLines),
    );
  }

  lines.push("", ...guide.notes);
  return { severity: guide.severity, lines };
}
