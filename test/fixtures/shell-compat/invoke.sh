#!/bin/sh
# Copyright (c) 2026 RoryGlenn and commitment-issues contributors
# SPDX-License-Identifier: MIT
set -eu

case "${SHELL_COMPAT_ACTION:?}" in
  version) "${SHELL_COMPAT_BIN:?}" --version ;;
  init) "${SHELL_COMPAT_BIN:?}" init ;;
  commit) git commit -m "shell compatibility commit" ;;
  push) git push --set-upstream origin main ;;
  doctor) "${SHELL_COMPAT_BIN:?}" doctor ;;
  uninstall) "${SHELL_COMPAT_BIN:?}" uninstall ;;
  *)
    printf '%s\n' "Unknown shell compatibility action: ${SHELL_COMPAT_ACTION}" >&2
    exit 64
    ;;
esac
