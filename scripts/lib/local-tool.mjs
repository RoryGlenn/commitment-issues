// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";

/**
 * Build an invocation for an executable already installed in the project's
 * node_modules/.bin tree. This deliberately has no npx or PATH fallback:
 * optional integrations must never download or execute a global tool
 * implicitly during a Git hook.
 * @param {string} name - Bin name (for example "commitlint").
 * @param {string[]} args - Tool arguments.
 * @param {string} [cwd] - Project directory to resolve upward from.
 * @returns {{command: string, args: string[]}|null} Absolute local invocation.
 */
export function localToolInvocation(name, args, cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  const extensions =
    process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];

  for (;;) {
    const base = path.join(dir, "node_modules", ".bin", name);
    for (const extension of extensions) {
      const candidate = `${base}${extension}`;
      try {
        if (fs.statSync(candidate).isFile()) {
          return { command: candidate, args: [...args] };
        }
      } catch {
        // Keep walking: missing and unreadable candidates both mean this
        // project cannot safely invoke the optional tool from this location.
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
