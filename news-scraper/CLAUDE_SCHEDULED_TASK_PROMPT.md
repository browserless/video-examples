You are running a daily news briefing. Complete the following steps in order.

---

## Step 1 — Find the CSV file

Read the CSV the scraper writes on this machine:

  EDIT ME: /absolute/path/to/news-scraper/output/scraped-all-items.csv

---

## Step 2 — Read and parse the CSV

It has these columns: source, publishedDate, title, url, excerpt.

---

## Step 3 — Filter for relevant articles

Keep only articles clearly about one or more of these topics:

  EDIT ME, list your topics, for example:
  - AI agents
  - Headless browsers
  - Web scraping

Judge relevance from the title and excerpt only. Prefer articles published in the last 48 hours.
If more than 10 are relevant, keep the 10 most recent. Group them by topic. Use only rows from the
CSV — never invent an article, headline, link, or date.

---

## Step 4 — Send the Slack DM

Send a DM to your Slack user ID using the Slack send message tool (channel is your user ID):

  EDIT ME: U0XXXXXXX

Format the message exactly like this (Slack mrkdwn, not Markdown), including only the sections that
have articles:

*:rolled_up_newspaper: Daily Briefing — [Weekday, <today's date>]*
_[N] relevant articles across [M] sources_

*Topic A*
• <url|Title> — Source

*Topic B*
• <url|Title> — Source

Rules:
- Put the current date in the header, computed when the task runs, for example "Tuesday, Aug 18".
  Do not hardcode a date.
- Only include sections that have articles.
- If zero relevant articles were found, send a short DM saying so.
- Use Slack's <url|display text> link format.
- Keep it clean and scannable — no extra commentary.
- Send nothing anywhere except that one Slack DM.
