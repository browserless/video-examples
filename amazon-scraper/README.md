# Amazon Scraper — Browserless Demo

A two-part example showing how Amazon's bot detection responds to plain HTTP scraping at scale, and how Browserless stealth + residential proxies bypass it.

## What's included

| File | Purpose |
|---|---|
| `amazon-scale-test.js` | Plain HTTP stress test — no browser, no proxy. Watch Amazon block requests as volume climbs. |
| `working.js` | Browserless search scraper — extracts all product cards from a search results page. |
| `product.js` | Browserless product scraper — extracts full detail (title, price, specs, bullets, images) from a single `/dp/` URL. |
| `server.js` | Express server that powers the demo UI. Streams scraper output via SSE and serves screenshots. |
| `public/index.html` | Interactive demo UI with live browser preview, IDE-style code panel, and a compare slider for clean vs. highlighted screenshots. |

---

## Part 1 — Plain HTTP scale test

Demonstrates bot detection without any dependencies or API key.

```bash
node amazon-scale-test.js
# or
SEARCH_QUERY="standing desk" node amazon-scale-test.js
```

The script fetches an Amazon search page, extracts product URLs, then hits each product 5 times in sequence. Output shows the response size per hit — watch it drop from ~2000 KB (real page) to ~2 KB (bot-check wall) as Amazon's Akamai layer flags the IP.

---

## Part 2 — Browserless UI demo

### Prerequisites

- Node.js 18+
- A [Browserless](https://browserless.io) API token

### Setup

```bash
npm install
cp .env.example .env
# edit .env and add your token:
# BROWSERLESS_TOKEN=your_token_here
```

### Run the demo UI

```bash
node server.js
# open http://localhost:3456
```

The UI has two tabs:

**Search Scraper** — enter any search term and click **Search**. `working.js` runs in the background: it connects to Browserless, navigates to Amazon, extracts every product card, saves `amazon-data.json`, and takes two full-page screenshots (clean + highlighted with colour-coded CSS outlines per field).

**Product Scraper** — paste any Amazon `/dp/` URL and click **Scrape Product**. `product.js` runs the same way and saves `product-data.json`.

While each scrape runs, the left panel streams a live viewport preview so you can watch the browser in real time. The right panel shows an IDE-style view of the script with the active step highlighted as it progresses.

> **Note:** The live browser preview panel is an optional UI demo feature. The scraping and data extraction in `working.js` and `product.js` work perfectly without it — if you run either script standalone (`node working.js`), the screenshots and JSON output are saved to disk just the same.

### Run the scrapers standalone (no UI)

```bash
# Search scraper
BROWSERLESS_TOKEN=your_token SEARCH_QUERY="mechanical keyboard" node working.js

# Product scraper
BROWSERLESS_TOKEN=your_token PRODUCT_URL="https://www.amazon.com/dp/B08N5WRWNW" node product.js
```

---

## How it works

### Why plain HTTP fails at scale

Amazon uses [Akamai Bot Manager](https://www.akamai.com/solutions/security/bot-management) to fingerprint every incoming request. A raw HTTPS request — even with a real `User-Agent` header — is missing cookies, a valid TLS fingerprint, HTTP/2 frame ordering, and browser-specific behaviour. Amazon detects these gaps and blocks the IP, often after just a handful of requests.

### How Browserless bypasses it

Browserless's `/stealth` endpoint runs a real Chromium browser with:

- **Stealth patches** — removes Puppeteer's automation fingerprints that bot detectors look for
- **Residential proxy** (`proxy=residential&proxyCountry=us`) — routes traffic through real consumer IP addresses with correct geolocation, so requests look like they come from a real US household

The result: the same scraping logic that gets blocked immediately over plain HTTP succeeds reliably through Browserless.
