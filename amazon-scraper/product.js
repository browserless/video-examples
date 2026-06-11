/**
 * product.js — Amazon Product Page Scraper
 *
 * Given a direct Amazon /dp/ URL, this script connects to a cloud Chromium
 * browser via Browserless, navigates to the product page, and extracts a
 * comprehensive data object: title, brand, ASIN, current and list prices,
 * star rating, review count, availability, Prime eligibility, feature bullets,
 * technical specs, high-res images, and breadcrumb category path.
 *
 * While the page loads it streams live screenshots to the UI every 2.5 s.
 * On completion it saves two full-page screenshots: one clean, one with CSS
 * outlines colour-coded per scraped field so you can visually verify coverage.
 *
 * Required env vars:
 *   BROWSERLESS_TOKEN  — API key from browserless.io
 *   PRODUCT_URL        — full Amazon /dp/ product URL to scrape
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

// Token is read from the environment — never hard-code API keys in source files.
const TOKEN = process.env.BROWSERLESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: BROWSERLESS_TOKEN environment variable is not set.');
  process.exit(1);
}

// The product URL is also supplied at runtime so the same script handles any product.
const PRODUCT_URL = process.env.PRODUCT_URL;
if (!PRODUCT_URL) {
  console.error('ERROR: PRODUCT_URL environment variable is not set.');
  process.exit(1);
}

// Browserless stealth WebSocket endpoint.
// /stealth          — launches Chromium with stealth patches to bypass bot-detection
// proxy=residential — routes all traffic through real residential IP addresses
// proxyCountry=us   — appear as a visitor based in the United States
// timeout=300000    — hard-kill the browser session after 5 minutes
const WS_ENDPOINT = `wss://production-sfo.browserless.io/stealth?token=${TOKEN}&proxy=residential&proxyCountry=us&timeout=300000`;

const PRODUCT_HIGHLIGHT_CSS = `
  /* Title */
  #productTitle {
    outline: 3px solid #FF6B35 !important;
    background-color: rgba(255, 107, 53, 0.12) !important;
    border-radius: 4px !important;
  }
  /* Current price */
  #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price),
  #apex_desktop .a-price:not(.a-text-price) {
    outline: 3px solid #00C853 !important;
    background-color: rgba(0, 200, 83, 0.18) !important;
    border-radius: 3px !important;
  }
  /* List / was price */
  #corePriceDisplay_desktop_feature_div .a-price.a-text-price,
  #apex_desktop .a-price.a-text-price {
    outline: 3px solid #FF9800 !important;
    background-color: rgba(255, 152, 0, 0.15) !important;
    border-radius: 3px !important;
  }
  /* Star rating */
  #acrPopover {
    outline: 3px solid #448AFF !important;
    background-color: rgba(68, 138, 255, 0.15) !important;
    border-radius: 3px !important;
  }
  /* Review count */
  #acrCustomerReviewText {
    outline: 3px solid #00BCD4 !important;
    background-color: rgba(0, 188, 212, 0.15) !important;
    border-radius: 3px !important;
  }
  /* Availability */
  #availability span:not(:empty) {
    outline: 2px solid #69F0AE !important;
    background-color: rgba(105, 240, 174, 0.10) !important;
    border-radius: 3px !important;
  }
  /* Feature bullets */
  #feature-bullets ul li span.a-list-item {
    display: block !important;
    border-left: 4px solid rgba(224, 64, 251, 0.85) !important;
    background-color: rgba(224, 64, 251, 0.10) !important;
    padding-left: 8px !important;
    margin-left: -8px !important;
    border-radius: 0 3px 3px 0 !important;
  }
  /* Main product image */
  #imgTagWrapperId img, #landingImage {
    outline: 4px solid #E040FB !important;
  }
`;

// ── Live frame stream ─────────────────────────────────────────────────────────
// NOTE: The LIVE_FRAME_PATH constant and the entire "Live frame stream" block
// below are OPTIONAL. They exist only to power the left-panel browser preview
// in the demo UI (server.js + public/index.html). If you are running this
// script standalone (no UI), you can safely delete LIVE_FRAME_PATH and the
// streamLoop section — the scraping and data extraction work without them.
const LIVE_FRAME_PATH = path.join(__dirname, 'live-frame.png');

(async () => {
  let browser;
  try {
    console.log(`URL: ${PRODUCT_URL}`);
    console.log('Connecting to Browserless (stealth + residential proxy)...');
    browser = await puppeteer.connect({ browserWSEndpoint: WS_ENDPOINT });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // ── Live frame stream (OPTIONAL — for UI demo only) ───────────────────────
    // Every 2.5 s captures a viewport screenshot, writes it to live-frame.png,
    // and emits 'LIVE_FRAME_READY' on stdout so the Express server can relay it
    // to the browser UI via SSE for the left-panel live preview.
    // If you are not using the demo UI, remove this block and the streamLoop references.
    let liveStreaming = true;
    const streamLoop = (async () => {
      while (liveStreaming) {
        try {
          const buf = await page.screenshot({ fullPage: false });
          fs.writeFileSync(LIVE_FRAME_PATH, buf);
          process.stdout.write('LIVE_FRAME_READY\n');
        } catch (_) { /* page mid-navigation — skip frame */ }
        await new Promise(r => setTimeout(r, liveStreaming ? 2500 : 0));
      }
    })();

    // ── Navigation ───────────────────────────────────────────────────────────
    // Residential proxies can be slow — swallow domcontentloaded timeout and
    // let waitForSelector do the real waiting with its larger 60 s budget.
    console.log('Navigating to product page...');
    try {
      await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      if (!e.message.includes('timeout')) throw e;
      console.log('Navigation still in progress — waiting for content...');
    }
    // #productTitle is the canonical signal that we're on a real product page.
    // If it never appears we log and continue — partial data is better than nothing.
    await page.waitForSelector('#productTitle', { timeout: 60000 })
      .catch(() => console.log('waitForSelector timed out — proceeding anyway'));
    await new Promise(r => setTimeout(r, 1500));

    const finalUrl = page.url();
    console.log('Navigation complete. URL:', finalUrl);

    // ── Extraction ───────────────────────────────────────────────────────────
    // page.evaluate runs the callback INSIDE the browser's JS context, giving
    // direct access to the DOM without serialisation overhead.
    // Returns a plain object — no DOM nodes or functions can cross the boundary.
    console.log('Extracting product data...');
    const product = await page.evaluate(() => {
      // Helper: grab innerText of the first matching element, normalise whitespace.
      function txt(sel) {
        return document.querySelector(sel)?.innerText.trim().replace(/\s+/g, ' ') || null;
      }
      // Helper: reconstruct a price string from split whole + fraction elements.
      // Amazon renders "$12" and "99" in separate spans to prevent simple scraping.
      function fmtPrice(whole, frac) {
        if (!whole) return null;
        const w = whole.innerText.replace(/[\s\n]/g, '').replace(/\.$/, '');
        return '$' + w + (frac ? '.' + frac.innerText.trim() : '');
      }

      // ASIN (Amazon Standard Identification Number) — the unique product ID,
      // always 10 uppercase alphanumeric characters embedded in the /dp/ URL path.
      const asin = location.href.match(/\/dp\/([A-Z0-9]{10})/)?.[1] || null;

      // Title & brand
      const title = txt('#productTitle');
      const brand = document.querySelector('#bylineInfo a, #brand')?.innerText.trim() || null;

      // Current price — Amazon uses several different container IDs depending on
      // product type (standard, digital, add-on, etc.), so we try them in order.
      const priceCtx  = document.querySelector(
        '#corePriceDisplay_desktop_feature_div, #apex_desktop, #price, #priceblock_ourprice'
      );
      const priceWhole = priceCtx?.querySelector('.a-price:not(.a-text-price) .a-price-whole') ||
                         document.querySelector('.a-price:not(.a-text-price) .a-price-whole');
      const priceFrac  = priceWhole?.closest('.a-price')?.querySelector('.a-price-fraction');
      const price      = fmtPrice(priceWhole, priceFrac);

      // List / "was" price — the struck-through original price shown next to a sale.
      const listWhole  = priceCtx?.querySelector('.a-price.a-text-price .a-price-whole') ||
                         document.querySelector('.a-price.a-text-price .a-price-whole');
      const listFrac   = listWhole?.closest('.a-price')?.querySelector('.a-price-fraction');
      const listPrice  = fmtPrice(listWhole, listFrac);

      // Rating: the title attribute of #acrPopover is "4.8 out of 5 stars" — we
      // strip the suffix to get just the number.
      const rating = document.querySelector('#acrPopover')
        ?.getAttribute('title')?.replace(' out of 5 stars', '').trim() || null;
      // Review count: strip everything except digits (removes commas, "ratings" text).
      const reviewCountEl = document.querySelector(
        '#acrCustomerReviewText, #reviews-medley-footer .a-size-base'
      );
      const reviewCount = reviewCountEl
        ? reviewCountEl.innerText.replace(/[^0-9,]/g, '').replace(/,/g, '') : null;

      // In-stock status text (e.g. "In Stock", "Only 3 left", "Currently unavailable").
      const availability = txt('#availability span');

      // Prime eligibility — true if either the Prime savings badge or the Prime
      // logo icon is present on the page.
      const prime = !!document.querySelector('#primeSavingsAsinEligibility_feature_div, .a-icon-prime');

      // "X bought in past month" social proof — only match leaf spans to avoid
      // matching parent containers that also contain this text.
      const boughtEl = Array.from(document.querySelectorAll('span')).find(
        el => /bought in past month/i.test(el.innerText) && el.childElementCount === 0
      );
      const boughtRecently = boughtEl ? boughtEl.innerText.trim() : null;

      // "About this item" bullet points — skip hidden list items (aok-hidden class).
      const bullets = Array.from(
        document.querySelectorAll('#feature-bullets ul li:not(.aok-hidden) span.a-list-item')
      ).map(el => el.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);

      // Technical specifications table — Amazon uses several different table IDs
      // across product categories, so we query all known variants in one pass.
      const specs = {};
      document.querySelectorAll(
        '#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, ' +
        '.prodDetTable tr, #detailBullets_feature_div li'
      ).forEach(row => {
        const keyEl = row.querySelector('th, span.a-text-bold');
        const valEl = row.querySelector('td, span:not(.a-text-bold)');
        const key   = keyEl?.innerText.trim().replace(/[:‎‏\s]+$/, '');
        const val   = valEl?.innerText.trim().replace(/\s+/g, ' ');
        if (key && val && key !== val) specs[key] = val;
      });

      // High-res image URLs — Amazon embeds a JSON data block in an inline <script>
      // tag with a "hiRes" key for each gallery image.  We parse it with a regex
      // rather than JSON.parse because the block is not valid standalone JSON.
      const imageUrls = [];
      try {
        for (const s of document.querySelectorAll('script:not([src])')) {
          const hits = [...s.textContent.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)];
          for (const h of hits) if (!imageUrls.includes(h[1])) imageUrls.push(h[1]);
          if (imageUrls.length) break; // stop after the first script block that has images
        }
      } catch (_) {}
      if (!imageUrls.length) {
        // Fallback: upscale thumbnail srcs
        document.querySelectorAll('#altImages li img').forEach(img => {
          const src = (img.src || '').replace(/\._[A-Z0-9_,]+_\./i, '._SL1500_.');
          if (src && !imageUrls.includes(src)) imageUrls.push(src);
        });
      }

      // Breadcrumb
      const breadcrumb = Array.from(
        document.querySelectorAll(
          '#wayfinding-breadcrumbs_feature_div li a, .a-breadcrumb li a'
        )
      ).map(a => a.innerText.trim()).filter(Boolean);

      return {
        asin, title, brand, price, listPrice, rating, reviewCount,
        availability, prime, boughtRecently, bullets, specs, imageUrls, breadcrumb,
      };
    }).catch(e => ({ error: e.message }));

    const titlePreview = (product.title || 'unknown title').slice(0, 70);
    console.log(`Extracted: ${titlePreview}`);

    // Write the full product object to disk as pretty-printed JSON.
    fs.writeFileSync(path.join(__dirname, 'product-data.json'), JSON.stringify({
      url: PRODUCT_URL,       // original URL supplied by the user
      finalUrl,               // actual URL after any redirects
      timestamp: new Date().toISOString(),
      product,                // the extracted data object
    }, null, 2));
    console.log('Data saved: product-data.json');

    // ── Stop live stream, take comparison screenshots ─────────────────────────
    liveStreaming = false;
    await streamLoop; // wait for any in-flight frame to finish before capturing

    console.log('Taking screenshots...');
    // Freeze ALL JS-driven animation so nothing shifts layout between the two shots.
    // Product pages often have image carousels and countdown timers.
    await page.evaluate(() => {
      const maxId = window.setTimeout(() => {}, 0);
      for (let i = 0; i <= maxId; i++) { clearTimeout(i); clearInterval(i); }
      window.requestAnimationFrame = () => 0;
      window.webkitRequestAnimationFrame = () => 0;
    });

    // Screenshot 1 — clean page, no modifications.
    await page.screenshot({ path: path.join(__dirname, 'product-result.png'), fullPage: true });
    console.log('Screenshot saved: product-result.png');

    // Screenshot 2 — inject PRODUCT_HIGHLIGHT_CSS to draw colour-coded outlines
    // around every DOM element we scraped (title, price, rating, bullets, etc.).
    await page.evaluate(css => {
      const s = document.createElement('style');
      s.id = '__hl'; s.textContent = css;
      document.head.appendChild(s);
    }, PRODUCT_HIGHLIGHT_CSS);
    await page.screenshot({ path: path.join(__dirname, 'product-highlighted.png'), fullPage: true });
    console.log('Highlighted screenshot saved: product-highlighted.png');
    // Remove the injected style so the page is clean if further actions are needed.
    await page.evaluate(() => document.getElementById('__hl')?.remove());

    console.log('\n=== PRODUCT SUMMARY ===');
    console.log(`  ASIN:    ${product.asin    || 'N/A'}`);
    console.log(`  Title:   ${(product.title  || '').slice(0, 65)}…`);
    console.log(`  Price:   ${product.price   || 'N/A'}`);
    if (product.listPrice)    console.log(`  List:    ${product.listPrice}`);
    if (product.boughtRecently) console.log(`  Bought:  ${product.boughtRecently}`);
    console.log(`  Rating:  ${product.rating  || 'N/A'} (${product.reviewCount || 'N/A'} reviews)`);
    console.log(`  Bullets: ${product.bullets?.length   || 0}`);
    console.log(`  Specs:   ${Object.keys(product.specs || {}).length}`);
    console.log(`  Images:  ${product.imageUrls?.length || 0}`);

  } catch (err) {
    console.error('Fatal error:', err.message);
  } finally {
    if (browser) await browser.disconnect();
  }
})();
