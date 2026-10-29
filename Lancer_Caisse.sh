#!/usr/bin/env bash
# Script de Lancement Caisse POS Mode Kiosque (macOS / Linux)
# Impression 100% Silencieuse (Sans Dialogue)

SERVER_URL="${1:-http://localhost:5000}"
PROFILE_DIR="${HOME}/.config/pos-kiosk/chrome-profile"
mkdir -p "$PROFILE_DIR"

CHROME_BIN=""

if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome >/dev/null 2>&1; then
    CHROME_BIN="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium-browser)"
fi

if [[ -n "$CHROME_BIN" ]]; then
    echo "Lancement de la Caisse en mode Kiosque Silencieux..."
    "$CHROME_BIN" --user-data-dir="$PROFILE_DIR" --app="$SERVER_URL" --kiosk --kiosk-printing --noerrdialogs --disable-infobars --no-first-run &
else
    echo "Google Chrome n'est pas trouvé. Ouverture dans le navigateur par défaut..."
    open "$SERVER_URL" 2>/dev/null || xdg-open "$SERVER_URL" 2>/dev/null || true
fi
