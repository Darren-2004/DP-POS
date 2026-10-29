#!/usr/bin/env bash
set -euo pipefail

server_url="${POS_SERVER_URL:-http://172.20.10.5:5000}"
profile_dir="${HOME}/.config/pos-kiosk/chromium-profile"
browser=""

for candidate in chromium chromium-browser google-chrome; do
  if command -v "$candidate" >/dev/null 2>&1; then
    browser="$(command -v "$candidate")"
    break
  fi
done

if [[ -z "$browser" ]]; then
  printf 'Chrome/Chromium not found. Install Chromium, then run this launcher again.\n' >&2
  exit 1
fi

mkdir -p "$profile_dir"
POS_KIOSK_PROFILE_DIR="$profile_dir" python3 - <<'PY'
import json
import os
from pathlib import Path

preferences_path = Path(os.environ["POS_KIOSK_PROFILE_DIR"]) / "Default" / "Preferences"
preferences_path.parent.mkdir(parents=True, exist_ok=True)
try:
  preferences = json.loads(preferences_path.read_text(encoding="utf-8"))
except FileNotFoundError:
  preferences = {}

app_state = preferences.setdefault("printing", {}).setdefault(
  "print_preview_sticky_settings", {}
).get("appState", "")
try:
  app_state = json.loads(app_state) if app_state else {"version": 2}
except json.JSONDecodeError:
  app_state = {"version": 2}
app_state["isHeaderFooterEnabled"] = False
preferences["printing"]["print_preview_sticky_settings"]["appState"] = json.dumps(
  app_state, separators=(",", ":")
)
preferences_path.write_text(json.dumps(preferences, separators=(",", ":")), encoding="utf-8")
PY
exec "$browser" --user-data-dir="$profile_dir" --app="$server_url" --kiosk --kiosk-printing --no-first-run