import { query } from "@anthropic-ai/claude-agent-sdk";
import { PROMPT, requireEnv } from "./prompt.ts";

const BROWSERLESS_API_KEY = requireEnv("BROWSERLESS_API_KEY");

for await (const message of query({
  prompt: PROMPT,
  options: {
    mcpServers: {
      browserless: {
        type: "http",
        url: "https://mcp.browserless.io/mcp",
        headers: { Authorization: `Bearer ${BROWSERLESS_API_KEY}` },
      },
    },
    // Lets Claude call every Browserless tool (mcp__browserless__<tool>) without a permission prompt.
    allowedTools: ["mcp__browserless"],
    // Without this, Claude tries its built-in fetch first, which gets the bot-check page or a denial.
    disallowedTools: ["WebFetch", "WebSearch"],
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") console.error(`→ ${block.name}`);
    }
  }
  if (message.type === "result") {
    if (message.subtype === "success") console.log(message.result);
    else console.error(`Run ended with ${message.subtype}`);
  }
}
