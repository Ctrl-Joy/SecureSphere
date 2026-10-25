@echo off
rem Double-click to set up and launch SecureSphere.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
