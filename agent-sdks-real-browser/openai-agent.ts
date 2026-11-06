import { Agent, run, hostedMcpTool } from "@openai/agents";
import { PROMPT, requireEnv } from "./prompt.ts";

requireEnv("OPENAI_API_KEY");
const BROWSERLESS_API_KEY = requireEnv("BROWSERLESS_API_KEY");

const agent = new Agent({
  name: "Review Researcher",
  model: "gpt-5.5",
  tools: [
    hostedMcpTool({
      serverLabel: "browserless",
      serverUrl: "https://mcp.browserless.io/mcp",
      headers: { Authorization: `Bearer ${BROWSERLESS_API_KEY}` },
      // The default ("always") waits for an approval that never comes, so the run hangs.
      requireApproval: "never",
    }),
  ],
});

const result = await run(agent, PROMPT);
console.log(result.finalOutput);
