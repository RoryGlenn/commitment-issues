@echo off
rem Copyright (c) 2026 RoryGlenn and commitment-issues contributors
rem SPDX-License-Identifier: MIT
setlocal

if "%SHELL_COMPAT_ACTION%"=="version" goto version
if "%SHELL_COMPAT_ACTION%"=="init" goto init
if "%SHELL_COMPAT_ACTION%"=="commit" goto commit
if "%SHELL_COMPAT_ACTION%"=="push" goto push
if "%SHELL_COMPAT_ACTION%"=="doctor" goto doctor
if "%SHELL_COMPAT_ACTION%"=="uninstall" goto uninstall
echo Unknown shell compatibility action: %SHELL_COMPAT_ACTION% 1>&2
exit /b 64

:version
rem npm's generated .cmd shim cannot parse an ampersand in its own directory.
rem Invoke the exact installed entry with Node while Git-hook actions below
rem continue to exercise the package's POSIX shim from the hostile long path.
node "%SHELL_COMPAT_ENTRY%" --version
exit /b %ERRORLEVEL%

:init
node "%SHELL_COMPAT_ENTRY%" init
exit /b %ERRORLEVEL%

:commit
git commit -m "shell compatibility commit"
exit /b %ERRORLEVEL%

:push
git push --set-upstream origin main
exit /b %ERRORLEVEL%

:doctor
node "%SHELL_COMPAT_ENTRY%" doctor
exit /b %ERRORLEVEL%

:uninstall
node "%SHELL_COMPAT_ENTRY%" uninstall
exit /b %ERRORLEVEL%
