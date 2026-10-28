# Apartment Hunter — Parallel Agent Runs

A video-friendly demo of Browserless `/agent/run`: send the same apartment search to several rental sites at once, one browser agent per site, and merge what they find into one shortlist.

## What it searches for

Every agent gets the same search, set in `CRITERIA` in `prompt.mjs`:

- 1 bedroom in Austin, TX
- At most $1,800 per month
- Dogs allowed
- Washer and dryer in the unit
- Available to move in by 2026-12-01

Sites, each starting on its own Austin rental search (`ALL_SITES` in `index.mjs`):

1. Zumper
2. Zillow
3. Craigslist

To search a different city, change `CRITERIA` and each site's `startUrl` together.

Apartments.com and HotPads are left out: in testing, both blocked the agent with a bot check (Akamai and PerimeterX) even with stealth and a residential proxy. If you add a site and its agent hits a bot check, its row shows `blocked` and the reason is saved in that run's `notes`.

## How it works

- Each site gets one `POST /agent/run` with a `startUrl`, so the agent goes straight to that site's search.
- Rental sites use bot protection, so every run sets `stealth: true` with a US residential proxy (`proxy: "residential"`, `proxyCountry: "US"`).
- Every run passes the same `responseSchema`, so each agent returns listings in the same shape: name, address, rent, beds, baths, pets, in-unit laundry, available date and listing URL.
- The prompt tells the agent to use the site's own filters and to return `null` for anything a listing doesn't say instead of guessing.
- `Promise.all` starts every site together. The script polls each run, then merges the results, drops anything that doesn't match (including `null` fields), removes the same address listed on several sites (keeping the cheapest), and sorts by rent.

## Run it

Requires Node.js 18+ and a Browserless API token. Your token is on your
[account dashboard](https://account.browserless.io). The script reads it only
from the `BROWSERLESS_TOKEN` environment variable, so pass it inline (or
`export` it in your shell) and keep it out of any committed file.

```bash
cd apartment-hunter-agents
BROWSERLESS_TOKEN=YOUR_TOKEN npm start
```

There are no npm dependencies to install.

The terminal shows each site's status, listings found and latest step, plus the elapsed time. When every run finishes, it prints the shortlist with links and saves the full results to a timestamped JSON file under `results/` (gitignored).

## Compare parallel vs one at a time

To time the same search with the sites run one after another:

```bash
SEQUENTIAL=true BROWSERLESS_TOKEN=YOUR_TOKEN npm start
```

## Session replay (paid plans)

Every run is sent with `replay: true`, so Browserless records it as a
[Session Replay](https://docs.browserless.io/rest-apis/agent-run#recording-the-run).
Each recording appears on the
[Session Replay page](https://browserless.io/account/session-replay) of your
dashboard once that run's browser session closes.

**Session Replay requires a paid Browserless plan** (Prototyping, Starter,
Scale, or Enterprise). On the free plan, turn it off:

```bash
REPLAY=false BROWSERLESS_TOKEN=YOUR_TOKEN npm start
```

The account also needs one available concurrent browser per site. If a run
can't get its own session, it still finishes but isn't recorded. The terminal
lists those sites under "Not recorded", and the saved JSON includes
`replayError: "session_unavailable"`.

## Optional environment variables

```bash
# Only search some sites (comma-separated names from ALL_SITES)
SITES="Zillow,Craigslist"

# Browserless region/base URL
BROWSERLESS_BASE_URL=https://production-sfo.browserless.io

# Polling frequency in milliseconds
POLL_MS=2500

# Per-agent timeout; /agent/run currently caps this at 15 minutes
AGENT_TIMEOUT_MS=900000

# Soft cap on browser actions per agent; /agent/run clamps this to 1-60
MAX_STEPS=45

# Session Replay recording; set to false on the free plan
REPLAY=true

# Run the sites one after another instead of in parallel
SEQUENTIAL=false
```

## Video flow

1. Show `CRITERIA` and `ALL_SITES`.
2. Show the request body in `createRun`: `startUrl`, `responseSchema`, `stealth`, the residential proxy and `replay`.
3. Show `Promise.all(SITES.map(searchSite))`, which is where all the sites start at once.
4. Run the script and let the rows progress independently.
5. Cut to the shortlist and open one listing link.
6. Open the Session Replay page and play back a couple of runs.
7. Optional: run with `SEQUENTIAL=true` to show the time difference.

## Accuracy note

Listings change constantly, and sites don't always show pets, laundry, or availability on the results page. The prompt requires the agent to return `null` rather than guess, and the script leaves any listing with a `null` requirement off the shortlist. Always confirm details on the listing itself before applying.
