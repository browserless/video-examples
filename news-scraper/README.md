# Browserless · News Scraper

A news scraper that uses [Playwright](https://playwright.dev/) with Browserless stealth
features to gather relevant links from a set of source sites. The output is a plain CSV of
recent articles that can then be processed by an LLM, so an assistant has knowledge of recent
news relevant to the user.

This is a support resource for a YouTube video. In that video, a Claude Scheduled Task processes
the scraped CSV and sends you a Slack DM with the links most relevant to your particular
interests. The scraping half lives here. The Claude half is a scheduled task you configure
separately, pointed at the CSV this scraper produces.

## How it works

- `scrape.js` connects to a remote browser over CDP against the Browserless stealth endpoint
  (`/chromium/stealth`), so there is no local Chromium and bot defenses are handled for you. For
  each source it opens a fresh stealth session, pulls the title, url, published date, and excerpt
  from the listing page, filters to the last 7 days, then closes the session. Sessions run up to
  9 in parallel, since going over the account concurrency returns 429.
- `export-csv.js` runs `scrape.js`, then writes every recent item to
  `output/scraped-all-items.csv`. Before overwriting, it moves the previous CSV into
  `output/Previous runs/` (named with its timestamp) so history is never lost. It only archives
  and rewrites when the scrape actually returned items, and it retries once on an empty result,
  so a transient network blip never wipes the last good file.
- `setup-launchd.sh` wires the whole thing to run automatically every day on macOS with launchd.

## Files

- **`scrape.js`** — the Playwright stealth scraper.
- **`export-csv.js`** — runs the scraper and writes the CSV the LLM step reads.
- **`sources.json`** — the source sites and their CSS selectors. Edit this to add or swap sites.
- **`setup-launchd.sh`** — one command macOS setup for a daily scheduled run.
- **`CLAUDE_SCHEDULED_TASK_PROMPT.md`** — a ready to adapt prompt for the Claude Scheduled Task
  that reads the CSV and sends the Slack briefing.

## Quick start (macOS)

```bash
git clone https://github.com/browserless/video-examples.git
cd video-examples/news-scraper
cp .env.example .env        # then open .env and paste your BROWSERLESS_TOKEN
./setup-launchd.sh
```

`setup-launchd.sh` detects your Node install, installs dependencies, writes and loads a launchd
agent, and runs one test so you watch the CSV appear. From then on it refreshes
`output/scraped-all-items.csv` every day at 06:00. Change the time with
`SCRAPE_HOUR=7 SCRAPE_MINUTE=30 ./setup-launchd.sh`, or remove it with
`./setup-launchd.sh --uninstall`. Logs land in `~/Library/Logs/news-scraper/`.

## Run it once by hand (any OS)

```bash
npm install
node export-csv.js
```

## The CSV

`output/scraped-all-items.csv` has one row per recent article with these columns:

```
source, publishedDate, title, url, excerpt
```

That is all an LLM needs to understand what was scraped and pick the items worth surfacing.
Some listing pages do not print an excerpt on the card, so those rows carry a title, url, and
date but an empty excerpt. That is expected.

## The Claude Scheduled Task (the LLM half)

Configure a Claude Scheduled Task with the prompt in `CLAUDE_SCHEDULED_TASK_PROMPT.md`. It reads
the CSV this scraper writes, keeps only the articles that match your interests, and DMs you the
most relevant links on Slack. Point it at the absolute path of `output/scraped-all-items.csv` on
your machine, and schedule it a little after the scraper's daily run so it always reads fresh
data.

## Requirements

- macOS for the automated launchd setup (the scraper itself runs anywhere Node runs).
- Node 18 or newer.
- A [Browserless](https://browserless.io) API token.
