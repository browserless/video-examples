# Browserless · News Scraper

A news scraper that uses [Playwright](https://playwright.dev/) with Browserless stealth
features to gather relevant links from a set of source sites. The output is a plain CSV of
recent articles that can then be processed by an LLM, so an assistant has knowledge of recent
news relevant to the user.

This is a support resource for a YouTube video. There are two halves:

- **The scraper** (this folder) runs on a daily schedule and keeps `output/scraped-all-items.csv`
  fresh. You install it once.
- **The Claude Scheduled Task** reads that CSV, keeps the articles that match your interests, and
  sends you a Slack DM. It is a separate scheduled task you configure with the prompt in this folder.

You wire up both with two copy-paste prompts: a **setup prompt** (below) that you paste into Claude
Code to install the scraper, and `CLAUDE_SCHEDULED_TASK_PROMPT.md`, which is the prompt you paste
into the Claude Scheduled Task itself.

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
- **`CLAUDE_SCHEDULED_TASK_PROMPT.md`** — the prompt you paste into the Claude Scheduled Task. It
  reads the CSV, filters to your topics, and sends the Slack briefing. Nothing else.

## Quick start (macOS)

```bash
git clone https://github.com/browserless/video-examples.git
cd video-examples/news-scraper
cp .env.example .env        # then open .env and paste your BROWSERLESS_TOKEN
./setup-launchd.sh
```

`setup-launchd.sh` detects your Node install, installs dependencies, writes and loads a launchd
agent, and runs one test so you watch the CSV appear. From then on it refreshes
`output/scraped-all-items.csv` every day at 09:00. Change the time with
`SCRAPE_HOUR=7 SCRAPE_MINUTE=30 ./setup-launchd.sh`, or remove it with
`./setup-launchd.sh --uninstall`. Logs land in `~/Library/Logs/news-scraper/`.

## Set it up with Claude Code (the setup prompt)

Prefer not to run the setup by hand? Paste the prompt below into Claude Code from a checkout of
this repo. It installs the daily scraper and then prints the two values you will paste into the
briefing task: your CSV path and your Slack user ID.

```
You are setting up the news-scraper example from this repo on my Mac. Work from the repo root and
walk me through each step, stopping to ask whenever you need me.

1. If node_modules does not exist, run:  npm install
2. If .env does not exist, run:  cp .env.example .env  — then STOP and ask me to paste my
   BROWSERLESS_TOKEN into .env. Never type, print, or read the token yourself. Wait until I confirm.
3. Install the daily scraper: run  ./setup-launchd.sh . It writes a launchd agent that scrapes once
   a day and refreshes output/scraped-all-items.csv, and it runs one test scrape now. If it errors,
   show me the error and stop.
4. Confirm output/scraped-all-items.csv exists, then print its absolute path — I need it for the
   briefing task.
5. Help me find my Slack user ID: look me up by my email with the Slack user-search tool, or ask me
   for it, and print it.

When everything is in place, tell me to open CLAUDE_SCHEDULED_TASK_PROMPT.md, fill in the CSV path,
my Slack user ID, and my topics, and paste it into a Claude Scheduled Task scheduled a little after
the daily scrape. Do not send any Slack messages yourself.
```

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

## The Claude Scheduled Task (the briefing prompt)

Once the scraper is installed, create a Claude Scheduled Task and paste in the prompt from
`CLAUDE_SCHEDULED_TASK_PROMPT.md`. Before pasting, fill in its three EDIT ME lines: the absolute
path to your `output/scraped-all-items.csv`, your topics, and your Slack user ID. The task reads the
CSV, keeps only the articles that match your topics, groups them, and DMs you the most relevant
links on Slack — nothing else.

Schedule it a little after the scraper's daily run (the scraper defaults to 09:00, so 09:30 is a
safe default) so it always reads a freshly refreshed CSV. You will need the Slack connector enabled
for the send-message tool.

## Requirements

- macOS for the automated launchd setup (the scraper itself runs anywhere Node runs).
- Node 18 or newer.
- A [Browserless](https://browserless.io) API token.
