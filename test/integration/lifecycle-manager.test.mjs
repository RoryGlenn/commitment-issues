// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import test from "node:test";
import {
  lifecycleTestName,
  runLifecycleIntegration,
} from "../../scripts/lib/lifecycle-fixture.mjs";

const packageManager = process.env.COMMITMENT_ISSUES_LIFECYCLE_PM ?? "npm";

test(lifecycleTestName(packageManager), () => {
  runLifecycleIntegration(packageManager);
});
