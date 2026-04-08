import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const TOKEN = "YOUR_API_TOKEN_HERE";
// Step 1: Call /unblock
console.log("Step 1 → Calling /unblock on StockX...");
const { browserWSEndpoint, screenshot, content } = await fetch(
  `https://production-sfo.browserless.io/unblock?token=${TOKEN}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://stockx.com/nike-dunk-low-retro-white-black-2021",
      browserWSEndpoint: true,
      screenshot: true,
      content: true,
    }),
  }
).then((r) => r.json());
console.log(`  ✓ HTML: ${content?.length} chars | Screenshot: ${screenshot ? "yes" : "no"}`);
// Step 2: Save screenshot
if (screenshot) {
  const buf = Buffer.from(screenshot, "base64");
  writeFileSync("./screenshots/stockx-screenshot.png", buf);
  console.log(`  ✓ Saved stockx-screenshot.png (${buf.length} bytes)`);
}
// Step 3: Connect Puppeteer to the live browser
console.log("\nStep 2 → Connecting Puppeteer to live session...");
const browser = await puppeteer.connect({ browserWSEndpoint });
const page = (await browser.pages())[0];
console.log(`  ✓ Connected — ${page.url()}`);
// Step 4: Scrape product data
console.log("\nStep 3 → Scraping product data...\n");
const product = await page.evaluate(() => {
  const get = (sel) => document.querySelector(sel)?.content || "N/A";
  let price = "N/A";
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.textContent); if (j.offers?.lowPrice) price = `$${j.offers.lowPrice}`; } catch {}
  }
  return {
    name: document.querySelector("h1")?.textContent?.trim() || get('meta[property="og:title"]'),
    price,
    image: get('meta[property="og:image"]'),
  };
});

console.log(`  Product: ${product.name}`);
console.log(`  Price:   ${product.price}`);
console.log(`  Image:   ${product.image}`);

// Done
browser.disconnect();
console.log("\n✓ Done — Cloudflare bypassed, data scraped via live Puppeteer.");
