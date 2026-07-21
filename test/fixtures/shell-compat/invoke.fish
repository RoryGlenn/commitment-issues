#!/usr/bin/env fish
# Copyright (c) 2026 RoryGlenn and commitment-issues contributors
# SPDX-License-Identifier: MIT

if not set -q SHELL_COMPAT_ACTION; or not set -q SHELL_COMPAT_BIN
  echo "Missing shell compatibility environment" >&2
  exit 64
end

switch $SHELL_COMPAT_ACTION
  case version
    command "$SHELL_COMPAT_BIN" --version
  case init
    command "$SHELL_COMPAT_BIN" init
  case commit
    command git commit -m "shell compatibility commit"
  case push
    command git push --set-upstream origin main
  case doctor
    command "$SHELL_COMPAT_BIN" doctor
  case uninstall
    command "$SHELL_COMPAT_BIN" uninstall
  case '*'
    echo "Unknown shell compatibility action: $SHELL_COMPAT_ACTION" >&2
    exit 64
end
