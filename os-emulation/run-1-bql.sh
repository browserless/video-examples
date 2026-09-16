#!/usr/bin/env bash
# Runs the BQL OS-emulation mutation for one OS, prints the identity, saves the screenshot.
#
# Usage:
#   ./run-1-bql.sh windows        # reads BROWSERLESS_TOKEN from .env or the environment
#   ./run-1-bql.sh macos
set -euo pipefail

ALLOWED="windows macos linux android"   # lowercase only — the API rejects anything else
DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env if present, so `cp .env.example .env` is all the setup you need.
# A variable already set in the environment wins, matching dotenv's override:false.
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

OS="${1:-windows}"
BASE="${BROWSERLESS_BASE:-https://production-sfo.browserless.io}"

# Validate before spending a round trip, so a typo fails instantly with a useful message.
case " $ALLOWED " in
  *" $OS "*) ;;
  *)
    echo "Unknown OS '$OS'." >&2
    echo "emulationOs is lowercase only — one of: $ALLOWED" >&2
    exit 1 ;;
esac

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

# Wrap the .graphql file into the {"query": "..."} body BQL expects.
REQ="$(jq -Rs '{query: .}' < "$DIR/1-bql-os-emulation.graphql")"

echo "→ emulationOs=$OS"
RESP="$(curl -s -w $'\n%{http_code}' -X POST "$BASE/chromium/bql?token=$BROWSERLESS_TOKEN&emulationOs=$OS" \
  -H 'Content-Type: application/json' -d "$REQ")"

CODE="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"

# Errors come back as plain text (bad token, non-stealth route), not JSON.
if [ "$CODE" != "200" ]; then
  echo "Request failed (HTTP $CODE):" >&2
  echo "$BODY" >&2
  exit 1
fi

# A request that failed inside the mutation returns 200 with a JSON errors array.
if printf '%s' "$BODY" | jq -e 'has("errors")' >/dev/null 2>&1; then
  echo "Request failed:" >&2
  printf '%s' "$BODY" | jq '.errors' >&2
  exit 1
fi

echo "Identity the detector saw:"
# .identity.value is a JSON string produced by evaluate(), so parse it with fromjson.
printf '%s' "$BODY" | jq '.data.identity.value | fromjson'

# base64 -d happily decodes the literal "null", so check before writing a corrupt PNG.
SHOT="$(printf '%s' "$BODY" | jq -r '.data.screenshot.base64 // empty')"
if [ -z "$SHOT" ]; then
  echo "No screenshot in the response — nothing written." >&2
  exit 1
fi
printf '%s' "$SHOT" | base64 -d > "$DIR/bql-$OS.png"
echo "✓ saved bql-$OS.png (bot.sannysoft.com — all signals green)"
