const BROWSERLESS_TOKEN = "YOUR_API_TOKEN_HERE";

const response = await fetch(
  `https://production-sfo.browserless.io/scrape?token=${BROWSERLESS_TOKEN}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.scrapingcourse.com/ecommerce/",
      elements: [
        { selector: ".product-name" },
        { selector: ".price" },
        { selector: ".product-image" },
      ],
    }),
  }
);

const data = await response.json();

// Each element returns an array of results matching the selector
const [names, prices, images] = data.data;

console.log(`Found ${names.results.length} products:\n`);

for (let i = 0; i < Math.min(5, names.results.length); i++) {
  console.log(`${i + 1}. ${names.results[i].text}`);
  console.log(`   Price: ${prices.results[i].text}`);
  console.log(`   Image: ${images.results[i].text}`);
  console.log();
}

console.log(`... and ${names.results.length - 5} more products`);
