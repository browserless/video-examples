# Browserless · Authenticated Profiles Demo

A minimal Express + vanilla JS walkthrough of Browserless Authenticated
Profiles. Each of the four steps is triggered manually from the UI so you
can see the API surface in isolation.

## Steps

1. **Create Browser** — `POST /profile` and connect via `puppeteer-core`.
2. **Authenticate** — Navigate to the login page and request a `Browserless.liveURL`
   via CDP. The LiveURL is embedded in an iframe so the user logs in
   manually — credentials never touch the backend.
3. **Save Profile** — `Browserless.saveProfile` via CDP. Cookies and
   localStorage are persisted under the profile name. The creation session
   is closed afterwards.
4. **Reuse Profile** — `/screenshot` and `/pdf` called in parallel with
   `?profile=amplitude-profile`. No login needed; Browserless hydrates the
   session from the saved state.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and fill in BROWSERLESS_TOKEN (only required var)
node server.mjs
```

Open http://localhost:3000

Swap the `DASHBOARD_URL` placeholder near the top of `server.mjs` for the
authenticated URL you want to capture in step 4.

## Env vars

| Variable             | Required | Description                                           |
|----------------------|----------|-------------------------------------------------------|
| `BROWSERLESS_TOKEN`  | yes      | Your Browserless API token                            |
| `BROWSERLESS_BASE`   | no       | Defaults to `https://production-sfo.browserless.io`   |

## UI

- **Left sidebar:** the four steps. The status dot turns yellow while a step
  runs, green on success, red on error.
- **Code panel (centre):** the *educational* excerpt for the active step,
  styled as a macOS window. Lines highlight as the server executes them.
- **Terminal panel (right):** live `text/event-stream` output from the
  server, styled as a Terminal window. Step 2 renders the LiveURL iframe
  beneath the terminal; step 4 renders the screenshot + PDF download
  side-by-side.
- **Dev drawer (bottom):** click to expand. Shows current server config
  (base URL, masked token, etc.) and a live log of every upstream
  request/response so you can debug 401s and the like.

## Requirements

- Node >= 18 (uses native `fetch`)
- Dependencies: `express`, `puppeteer-core`
