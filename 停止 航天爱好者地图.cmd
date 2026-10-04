@echo off
setlocal
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%stop-space-enthusiast-map.ps1"
if errorlevel 1 (
  echo.
  echo The application could not be stopped. See the message above.
  pause
)
endlocal
