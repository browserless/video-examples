/**
 * amazon-scale-test.js — Plain HTTP bot-detection stress test
 *
 * Sends raw HTTPS requests to Amazon (no browser, no proxy, no stealth)
 * and hits each product URL several times in sequence.  The output shows
 * the response size per hit so you can watch Amazon's bot detection kick
 * in as the request count climbs — responses shrink from ~2000 KB (real
 * page) down to ~2 KB (bot-check wall) and eventually block entirely.
 *
 * This script needs NO dependencies and NO Browserless token.
 * Run it as-is to see what plain HTTP scraping looks like at scale.
 *
 * Usage:
 *   node amazon-scale-test.js
 *   SEARCH_QUERY="standing desk" node amazon-scale-test.js
 */

const https = require('https');
const zlib  = require('zlib');

const QUERY            = (process.env.SEARCH_QUERY || 'mechanical keyboard').trim();
const SEARCH_URL       = `https://www.amazon.com/s?k=${encodeURIComponent(QUERY)}`;
const HITS_PER_PRODUCT = 5;

// Minimal headers that mimic a real desktop browser.
// Missing: cookies, TLS fingerprint, HTTP/2 frame ordering — Amazon checks all of these.
const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
};

// Fetch a URL and return the response size + a blocked flag.
// A real page is several hundred KB; a bot-check page is ~2 KB.
function fetchPage(url) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: HEADERS }, res => {
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip()) : res;
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const html    = Buffer.concat(chunks).toString('utf8');
        const blocked =
          res.statusCode === 429 || res.statusCode === 503 ||
          html.length < 5000 ||
          /captcha|robot check|validateCaptcha|bm-verify/i.test(html);
        resolve({ status: res.statusCode, html, size: html.length, blocked });
      });
      stream.on('error', () => resolve({ status: 0, html: '', size: 0, blocked: true }));
    });
    req.on('error', () => resolve({ status: 0, html: '', size: 0, blocked: true }));
  });
}

// Pull ASINs from the search-results HTML to build the product URL list.
function extractProductUrls(html) {
  const seen = new Set();
  return [...html.matchAll(/data-asin="([A-Z0-9]{10})"/g)]
    .map(m => m[1])
    .filter(asin => asin && !seen.has(asin) && seen.add(asin))
    .map(asin => ({ asin, url: `https://www.amazon.com/dp/${asin}` }));
}

(async () => {
  console.log(`Query: "${QUERY}"`);
  console.log(`Strategy: plain HTTP × ${HITS_PER_PRODUCT} hits per product — no browser, no stealth\n`);

  // Step 1 — fetch the search page to get product URLs
  console.log('Step 1: fetching search results...');
  const search = await fetchPage(SEARCH_URL);
  console.log(`  HTTP ${search.status}  ${(search.size / 1024).toFixed(0)} KB  blocked=${search.blocked}`);

  if (search.blocked) {
    console.log('\n  Blocked on the very first request — Amazon flagged us immediately.');
    const snippet = search.html.replace(/\s+/g, ' ').slice(0, 300);
    console.log(`  Response preview: ${snippet}`);
    process.exit(0);
  }

  const products = extractProductUrls(search.html);
  console.log(`  Found ${products.length} product URLs\n`);

  // Step 2 — hit each product URL HITS_PER_PRODUCT times in sequence.
  // Each column in the output is one hit; watch for BLOCK to appear as
  // Amazon's rate-limiter starts flagging the IP.
  console.log(`Step 2: fetching each product ${HITS_PER_PRODUCT}x...`);
  console.log('─'.repeat(60));

  let totalBlocked = 0;
  let firstBlock   = null;

  for (let i = 0; i < products.length; i++) {
    const { asin, url } = products[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}] ${asin}: `);

    for (let hit = 1; hit <= HITS_PER_PRODUCT; hit++) {
      const r  = await fetchPage(url);
      const kb = (r.size / 1024).toFixed(0) + 'K';

      if (r.blocked) {
        totalBlocked++;
        if (!firstBlock) firstBlock = { product: i + 1, hit, asin };
        process.stdout.write(' BLOCK');
      } else {
        process.stdout.write(kb.padStart(6));
      }
    }
    console.log();
  }

  // ─── summary ──────────────────────────────────────────────────────────────
  const total = products.length * HITS_PER_PRODUCT;
  console.log('─'.repeat(60));
  console.log(`\nTotal requests : ${total}`);
  console.log(`Blocked        : ${totalBlocked} / ${total} (${((totalBlocked / total) * 100).toFixed(0)}%)`);

  if (firstBlock) {
    console.log(`\nFirst block    : product #${firstBlock.product} (${firstBlock.asin}), hit #${firstBlock.hit}`);
    console.log(`  → Amazon started blocking after ${(firstBlock.product - 1) * HITS_PER_PRODUCT + firstBlock.hit - 1} successful request(s)`);
  } else {
    console.log('\nNo blocks detected — try running again to stress the IP further.');
  }
})();
