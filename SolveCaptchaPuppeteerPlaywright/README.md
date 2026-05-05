# Solving CAPTCHAs with Browserless (Puppeteer & Playwright)

Companion scripts for the **Solve CAPTCHAs with Puppeteer & Playwright** video.

These scripts demonstrate how to detect and solve reCAPTCHA v2 challenges using Browserless's stealth endpoint with residential proxies. Three approaches are included:

- **`captcha-puppeteer.js`** — Manual flow with Puppeteer. Listens for `Browserless.captchaFound` and triggers `Browserless.solveCaptcha` on demand.
- **`captcha-playwright.js`** — Same manual flow as above, but using Playwright's `connectOverCDP`.
- **`captcha-puppeteer-auto.js`** — Automatic flow with Puppeteer. Adds `solveCaptchas=true` to the connection URL so Browserless solves CAPTCHAs automatically; the script just listens for `Browserless.captchaAutoSolved`.

## Prerequisites

- Node.js v18+
- A [Browserless](https://browserless.io) API token

## Setup

```bash
npm install
mkdir -p screenshots
```

Open each script and replace `YOUR_API_TOKEN_HERE` with your Browserless API token:

```js
const token = "YOUR_API_TOKEN_HERE";
```

## Run

```bash
npm run puppeteer   # manual solve, Puppeteer
npm run playwright  # manual solve, Playwright
npm run auto        # automatic solve, Puppeteer
```

Each script navigates to the 2captcha reCAPTCHA v2 demo, solves the challenge, clicks the "Check" button, and saves a screenshot to `./screenshots/screenshot.png`.

## Key Concepts

- **`/stealth` endpoint** — Browserless stealth browser with anti-bot measures
- **`proxy=residential&proxyCountry=us`** — Routes through a residential US proxy (often required for reCAPTCHA to behave naturally)
- **`Browserless.captchaFound`** — CDP event fired when a CAPTCHA is detected on the page
- **`Browserless.solveCaptcha`** — CDP command that triggers the solver
- **`solveCaptchas=true`** — Connection-string flag that enables automatic solving; pair with the **`Browserless.captchaAutoSolved`** event

## Docs

- [CAPTCHA Solving](https://docs.browserless.io/baas/captchas)
- [Stealth Mode](https://docs.browserless.io/baas/stealth)
- [Residential Proxies](https://docs.browserless.io/baas/proxying)
