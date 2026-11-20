// A plain HTTP request to the target page, no browser. Shows what the site's bot check returns.
import { writeFile } from "node:fs/promises";
import { TARGET_URL } from "./prompt.ts";

const response = await fetch(TARGET_URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  },
});
const html = await response.text();

const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "(no title)";
const challenged = /challenge-platform|cf-chl|just a moment/i.test(html);

console.log(`HTTP ${response.status} from ${TARGET_URL}`);
console.log(`Title: ${title}`);
console.log(challenged ? "Got the Cloudflare bot check, not the reviews." : "No bot check detected.");

// Save the HTML so you can open the challenge page on screen.
await writeFile("plain-fetch.html", html);
console.log("Saved the response to plain-fetch.html");
