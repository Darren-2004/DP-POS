@echo off
title Install POS PM2 startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_autostart_server.ps1"
if errorlevel 1 pause
