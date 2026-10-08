# E2E Testing with Browser Agents

Use Claude with the Browserless MCP server to run end-to-end tests from plain-English prompts, with no test script required.

## Requirements

- [Claude](https://claude.ai)
- A [Browserless account](https://www.browserless.io) and API token
- The Browserless MCP server connected to Claude

## Setup

In Claude.ai, open **Customize → Connectors → Add custom connector** and name it `Browserless`. The connector form only accepts a URL, so pass your API token from the Browserless dashboard as a query parameter:

```text
https://mcp.browserless.io/mcp?token=YOUR_API_TOKEN_HERE
```

Clients that support OAuth, such as Claude Desktop, can use `https://mcp.browserless.io/mcp` without a token and sign in with your Browserless account instead.

After connecting, confirm the `browserless_agent` tool is enabled.

## Keep one browser session for the whole test

`browserless_agent` sessions are one-shot by default. Each prompt below asks Claude to keep the same browser session alive for every step, so the cart survives from adding a product to opening the cart, and to close it on the last call. Kept sessions also close after 15 idle minutes.

## Add-to-cart test

```text
Use the browserless_agent tool to run an end-to-end test on this demo shop.
Keep the same browser session alive for every step.

https://scraping-sandbox.netlify.app/products

Test: Add to cart from the products page

1. Open the products page.
2. Confirm the product catalog loads and multiple products are visible.
3. Choose one in-stock product and record its exact name.
4. Without opening its product page, click Add to Cart inside that product's card.
5. Open the cart.
6. Verify that the exact product selected in step 3 appears in the cart.

Report PASS only if the correct product is present. Otherwise report FAIL.
Briefly list the actions taken and the evidence observed.
On the last browserless_agent call, send keepSessionAlive: false to close the session.
Do not continue into checkout.
```

## Intentionally failing test

This prompt uses the wrong expected result to show that the agent checks the live browser state rather than automatically reporting success. The correct outcome is `FAIL`.

```text
Use the browserless_agent tool to run this end-to-end test.
Keep the same browser session alive for every step.

https://scraping-sandbox.netlify.app/products

1. Open the products page.
2. Confirm the product catalog loads and multiple products are visible.
3. Choose one in-stock product and record its exact name.
4. Without opening its product page, click Add to Cart inside that product's card.
5. Open the cart.
6. Verify that the selected product does NOT appear in the cart.

The expected result is that the selected product should be missing.
Report PASS only if it is missing. If it appears, report FAIL and explain the evidence.
On the last browserless_agent call, send keepSessionAlive: false to close the session.
Do not continue beyond the cart.
```
