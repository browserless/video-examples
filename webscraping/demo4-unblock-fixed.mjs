import { writeFileSync } from "node:fs";

const BROWSERLESS_TOKEN = "YOUR_API_TOKEN_HERE";

const response = await fetch(
  `https://production-sfo.browserless.io/unblock?token=${BROWSERLESS_TOKEN}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://stockx.com/nike-dunk-low-retro-white-black-panda",
      content: true,
      cookies: false,
      screenshot: true,
      browserWSEndpoint: false,
    }),
  }
);

const data = await response.json();

// Save the screenshot
if (data.screenshot) {
  const buffer = Buffer.from(data.screenshot, "base64");
  writeFileSync("stockx-screenshot.png", buffer);
  console.log(`Screenshot saved: stockx-screenshot.png (${buffer.length} bytes)`);
}

// Parse some data from the HTML content
if (data.content) {
  console.log(`\nPage HTML: ${data.content.length} chars`);

  // Extract the page title
  const titleMatch = data.content.match(/<title>(.*?)<\/title>/);
  console.log(`Title: ${titleMatch ? titleMatch[1] : "N/A"}`);

  // Extract product name from og:title meta tag
  const ogTitle = data.content.match(
    /<meta property="og:title" content="(.*?)"/
  );
  console.log(`Product: ${ogTitle ? ogTitle[1] : "N/A"}`);

  // Extract price from og:price meta or JSON-LD
  const priceMatch = data.content.match(/"price":\s*"?([\d.]+)"?/);
  console.log(`Price: ${priceMatch ? "$" + priceMatch[1] : "N/A"}`);
}

console.log(`\nBrowserless bypassed Cloudflare and returned the full page!`);
