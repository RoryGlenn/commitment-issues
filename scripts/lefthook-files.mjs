// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

// Lefthook skips file-aware commands when their `files:` producer is empty.
// Emit one package-owned path so pre-commit and pre-push policies still run
// for empty operations. Keep this output literal: Lefthook substitutes it into
// the configured command, so no repository-controlled path may reach it.
process.stdout.write("node_modules/commitment-issues/package.json\n");
