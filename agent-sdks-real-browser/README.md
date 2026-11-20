# Give the OpenAI and Claude Agent SDKs a Real Browser

Two small agents, one on the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) and one on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview), get the same task: pull the 10 most recent reviews from a G2 page as JSON.

Built-in web tools can't be relied on for pages like this. Claude's `WebFetch`, for example, gets an HTTP 403 from the site's bot check. Each agent here gets one tool config that points at the hosted [Browserless MCP server](https://docs.browserless.io/mcp/browserless-mcp-server/setup), which gives it a real browser. Neither file contains any browser code.

| File | What it does |
|------|--------------|
| `prompt.ts` | The shared prompt and target URL |
| `openai-agent.ts` | OpenAI Agents SDK agent with `hostedMcpTool` |
| `claude-agent.ts` | Claude Agent SDK `query()` with `mcpServers` |
| `claude-blocked.ts` | The same Claude agent with only its built-in `WebFetch` and `WebSearch` |
| `plain-fetch.ts` | A plain HTTP request to the page, no browser |

## Setup

Requires Node.js 22.9+ and:

- A Browserless API token from your [account dashboard](https://browserless.io/account/)
- An [OpenAI API key](https://platform.openai.com/api-keys) for `openai-agent.ts`
- An [Anthropic API key](https://platform.claude.com/settings/keys) for `claude-agent.ts`

```bash
cd agent-sdks-real-browser
npm install
cp .env.example .env
```

Fill in the keys in `.env`. Keep it out of git; it's already in `.gitignore`.

## Run it

```bash
npm run openai
npm run claude
```

Both print the reviews as JSON. The Claude agent also prints each tool it calls (for example `→ mcp__browserless__browserless_smartscraper`) to stderr, so you can see it using Browserless.

To point both agents at a different page, pass the URL:

```bash
npm run claude -- "https://www.g2.com/products/<product>/reviews"
```

## See them fail without Browserless

These hit the same page without Browserless, so you can compare the before and after:

```bash
npm run fetch
npm run claude:blocked
```

- `fetch` sends a plain HTTP request. On G2 it gets a 403 and Cloudflare's bot check, and saves the response to `plain-fetch.html` so you can open the challenge page.
- `claude:blocked` gives Claude only `WebFetch` and `WebSearch`. It prints each tool call and what came back, so you see the 403. It ignores your local Claude settings and MCP servers, so it can't fall back to a browser tool you've connected elsewhere.
## What to look for in the code

**OpenAI Agents SDK:** `hostedMcpTool` with the Browserless MCP URL and a bearer header. Set `requireApproval: "never"`, or the run waits for an approval that never comes.

**Claude Agent SDK:** `mcpServers.browserless` with `type: "http"`, the same URL and the same header. Two options matter:

- `allowedTools: ["mcp__browserless"]` lets Claude call every Browserless tool without a permission prompt. In this SDK, MCP tools are named `mcp__browserless__<tool>`.
- `disallowedTools: ["WebFetch", "WebSearch"]` stops Claude trying its built-in fetch first.

The URL and token are identical in both files. Only the wrapper differs, so if you switch models or run both, the browser layer doesn't change.

## Docs

- [OpenAI SDK + Browserless](https://docs.browserless.io/ai-integrations/openai)
- [Claude Agent SDK + Browserless](https://docs.browserless.io/ai-integrations/claude-agent-sdk)
- [Browserless MCP tools](https://docs.browserless.io/mcp/rest-api-tools)
