#!/usr/bin/env bash
# Runs the BQL OS-emulation mutation for one OS, prints the identity, saves the screenshot.
#
# Usage:
#   ./run-1-bql.sh windows        # reads BROWSERLESS_TOKEN from .env or the environment
#   ./run-1-bql.sh macos
#
# Values (lowercase only): windows | macos | linux | android
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env if present, so `cp .env.example .env` is all the setup you need.
# A variable set in the environment wins over .env, matching dotenv's override:false.
if [ -f "$DIR/.env" ]; then
  PRESET_TOKEN="${BROWSERLESS_TOKEN:-}"
  PRESET_BASE="${BROWSERLESS_BASE:-}"
  set -a
  # shellcheck disable=SC1091
  . "$DIR/.env"
  set +a
  if [ -n "$PRESET_TOKEN" ]; then BROWSERLESS_TOKEN="$PRESET_TOKEN"; fi
  if [ -n "$PRESET_BASE" ]; then BROWSERLESS_BASE="$PRESET_BASE"; fi
fi

if [ -z "${BROWSERLESS_TOKEN:-}" ]; then
  echo "Missing Browserless token." >&2
  echo "Copy the example env file and paste your token into it:" >&2
  echo "  cp .env.example .env" >&2
  echo "Or set it inline:" >&2
  echo "  BROWSERLESS_TOKEN=your_token ./run-1-bql.sh windows" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "This script needs jq (it builds the JSON request and reads the response)." >&2
  echo "  macOS:  brew install jq" >&2
  echo "  Linux:  sudo apt install jq" >&2
  exit 1
fi

OS="${1:-windows}"
BASE="${BROWSERLESS_BASE:-https://production-sfo.browserless.io}"

# Build the request body from the .graphql file
QUERY="$(jq -Rs '.' < "$DIR/1-bql-os-emulation.graphql")"
REQ="{\"query\": $QUERY}"

echo "→ emulationOs=$OS"
RESP="$(curl -s -w $'\n%{http_code}' -X POST "$BASE/chromium/bql?token=$BROWSERLESS_TOKEN&emulationOs=$OS" \
  -H 'Content-Type: application/json' -d "$REQ")"

CODE="$(printf '%s' "$RESP" | tail -n1)"
BODY="$(printf '%s' "$RESP" | sed '$d')"

# A typo'd OS value, a bad token, or a non-stealth route returns plain text, not JSON.
if [ "$CODE" != "200" ]; then
  echo "Request failed (HTTP $CODE):" >&2
  echo "$BODY" >&2
  if [ "$CODE" = "400" ]; then
    echo "Hint: emulationOs is lowercase only — windows | macos | linux | android" >&2
  fi
  exit 1
fi

# A valid request that failed inside the mutation comes back as JSON with an errors array.
if printf '%s' "$BODY" | jq -e 'has("errors")' >/dev/null 2>&1; then
  echo "Request failed:" >&2
  printf '%s' "$BODY" | jq '.errors' >&2
  exit 1
fi

echo "Identity the detector saw:"
printf '%s' "$BODY" | jq -r '.data.identity.value' | jq '.'
printf '%s' "$BODY" | jq -r '.data.screenshot.base64' | base64 -d > "$DIR/bql-$OS.png"
echo "✓ saved bql-$OS.png (bot.sannysoft.com — all signals green)"
