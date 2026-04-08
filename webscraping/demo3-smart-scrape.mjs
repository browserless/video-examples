// Fetching Hacker News with Browserless /smart-scrape

const TOKEN = "YOUR_API_TOKEN_HERE";

const response = await fetch(
  `https://production-sfo.browserless.io/smart-scrape?token=${TOKEN}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://news.ycombinator.com/",
      formats: ["markdown", "links", "html"],
    }),
  }
);

const data = await response.json();

console.log("=== Smart Scrape Results ===\n");
console.log(`Strategy used: ${data.strategy}`);
console.log(`Strategies attempted: ${data.attempted?.join(" → ")}`);

console.log(`\n--- Markdown (first700 chars) ---`);
console.log(data.markdown?.substring(0, 700));
console.log("...\n");

console.log(`--- Links (${data.links?.length} found) ---`);
data.links?.slice(0, 25).forEach((link, i) => {
  console.log(`  ${i + 1}. ${link}`);
});
if (data.links?.length > 25) {
  console.log(`  ... and ${data.links.length - 25} more\n`);
}

console.log(`--- HTML ---`);
console.log(`${data.content?.length} chars of rendered HTML`);
