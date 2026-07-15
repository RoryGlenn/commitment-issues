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
call "%SHELL_COMPAT_BIN%" --version
exit /b %ERRORLEVEL%

:init
call "%SHELL_COMPAT_BIN%" init
exit /b %ERRORLEVEL%

:commit
git commit -m "shell compatibility commit"
exit /b %ERRORLEVEL%

:push
git push --set-upstream origin main
exit /b %ERRORLEVEL%

:doctor
call "%SHELL_COMPAT_BIN%" doctor
exit /b %ERRORLEVEL%

:uninstall
call "%SHELL_COMPAT_BIN%" uninstall
exit /b %ERRORLEVEL%
