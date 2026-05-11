#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ -d ".venv" ] && ! .venv/bin/python --version >/dev/null 2>&1; then
    echo "Stale .venv detected (Python interpreter broken). Removing..."
    rm -rf .venv
fi

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment in .venv..."
    python3 -m venv .venv
fi

echo "Installing dependencies..."
.venv/bin/pip install --upgrade pip
.venv/bin/pip install browser-use openai rich python-dotenv

cat <<'EOF'

✅  Setup complete.

Next steps:
  1. cp .env.example .env
  2. Edit .env and fill in BROWSERLESS_TOKEN and OPENAI_API_KEY
  3. source .venv/bin/activate
  4. python main.py

EOF
