# Observability Pricing — Parallel Agent Runs

A video-friendly demo of Browserless `/agent/run`: send the same research task to 5 independent browser agents at once, poll their progress, and normalize the results into one pricing comparison.

## What it researches

Each agent gets one observability vendor and independently researches this workload using first-party sources only:

- 20 engineers with full access
- 50 monitored hosts
- 100 GB of **logs** ingested per month
- 30-day log retention
- US customer, USD, monthly billing

It also checks the 200 GB cost/overage and whether SSO/SAML is included.

Default vendors:

1. Datadog
2. New Relic
3. Grafana Cloud
4. Dynatrace
5. Splunk Observability Cloud

## Run it

Requires Node.js 18+ and a Browserless API token. Your token is on your
[account dashboard](https://account.browserless.io) — copy it from the API
token section. The script reads it only from the `BROWSERLESS_TOKEN`
environment variable; there is no `.env` file support, so pass it inline (or
`export` it in your shell) and keep it out of any committed file.

```bash
cd observability-pricing-agents
BROWSERLESS_TOKEN=YOUR_TOKEN npm start
```

There are no npm dependencies to install.

The script immediately submits all 5 runs, then shows a live terminal dashboard as each agent moves through `pending`, `running`, and `succeeded`/`failed` states. When all runs finish it prints a normalized comparison table and the complete JSON output with source URLs, and saves that JSON to a timestamped file under `results/` (gitignored).

## Customize the vendors

Pass a comma-separated list:

```bash
VENDORS="Datadog,New Relic,Grafana Cloud" BROWSERLESS_TOKEN=YOUR_TOKEN npm start
```

## Optional environment variables

```bash
# Browserless region/base URL
BROWSERLESS_BASE_URL=https://production-sfo.browserless.io

# Polling frequency in milliseconds
POLL_MS=2500

# Per-agent timeout; /agent/run currently caps this at 15 minutes
AGENT_TIMEOUT_MS=900000
```

## Video flow

A simple recording sequence:

1. Show the vendor array in `index.mjs`.
2. Show `Promise.all(VENDORS.map(researchVendor))` — this is the fan-out moment.
3. Run the script.
4. Let the 5 rows visibly progress independently.
5. Cut to the final normalized table.
6. Open one returned `pricing_sources` URL to show that the answer came from the vendor's own site.

The point of the demo is not just that an agent can research pricing. It is that an application can programmatically launch many independent browser-research jobs at once and consume their structured results.

## Accuracy note

Observability pricing is difficult to normalize. Vendors use different billing units and may not publish enough information to convert a 100 GB logging workload exactly. The prompt explicitly requires the agent to return `null` rather than guess when a defensible first-party conversion is unavailable.
