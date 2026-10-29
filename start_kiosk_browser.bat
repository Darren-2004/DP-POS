@echo off
:: Script de Lancement Chrome/Edge en Mode Kiosque Plein Écran
:: S'ajouter dans le Démarrage Windows : shell:startup
TITLE Lancement Caisse POS - Mode Kiosque

set "POS_URL=%POS_SERVER_URL%"
if not defined POS_URL set "POS_URL=http://localhost:5000"

:: Attendre que le serveur soit bien démarré (5 secondes)
timeout /t 5 /nobreak >nul

set "CHROME_BIN="

:: Chercher Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_BIN if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

:: Chercher Edge si Chrome absent
if not defined CHROME_BIN if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "CHROME_BIN=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not defined CHROME_BIN if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "CHROME_BIN=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if defined CHROME_BIN (
    if not exist "%LOCALAPPDATA%\POS-Kiosk" mkdir "%LOCALAPPDATA%\POS-Kiosk"
    if exist "%~dp0configure_kiosk_printing.ps1" (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure_kiosk_printing.ps1" -ProfileDir "%LOCALAPPDATA%\POS-Kiosk\ChromeProfile" >nul 2>&1
    )
    start "" "%CHROME_BIN%" --user-data-dir="%LOCALAPPDATA%\POS-Kiosk\ChromeProfile" --app="%POS_URL%" --kiosk --kiosk-printing --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 --no-first-run --disable-restore-session-state
) else (
    :: Fallback browser
    start "" "%POS_URL%"
)
