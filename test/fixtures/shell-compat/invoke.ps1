# Copyright (c) 2026 RoryGlenn and commitment-issues contributors
# SPDX-License-Identifier: MIT
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

switch ($env:SHELL_COMPAT_ACTION) {
  "version" { & $env:SHELL_COMPAT_BIN --version; break }
  # npm's generated PowerShell shim exits its host process. Keep it as the
  # self-contained launch smoke above, then use the exact installed entry for
  # stateful actions so this runner retains the project working directory.
  "init" { & node $env:SHELL_COMPAT_ENTRY init; break }
  "commit" { git commit -m "shell compatibility commit"; break }
  "push" { git push --set-upstream origin main; break }
  "doctor" { & node $env:SHELL_COMPAT_ENTRY doctor; break }
  "uninstall" { & node $env:SHELL_COMPAT_ENTRY uninstall; break }
  default {
    [Console]::Error.WriteLine(
      "Unknown shell compatibility action: $env:SHELL_COMPAT_ACTION"
    )
    exit 64
  }
}

exit $LASTEXITCODE
