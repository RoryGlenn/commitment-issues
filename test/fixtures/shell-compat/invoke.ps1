# Copyright (c) 2026 RoryGlenn and commitment-issues contributors
# SPDX-License-Identifier: MIT
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

switch ($env:SHELL_COMPAT_ACTION) {
  "version" { & $env:SHELL_COMPAT_BIN --version; break }
  "init" { & $env:SHELL_COMPAT_BIN init; break }
  "commit" { git commit -m "shell compatibility commit"; break }
  "push" { git push --set-upstream origin main; break }
  "doctor" { & $env:SHELL_COMPAT_BIN doctor; break }
  "uninstall" { & $env:SHELL_COMPAT_BIN uninstall; break }
  default {
    [Console]::Error.WriteLine(
      "Unknown shell compatibility action: $env:SHELL_COMPAT_ACTION"
    )
    exit 64
  }
}

exit $LASTEXITCODE
