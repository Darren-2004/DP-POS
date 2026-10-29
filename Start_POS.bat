@echo off
title Start POS Server
if not exist "%~dp0start_pos_monitor.ps1" (
    echo ERROR: start_pos_monitor.ps1 was not found beside this launcher.
    pause
    exit /b 1
)
if not exist "%~dp0Lancer_Caisse.bat" (
    echo ERROR: Lancer_Caisse.bat was not found beside this launcher.
    pause
    exit /b 1
)
start "POS Server and Network Link" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0start_pos_monitor.ps1"