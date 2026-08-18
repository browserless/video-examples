# Claude Scheduled Task prompt: daily news briefing to Slack

This is the LLM half of the example. The scraper (set up with `setup-launchd.sh`) refreshes the
CSV once a day. This Claude Scheduled Task reads that CSV, keeps only what matches your
interests, and sends you a Slack DM with the most relevant links. It does not run the scraper
and it does not scrape anything itself.

Before using it, edit the three things marked EDIT ME in the block below:
1. The absolute path to your CSV.
2. Your Slack user ID.
3. Your interests.

Then paste the block into a Claude Scheduled Task and schedule it a little after the scraper's
daily run (the scraper defaults to 09:00, so 09:30 is a safe default here).

---

```
You are running a daily news briefing. Complete these steps in order.

## Step 1 — Read the CSV

Read the CSV that the local scraper produced:

  EDIT ME: /absolute/path/to/video-examples/news-scraper/output/scraped-all-items.csv

It has these columns: source, publishedDate, title, url, excerpt.

## Step 2 — Stop early if the data is not usable

Do not brief on bad data. Send a short Slack DM saying so, then stop, if any of these are true:
- The file is missing or empty.
- The file's last modified time is more than 26 hours old (the scraper did not refresh, so the
  data is stale).
- Fewer than 3 rows have both a non-empty title and a valid http or https url.

## Step 3 — Filter for relevance

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
