# Video Examples

Source code to accompany our YouTube video series. Find the script mentioned in a video description, clone this repo, and run it on your own machine.

## How to Use

1. Clone the repo: `git clone https://github.com/browserless/video-examples.git`
2. Navigate to the relevant script folder (linked in each video description)
3. Follow the `README.md` inside that folder

## Videos & Scripts

| Video | Folder | Endpoints |
|-------|--------|-----------|
| Handling 2FA with Browserless LiveURL | [`hybrid-2fa/`](./hybrid-2fa) | LiveURL |
| Persisting State — Session Management | [`persisting-state/`](./persisting-state) | Sessions |
| Standard Sessions — Session Management | [`standard-sessions/`](./standard-sessions) | Sessions |
| Web Scraping with Browserless | [`webscraping/`](./webscraping) | `/content`, `/scrape`, `/smart-scrape`, `/unblock` |
| Solving CAPTCHAs with Puppeteer & Playwright | [`SolveCaptchaPuppeteerPlaywright/`](./SolveCaptchaPuppeteerPlaywright) | `/unblock` (solveCaptchas) |
| Crawl, Search & Map with Browserless | [`crawl-search-map/`](./crawl-search-map) | `/crawl`, `/search`, `/map` |
| Amazon Bot Detection & Scraping at Scale | [`amazon-scraper/`](./amazon-scraper) | `/stealth` |
| News Scraper — daily briefing with Claude Scheduler | [`news-scraper/`](./news-scraper) | `/chromium/stealth` |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Python 3](https://www.python.org/) 3.8+ (for scripts that use Python)
- A [Browserless](https://browserless.io) API token
