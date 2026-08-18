# Claude Scheduled Task prompt: daily news briefing to Slack

This is the LLM half of the example. On each run it **triggers a fresh scrape itself** (by kicking
the launchd agent that `setup-launchd.sh` installed), waits for the new CSV, keeps only what
matches your interests, and sends you a Slack DM with the most relevant links. Because it triggers
the scrape, you do not have to time this task around the scraper's daily run — it always briefs on
data it just refreshed. The daily launchd run still keeps a recent CSV around as a backstop.

You do not have to set anything up by hand first. Paste the block below into Claude Code from a
checkout of this repo, and on the first run it walks you through setup (dependencies, your
Browserless token, the launchd agent, and your Slack user ID), then triggers a scrape and sends
the briefing. On later runs the setup checks pass instantly and it just refreshes and briefs. The
one thing worth editing up front is your interests, marked EDIT ME in Step 3.

You can also run it as a Claude Scheduled Task once setup is done — schedule it whenever you want
your briefing, since it refreshes the data itself and no longer has to line up with the scraper's
cron.

---

```
You are running a daily news briefing for yourself. Work from a checkout of this repo
(video-examples/news-scraper) and run every command from that folder. Complete these steps in order.

## Step 0 — Set up on the first run (these checks are quick to repeat every run)
Get each piece below in place, handholding me through anything that is missing. If a detail is
unclear, read this repo's README.md. Do not skip a check just because it "should" already be done.

1. Dependencies. If node_modules does not exist, run:  npm install

2. Browserless token. If .env does not exist, run:  cp .env.example .env
   Then STOP and ask me to paste my BROWSERLESS_TOKEN into .env. Do NOT type, print, echo, or read
   the token yourself — it is a secret I add by hand. Do not continue until I confirm it is set.

3. The scraper's launchd agent. Check whether it is installed:
     launchctl list | grep com.browserless.news-scraper
   If it is not listed, install it by running:  ./setup-launchd.sh
   That script installs dependencies, writes and loads the launchd agent, and runs one test scrape.
   If it prints an error, show me the error and stop; do not continue on a broken setup.

4. Slack. Make sure the Slack connector is enabled so the send-message tool exists. If you do not
   already have my Slack user ID, look me up by my email with the Slack user-search tool, or ask me
   for it, and confirm it starts with U. The briefing is a DM to ME only — never a channel or anyone
   else. Remember this ID for Step 5.

Useful facts for later steps: the launchd agent is labeled com.browserless.news-scraper, it runs
export-csv.js, and it writes output/scraped-all-items.csv.

## Step 1 — Trigger a fresh scrape and wait for it
Do not brief on whatever CSV happens to be on disk. Note the current time, then kick the scraper's
launchd job so it refreshes the CSV now:

  launchctl kickstart -k "gui/$(id -u)/com.browserless.news-scraper"

The job runs asynchronously, so wait for it before reading anything:
- Poll  launchctl list | grep com.browserless.news-scraper  until the first column (the PID) is no
  longer a number — that means the job has exited.
- Then read the second column, the last exit status: 0 means success, anything else is a failure.
- Confirm output/scraped-all-items.csv now has a modification time NEWER than the time you noted
  before the kickstart. If it is not newer, the scrape did not refresh the file.
Logs for troubleshooting are at ~/Library/Logs/news-scraper/scraper.out.log and scraper.err.log.

If launchctl reports the job is not loaded, the launchd agent is not installed yet: run
./setup-launchd.sh once (see the README), or as a one-off, run  node export-csv.js  yourself from
the repo root and wait for it to finish.

## Step 2 — Stop early if the data is not usable
Do not brief on bad data. Send a short Slack DM saying briefly what failed, then stop, if any of
these are true:
- The scrape job exited non-zero, or output/scraped-all-items.csv did not refresh (its modified
  time is not newer than your Step 1 start time). The scraper did not actually produce new data.
- The file is missing or empty.
- The file's last modified time is more than 26 hours old (a backstop; right after a good run it
  should be seconds old).
- Fewer than 3 rows have both a non-empty title and a valid http or https url.

## Step 3 — Filter for relevance

Read output/scraped-all-items.csv. It has these columns: source, publishedDate, title, url, excerpt.
Keep only articles clearly about one or more of these interests:

  EDIT ME, list your topics, for example:
  - AI agents, LLM agents, autonomous agents, multi-agent systems, agentic workflows
  - Headless browsers (headless Chrome, headless Chromium, headless Firefox)
  - Browser automation (Playwright, Puppeteer, Selenium, WebDriver, CDP)
  - Web scraping, web crawling, data extraction
  - Browserless

Discard everything else. Judge relevance from the title and excerpt only. Prefer articles from
the last 48 hours. If more than 10 remain, keep the 10 most recent. Group them by topic.

## Step 4 — Accuracy rules

- Use only rows from the CSV. Every headline, link, source, and date must come from the file.
- Do not invent facts, quotes, numbers, or articles. If a row has no excerpt, describe it from
  its title only.
- Drop any row whose url is not http or https, or whose title looks like a cookie or consent
  banner rather than a headline.

## Step 5 — Send the Slack DM

Send a DM to your Slack user ID from Step 0 using the Slack send message tool (channel is that user
ID). Format the message in Slack mrkdwn (not Markdown), like this, including only the sections that
have articles:

*:rolled_up_newspaper: Daily Briefing — [Weekday, <today's date>]*
_[N] relevant articles across [M] sources_

*AI Agents*
• <url|Title> — Source

*Browser Automation / Scraping*
• <url|Title> — Source

*Headless Browsers*
• <url|Title> — Source

Rules:
- Put the current date in the header, computed when the task runs, for example
  "Tuesday, Aug 18". Do not print the literal placeholder and do not hardcode a date.
- Only include sections that have articles.
- If zero relevant articles were found, send a short DM saying so.
- Use Slack's <url|display text> link format.
- Keep it clean and scannable, no extra commentary.
- Do not send anything anywhere except that one Slack DM.
```
