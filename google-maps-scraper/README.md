# Browserless · Google Maps Scraper

Scrape Google local business results (the `udm=1` local pack) with
[BrowserQL](https://docs.browserless.io/bql/start), and an n8n workflow that
runs it at scale across a list of cities and writes the results to a Google
Sheet.

## Files

- **`GoToSite.graphql`** — navigates to a Google local search
  (`.../search?q=...&udm=1`), waits for the network to go idle, and returns a
  `browserQLEndpoint` so the session can be reconnected for the next mutation.
- **`ScrapeTwentyPlacesThenClickNext.graphql`** — clicks through up to 20
  business cards on the current page, scraping title, address, rating, review
  count, phone, and website from each detail panel, then clicks **Next** to
  advance to the following page. Returns the scraped businesses as a JSON
  string plus a fresh `browserQLEndpoint`.
- **`Google-maps-scraper-n8n-template.json`** — importable n8n workflow that
  ties the two mutations together: it reads a list of cities from a Google
  Sheet, builds a search query per city, paginates through the results, and
  appends every scraped business back to the sheet.

## Running the mutations directly

Send each mutation to the BrowserQL endpoint with your token. `GoToSite` opens
the page and hands back a `browserQLEndpoint`; reuse that endpoint for
`ScrapeTwentyPlacesThenClickNext` so both run against the same browser session.

```bash
curl -X POST 'https://production-sfo.browserless.io/chromium/bql?token=YOUR_API_TOKEN_HERE&blockConsentModals=true' \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{ "query": "<contents of GoToSite.graphql>", "operationName": "GoToSite" }
JSON
```

Then POST `ScrapeTwentyPlacesThenClickNext` to the `browserQLEndpoint` returned
above. Repeat it once per page to paginate.

## Running the n8n workflow

1. Import `Google-maps-scraper-n8n-template.json` into n8n.
2. Replace every `YOUR_API_TOKEN_HERE` with your Browserless token (in the
   **Open Google** and **Scrape Current Page** HTTP nodes). Sign up for a
   [free account](https://www.browserless.io/signup/email?plan=free) if you
   don't have a token.
3. Connect the two Google Sheets nodes to a sheet laid out like
   [this template](https://docs.google.com/spreadsheets/d/1_3SDWehtZum1Lby8vKNILCf01zullfxYZkiUBONFldE/)
   — a `MyCities` tab for input cities and a `Results` tab for output.
4. Adjust the search query and `maxPages` in the **Prepare Search** node
   (defaults to `dentist near {city}`, 6 pages).
5. Run the workflow from the **Start** trigger.

## Notes

- The scraping selectors (`.C9waJd`, `.Bye9Fc`, `#local-place-viewer`, etc.)
  target Google's current local-results markup. Google changes these class
  names periodically, so expect to update the selectors over time.
- Use the `blockConsentModals=true` query flag to skip Google's cookie consent
  interstitial.
