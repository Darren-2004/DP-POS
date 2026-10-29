@echo off
:: Launcher Caisse POS - Impression 100% Silencieuse (Sans Dialogue)
TITLE Lancement Caisse POS - Mode Kiosque Silencieux

set "SERVER_URL=%~1"
if "%SERVER_URL%"=="" set /p "SERVER_URL=Enter the server POS URL (example: http://192.168.1.15:5173): "
if "%SERVER_URL%"=="" (
    echo ERROR: A server URL is required.
    pause
    exit /b 1
)

set "CHROME_BIN="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "CHROME_BIN=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "CHROME_BIN=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if defined CHROME_BIN (
    if not exist "%LOCALAPPDATA%\POS-Kiosk\ChromeProfile" mkdir "%LOCALAPPDATA%\POS-Kiosk\ChromeProfile"
    if exist "%~dp0configure_kiosk_printing.ps1" (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure_kiosk_printing.ps1" -ProfileDir "%LOCALAPPDATA%\POS-Kiosk\ChromeProfile" >nul 2>&1
    )
    start "" "%CHROME_BIN%" --user-data-dir="%LOCALAPPDATA%\POS-Kiosk\ChromeProfile" --app="%SERVER_URL%" --kiosk --kiosk-printing --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run --disable-restore-session-state
) else (
    start "" "%SERVER_URL%"
)
