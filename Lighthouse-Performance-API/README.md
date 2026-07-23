# Browserless · Lighthouse Performance API

Run Google Lighthouse audits at scale with the Browserless
[Performance API](https://docs.browserless.io/rest-apis/performance), and an n8n
workflow that audits a list of websites and writes the scores plus actionable
signals back to a Google Sheet.

## Files

- **`Lighthouse-Performance-API-n8n-template.json`** — importable n8n workflow
  that reads a list of websites from a Google Sheet, runs a Lighthouse audit on
  each one via Browserless's `/performance` endpoint (performance, SEO,
  accessibility, and best-practices categories), extracts the key metrics and
  quick-win opportunities, and appends the results to a `Performance` tab.

## How it works

1. **Manual Trigger → Read Spreadsheet** — reads the input websites from the
   `Results` tab of the connected Google Sheet.
2. **Loop Over Items** — batches the rows (2 at a time) so audits run without
   overwhelming the endpoint.
3. **Browserless Performance API** — POSTs each `Website` URL to
   `https://production-sfo.browserless.io/performance` with a
   `lighthouse:default` config scoped to the `performance`, `seo`,
   `accessibility`, and `best-practices` categories. Errors are routed to a
   separate output so a single failing site doesn't stop the run.
4. **Extract Signals** — a Code node that turns the raw Lighthouse report into
   flat columns: category scores (0–100), Core Web Vitals (`lcp_s`, `tbt_ms`,
   `cls`, `ttfb_ms`), total `potential_speedup_s`, the top savings
   opportunities, and a plain-English `signal` summary. Runtime errors are
   captured with an `audit_status` instead of crashing the node.
5. **Write Results to New Sheet** — appends/updates the enriched rows into the
   `Performance` tab.

## Running the workflow

1. Import `Lighthouse-Performance-API-n8n-template.json` into n8n.
2. Replace `YOUR_API_TOKEN_HERE` with your Browserless token (in the
   **Browserless Performance API** HTTP node). Sign up for a
   [free account](https://www.browserless.io/signup/email?plan=free) if you
   don't have a token.
3. Connect the two Google Sheets nodes to a sheet laid out like
   [this template](https://docs.google.com/spreadsheets/d/1_3SDWehtZum1Lby8vKNILCf01zullfxYZkiUBONFldE/)
   — a tab with a `Website` column for input and a `Performance` tab for output.
4. Run the workflow from the **Manual Trigger**.

## Running the Performance API directly

You can call the endpoint without n8n by POSTing a URL and a Lighthouse config:

```bash
curl -X POST 'https://production-sfo.browserless.io/performance?token=YOUR_API_TOKEN_HERE&timeout=120000' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com",
    "config": {
      "extends": "lighthouse:default",
      "settings": {
        "onlyCategories": ["performance", "seo", "accessibility", "best-practices"]
      }
    }
  }'
```

The response is the full Lighthouse report (`categories`, `audits`, etc.),
which the **Extract Signals** node flattens into report-ready columns.

## Notes

- Lighthouse audits are heavier than a plain page load, so the HTTP node uses a
  130s timeout and the endpoint is called with `timeout=120000`. Adjust both if
  you audit slow sites.
- `onErrorContinue` on the HTTP node keeps the batch running when a single site
  fails to load; those rows come back with an `audit_status` describing the
  runtime error.
