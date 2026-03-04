# Persisting State Demo — ProtonMail 2FA Login

Demonstrates Browserless **Persisting State** using the REST Session API.
Browser data (cookies, localStorage, cache) persists on disk for the session's TTL (7 days), surviving browser restarts. Reconnect anytime without re-authenticating.

## What it does

1. Creates a session via `POST /session` with `processKeepAlive` to keep the browser alive during 2FA
2. Connects, enters ProtonMail credentials, detects the 2FA page, then disconnects (browser stays alive)
3. You enter your 2FA code; it reconnects to the still-alive browser, types the code, waits for the inbox
4. Takes a screenshot and closes the browser (session data persists on disk)
5. "Refresh screenshot" opens a **new** browser process (cookies restored from disk — still logged in), takes a screenshot, and closes
6. "Delete browser state" logs out, closes the browser, and sends `DELETE` to `session.stop` to permanently remove the session

## Setup

```bash
npm install
```

## Run

```bash
BROWSERLESS_TOKEN=your_token_here node index.js
```

Open http://localhost:3001 in your browser.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSERLESS_TOKEN` | `YOUR_API_TOKEN_HERE` | Your Browserless API token |
| `BROWSERLESS_ENDPOINT` | `production-sfo.browserless.io` | Browserless endpoint |
| `PORT` | `3001` | Express server port |

## Key Concepts

- **Session API** — `POST /session` creates a session; response includes `connect` (WSS URL) and `stop` (DELETE URL)
- **`processKeepAlive`** — Keeps browser process alive for N ms after disconnect. Within that window, reconnecting restores the full live state
- **Persisted data** — After `processKeepAlive` expires, data (cookies, localStorage) is still restored from disk on reconnect
- **`session.connect`** — Same URL works for every reconnect (unlike Standard Sessions which generate a new endpoint each time)
- **`session.stop`** — `DELETE` this URL to permanently remove the session and all its data

## Docs

- [Persisting State](https://docs.browserless.io/baas/session-management/persisting-state)
- [Session Management Overview](https://docs.browserless.io/baas/session-management)
