@echo off
setlocal
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%start-space-enthusiast-map.ps1"
if errorlevel 1 (
  echo.
  echo The application could not be started. See the message above.
  pause
)
endlocal
