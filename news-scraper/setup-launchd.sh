#!/usr/bin/env bash
#
# One command setup for running the scraper automatically on macOS with launchd.
#
# It detects your Node install and paths, installs dependencies, writes a LaunchAgent,
# loads it, and runs one test so you can see the CSV appear. Re-run it any time, for
# example after changing your Node version. Use --uninstall to remove it.
#
# Usage:
#   ./setup-launchd.sh
#   ./setup-launchd.sh --uninstall
#
# Optional: change the daily run time with SCRAPE_HOUR and SCRAPE_MINUTE, for example
#   SCRAPE_HOUR=7 SCRAPE_MINUTE=30 ./setup-launchd.sh

set -euo pipefail

LABEL="com.browserless.news-scraper"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/news-scraper"
DOMAIN="gui/$(id -u)"
HOUR="${SCRAPE_HOUR:-9}"
MINUTE="${SCRAPE_MINUTE:-0}"

uninstall() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the $LABEL agent. Your project files and logs are left in place."
  exit 0
}
[ "${1:-}" = "--uninstall" ] && uninstall

# macOS only, launchd does not exist elsewhere.
[ "$(uname)" = "Darwin" ] || { echo "This script is for macOS only."; exit 1; }

# Find Node. We bake its absolute path into the agent so launchd does not need your shell.
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "Node was not found. Install Node 18 or newer from https://nodejs.org and re-run."; exit 1; }
NODE_DIR="$(dirname "$NODE_BIN")"

# The token lives in .env. Make sure it exists and is not still the placeholder.
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "No .env file yet. Run this first, then add your token:"
  echo "  cp .env.example .env"
  echo "  # then edit .env and set BROWSERLESS_TOKEN"
  exit 1
fi
if ! grep -qE '^BROWSERLESS_TOKEN=.+' "$PROJECT_DIR/.env" || grep -qE '^BROWSERLESS_TOKEN=your-browserless-token$' "$PROJECT_DIR/.env"; then
  echo "Set a real BROWSERLESS_TOKEN in $PROJECT_DIR/.env, then re-run."
  exit 1
fi

echo "Project:  $PROJECT_DIR"
echo "Node:     $NODE_BIN"
echo "Schedule: daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "Logs:     $LOG_DIR"
echo ""

echo "Installing dependencies..."
( cd "$PROJECT_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 ) || { echo "npm install failed. Run 'npm install' manually to see the error."; exit 1; }

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

# Write the LaunchAgent with the detected paths. Logs go under ~/Library/Logs, which is
# not protected by macOS privacy controls, so launchd can always write there even when the
# project lives in a protected folder like ~/Documents.
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/export-csv.js</string>
    </array>
    <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key><string>$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key><string>$HOME</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>
    <key>RunAtLoad</key><false/>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>$LOG_DIR/scraper.out.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/scraper.err.log</string>
</dict>
</plist>
PLIST_EOF

plutil -lint "$PLIST" >/dev/null

# Load it, reloading cleanly if it was already installed.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"

echo "Loaded. Running one test now, this takes about 40 seconds..."
: > "$LOG_DIR/scraper.out.log"
: > "$LOG_DIR/scraper.err.log"
launchctl kickstart -k "$DOMAIN/$LABEL"

for _ in $(seq 1 60); do
  if grep -qE '\[export-csv\] wrote|no items scraped|fatal' "$LOG_DIR/scraper.out.log" "$LOG_DIR/scraper.err.log" 2>/dev/null; then
    break
  fi
  sleep 3
done

CSV="$PROJECT_DIR/output/scraped-all-items.csv"
if [ -f "$CSV" ]; then
  echo ""
  echo "Success. The scraper wrote $(( $(wc -l < "$CSV") - 1 )) items to:"
  echo "  $CSV"
  echo ""
  echo "It will now refresh automatically every day at $(printf '%02d:%02d' "$HOUR" "$MINUTE")."
  echo "Point your Claude Scheduled Task at that CSV path to build the briefing."
else
  echo ""
  echo "The test run did not produce a CSV. Check the logs:"
  echo "  $LOG_DIR/scraper.out.log"
  echo "  $LOG_DIR/scraper.err.log"
  exit 1
fi
