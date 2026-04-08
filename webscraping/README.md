# Web Scraping Video — Demo Scripts

## Scripts

| File | Endpoint | Language | Target | Token needed? |
|------|----------|----------|--------|--------------|
| demo1-content-broken.py | None | Python | scrapingcourse.com | No |
| demo1-content-fixed.py | /content | Python | scrapingcourse.com | Yes |
| demo2-scrape.mjs | /scrape | JavaScript | webscraper.io | Yes |
| demo3-smart-scrape.mjs | /smart-scrape | JavaScript | Hacker News | Yes |
| demo4-unblock-broken.py | None | Python | StockX | No |
| demo4-unblock-fixed.mjs | /unblock | JavaScript | StockX | Yes |

## Setup

export BROWSERLESS_TOKEN=your_token_here

## Run order (matches video)

1. python demo1-content-broken.py
2. python demo1-content-fixed.py
3. node demo2-scrape.mjs
4. node demo3-smart-scrape.mjs
5. python demo4-unblock-broken.py
6. node demo4-unblock-fixed.mjs

## Requirements

- Python 3.x: pip install requests beautifulsoup4
- Node.js 18+ (for native fetch and top-level await in .mjs files)
