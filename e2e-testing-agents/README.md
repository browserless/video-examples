# E2E Testing with Browser Agents

Use Claude with the Browserless MCP server to run end-to-end tests from plain-English prompts—no test script required.

## Requirements

- [Claude](https://claude.ai)
- A [Browserless account](https://www.browserless.io)
- The Browserless MCP server connected to Claude

## Setup

In Claude, open **Customize → Connectors → Add → Add custom connector**. Name the connector `Browserless` and use:

```text
https://mcp.browserless.io/mcp
```

Connect your Browserless account when prompted.

## Add-to-cart test

```text
Use the Browserless Agent to run an end-to-end test on this demo shop:

https://scraping-sandbox.netlify.app/products

I want you to test a way a shopper can add a product to the cart.

Test - Add to cart from the products page
1. Open https://scraping-sandbox.netlify.app/products.
2. Confirm the product catalog loads and multiple products are visible.
3. Choose one product from the catalog.
4. Without opening its individual product page, click the Add to Cart button directly inside that product's card on the /products page.
5. Open the cart.
6. Verify that the exact product you selected appears in the cart.
7. Report this test as PASS if the correct product is in the cart, or FAIL if it is not.

For each test, briefly describe the actions you took and what you observed.

Do not continue into checkout. The test is complete once you have confirmed that each product was successfully added to the cart using its respective flow.
```

## Intentionally failing test

This prompt uses the wrong expected result to demonstrate that the agent checks the live browser state rather than automatically reporting success.

```text
Use the Browserless Agent to run this end-to-end test on:

https://scraping-sandbox.netlify.app/products

1. Open the products page.
2. Choose any product from the catalog.
3. Click the Add to Cart button directly inside that product's card on the /products page.
4. Open the cart.
5. Verify that the product you selected does NOT appear in the cart.

The expected result for this test is that the selected product should not be present in the cart.

Report the test as PASS only if the product is missing from the cart. If the product appears in the cart, report the test as FAIL and explain what you observed.

Do not continue beyond the cart.
```
