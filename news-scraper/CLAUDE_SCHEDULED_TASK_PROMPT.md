# Claude Scheduled Task prompt: daily news briefing to Slack

This is the LLM half of the example. On each run it **triggers a fresh scrape itself** (by kicking
the launchd agent that `setup-launchd.sh` installed), waits for the new CSV, keeps only what
matches your interests, and sends you a Slack DM with the most relevant links. Because it triggers
the scrape, you do not have to time this task around the scraper's daily run — it always briefs on
data it just refreshed. The daily launchd run still keeps a recent CSV around as a backstop.

Before using it:
1. Run the Quick start in this repo's `README.md` first: clone, put your `BROWSERLESS_TOKEN` in
   `.env`, and run `./setup-launchd.sh` so the scraper's launchd agent exists. Enable the Slack
   connector so the send-message tool is available.
2. Edit the two things marked EDIT ME in the block below: your Slack user ID and your interests.

Then paste the block into a Claude Scheduled Task (or run it in Claude Code on demand). Schedule it
whenever you want your briefing — it no longer has to line up with the scraper's cron.

---

```
You are running a daily news briefing for yourself. Work from a checkout of this repo
(video-examples/news-scraper) and run every command from that folder. Complete these steps in order.

## Step 0 — Setup you can rely on
If any command or path below is unclear, read this repo's README.md for the setup details
(Browserless token in .env, the launchd agent installed by setup-launchd.sh, and the Slack
connector). Never print, echo, or read the token yourself. Facts you need: the scraper's launchd
agent is labeled com.browserless.news-scraper, it runs export-csv.js, and it writes
output/scraped-all-items.csv.

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

Send a DM to your Slack user ID using the Slack send message tool (channel is your user ID):

  EDIT ME: U0XXXXXXX

Format the message in Slack mrkdwn (not Markdown), like this, including only the sections that
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
