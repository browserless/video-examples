# Standard Sessions Demo — ProtonMail 2FA Login

Demonstrates Browserless **Standard Sessions** using the `Browserless.reconnect` CDP command.
The browser stays alive between connections within a timeout window, preserving the full live state (open pages, form inputs, navigation history).

## What it does

1. Connects to Browserless, enters ProtonMail credentials, detects the 2FA page
2. Calls `Browserless.reconnect` and disconnects — the browser stays alive on the server
3. You enter your 2FA code in the web UI; it reconnects, types the code, and waits for the inbox
4. Takes a screenshot and sets up another reconnect window for refreshing
5. You can keep refreshing the screenshot (each refresh creates a new reconnect window)
6. Logout closes the browser permanently

## Setup

```bash
npm install
```

## Run

```bash
BROWSERLESS_TOKEN=your_token_here node index.js
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSERLESS_TOKEN` | `YOUR_API_TOKEN_HERE` | Your Browserless API token |
| `BROWSERLESS_ENDPOINT` | `production-sfo.browserless.io` | Browserless endpoint |
| `PORT` | `3000` | Express server port |

## Key Concepts

- **`Browserless.reconnect`** — CDP command that flags the browser as reconnectable for a given timeout
- **`browser.disconnect()`** — Detaches locally; browser keeps running on the server
- **`browserWSEndpoint`** — The new WebSocket URL returned by reconnect. Append `?token=TOKEN` to use it
- Each reconnect generates a **new** `browserWSEndpoint`

## Docs

- [Standard Sessions](https://docs.browserless.io/baas/session-management/standard-sessions)
- [Session Management Overview](https://docs.browserless.io/baas/session-management)
