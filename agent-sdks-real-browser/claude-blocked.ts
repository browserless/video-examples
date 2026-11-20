// The "before" run: the same Claude agent with only its built-in WebFetch and WebSearch, no Browserless.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { PROMPT } from "./prompt.ts";

// Only the built-in web tools, nothing else.
const WEB_TOOLS = ["WebFetch", "WebSearch"];

for await (const message of query({
  prompt: PROMPT,
  options: {
    tools: WEB_TOOLS,
    allowedTools: WEB_TOOLS,
    // Ignore your local settings and MCP config (including claude.ai connectors such as Browserless),
    // so this run can't quietly fall back to a real browser.
    settingSources: [],
    strictMcpConfig: true,
    maxTurns: 10,
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") console.error(`→ ${block.name} ${JSON.stringify(block.input).slice(0, 120)}`);
    }
  }
  // Print what each tool got back, so the 403 is visible on screen.
  if (message.type === "user" && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === "tool_result") {
        const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        console.error(`← ${text.replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  }
  if (message.type === "result") {
    if (message.subtype === "success") console.log(message.result);
    else console.error(`Run ended with ${message.subtype}`);
  }
}
