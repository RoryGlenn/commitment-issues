#!/usr/bin/env node
// Copyright (c) 2026 RoryGlenn and commitment-issues contributors
// SPDX-License-Identifier: MIT

import pc from "picocolors";
import { buildVowsMessage } from "./lib/vows.mjs";
import { printBox } from "./lib/ui.mjs";

const model = buildVowsMessage();
const noColor = Object.hasOwn(process.env, "NO_COLOR");

printBox(model.lines, noColor ? undefined : pc.cyan, {
  padding: { top: 0, right: 1, bottom: 0, left: 1 },
  margin: 0,
  borderColor: noColor ? undefined : "cyan",
});

process.exit(0);
