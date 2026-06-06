# Browserless · Claude Browser Agent Demo

Using Claude Code with the Browserless MCP server to run an AI browser agent directly from your terminal — no code required.

## Demo prompt

```
Use the browserless_agent to complete this task:

Navigate to G2.com and find reviews and discussions for Jasper, Grammarly, and Writesonic. Extract the 10 most recent reviews per product with reviewer name, role, star rating, what they liked, what they complained about. Once you have all the data, compile everything into a structured HTML report called ai-writing-report.html with: a review table for the G2 data, a final paragraph with the top 3 complaints across all three products, and clean readable styling. Save the file and tell me where it is.
```

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- Browserless MCP server connected to Claude Code
- A Browserless API token — grab yours from the [Browserless dashboard](https://www.browserless.io/account/home) and replace `YOUR_API_TOKEN_HERE` in the setup command

## Setup

Add the Browserless MCP server to Claude Code:

```bash
claude mcp add --transport http browserless https://mcp.browserless.io/mcp \
  --header "Authorization: Bearer YOUR_API_TOKEN_HERE"
```

Then paste the prompt above directly into Claude Code and let the agent handle the rest.
