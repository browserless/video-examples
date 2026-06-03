# Browserless · Crawl, Search & Map Demo

An interactive Express + vanilla JS dashboard demonstrating three Browserless
endpoints side by side: `/crawl`, `/search`, and `/map`.

## Endpoints covered

- **`/crawl`** — recursively scrape a site and stream live progress via SSE.
  Compare a plain `fetch()` against Browserless to show the difference.
- **`/search`** — run a web search query through Browserless and get clean,
  structured results without CAPTCHA blocks.
- **`/map`** — discover all URLs on a site (sitemap-aware) and render them as
  a clickable tree.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and fill in BROWSERLESS_TOKEN
node server.js
```

Open http://localhost:3000

## Env vars

| Variable            | Required | Description                                         |
|---------------------|----------|-----------------------------------------------------|
| `BROWSERLESS_TOKEN` | yes      | Your Browserless API token                          |
| `BROWSERLESS_BASE`  | no       | Defaults to `https://production-sfo.browserless.io` |
| `PORT`              | no       | HTTP port (default `3000`)                          |

## Requirements

- Node >= 18 (uses native `fetch`)
- Dependencies: `express`, `dotenv`
