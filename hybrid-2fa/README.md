# Handling 2FA with Browserless LiveURL

Companion script for the **Handling 2FA with Browserless LiveURL** video.

This script automates the login flow up to the 2FA prompt, then hands control back to you via a Browserless LiveURL — a shareable, interactive browser session you open in any browser tab to complete the 2FA step manually.

## Prerequisites

- Node.js v18+
- A [Browserless](https://browserless.io) API token

## Setup

```bash
npm install
```

Open `index.js` and replace `YOUR_API_TOKEN_HERE` with your Browserless API token:

```js
const API_TOKEN = "YOUR_API_TOKEN_HERE";
```

## Run

```bash
npm start
```

The script will:

1. Navigate to the Proton Mail login page
2. Enter the demo credentials
3. Detect the 2FA prompt
4. Print a LiveURL to your terminal
5. Wait for you to open the URL, enter your 2FA code, and authenticate
6. Close the browser once authentication is complete

## Notes

- The demo account credentials (`2fahybridtest` / `HybridTest2FA!`) are used only to illustrate the flow. Swap them for your own account to test against a real 2FA setup.
- The LiveURL expires after 3 minutes by default (configurable via the `timeout` option in `Browserless.liveURL`).
