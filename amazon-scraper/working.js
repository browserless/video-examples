/**
 * working.js — Amazon Search Scraper
 *
 * Connects to a cloud Chromium browser via Browserless, navigates to an
 * Amazon search results page, and extracts structured data from every
 * product card on the page (title, prices, rating, review count, images, etc.).
 *
 * While the page loads it streams live screenshots to the UI every 2.5 s so
 * you can watch the scrape happen in real time.  When done it saves two full-
 * page screenshots: one clean, one with CSS outlines showing exactly which
 * DOM elements were scraped.
 *
 * Required env vars:
 *   BROWSERLESS_TOKEN  — API key from browserless.io
 *   SEARCH_QUERY       — search term to use (default: 'mechanical keyboard')
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

const QUERY = (process.env.SEARCH_QUERY || 'mechanical keyboard').trim();
// Standard Amazon search URL — encodeURIComponent handles spaces and special chars.
const SEARCH_URL = `https://www.amazon.com/s?k=${encodeURIComponent(QUERY)}`;

// Browserless stealth WebSocket endpoint.
// /stealth          — launches Chromium with stealth patches to bypass bot-detection
// proxy=residential — routes all traffic through real residential IP addresses
// proxyCountry=us   — appear as a visitor based in the United States
// timeout=300000    — hard-kill the browser session after 5 minutes
const WS_ENDPOINT = `wss://production-sfo.browserless.io/stealth?token=${TOKEN}&proxy=residential&proxyCountry=us&timeout=300000`;

const HIGHLIGHT_CSS = `
  /* Title — scoped to title-recipe so brand labels are excluded */
  [data-cy="title-recipe"] h2 span {
    outline: 3px solid #FF6B35 !important;
    background-color: rgba(255, 107, 53, 0.18) !important;
    border-radius: 2px !important;
  }
  /* Current price */
  [data-cy="price-recipe"] .a-price:not(.a-text-price) {
    outline: 3px solid #00C853 !important;
    background-color: rgba(0, 200, 83, 0.25) !important;
    border-radius: 2px !important;
  }
  /* List / was price (strikethrough) */
  [data-cy="price-recipe"] .a-price.a-text-price {
    outline: 3px solid #FF9800 !important;
    background-color: rgba(255, 152, 0, 0.18) !important;
    border-radius: 2px !important;
  }
  /* Star rating */
  [data-component-type="s-search-result"] .a-icon-alt {
    outline: 3px solid #448AFF !important;
    background-color: rgba(68, 138, 255, 0.18) !important;
    border-radius: 2px !important;
  }
  /* Review count */
  [data-cy="reviews-block"] .s-underline-text {
    outline: 3px solid #00BCD4 !important;
    background-color: rgba(0, 188, 212, 0.18) !important;
    border-radius: 2px !important;
  }
  /* Product image */
  [data-component-type="s-search-result"] .s-image {
    outline: 4px solid #E040FB !important;
  }
  /* More buying choices — price is span.a-color-base, not an .a-price widget */
  [data-cy="secondary-offer-recipe"] span.a-color-base {
    outline: 3px solid #FF5252 !important;
    background-color: rgba(255, 82, 82, 0.18) !important;
    border-radius: 2px !important;
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
    console.log(`Query: "${QUERY}"`);
    console.log(`URL: ${SEARCH_URL}`);
    console.log('Connecting to Browserless (stealth + residential proxy)...');
    browser = await puppeteer.connect({ browserWSEndpoint: WS_ENDPOINT });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // ── Live frame stream (OPTIONAL — for UI demo only) ───────────────────────
    // Starts BEFORE navigation so the UI shows the browser from the very first moment.
    // Every 2.5 s it takes a viewport screenshot, writes it to live-frame.png, then
    // prints 'LIVE_FRAME_READY' to stdout — the Express server relays that signal to
    // the UI via SSE so the browser knows to reload the image.
    // The loop is stopped cleanly (liveStreaming = false) before the final screenshots
    // to avoid a race between a live frame write and the fullPage captures.
    // If you are not using the demo UI, remove this block and the streamLoop references.
    let liveStreaming = true;
    const streamLoop = (async () => {
      while (liveStreaming) {
        try {
          const buf = await page.screenshot({ fullPage: false });
          fs.writeFileSync(LIVE_FRAME_PATH, buf);
          process.stdout.write('LIVE_FRAME_READY\n');
        } catch (_) { /* page mid-navigation — skip frame */ }
        // Yield back before the sleep so liveStreaming=false is picked up quickly
        await new Promise(r => setTimeout(r, liveStreaming ? 2500 : 0));
      }
    })();

    // ── Navigation ───────────────────────────────────────────────────────────
    // Residential proxies can be slow to establish — the 30 s domcontentloaded
    // timeout fires frequently.  We swallow it and let waitForSelector below
    // do the real waiting; it has a more generous 90 s budget.
    console.log('Navigating to Amazon search...');
    try {
      await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      if (!e.message.includes('timeout')) throw e;
      console.log('Navigation still in progress (residential proxy latency) — waiting for content...');
    }
    // Wait for at least one search-result card — this is the true "page is ready" signal.
    await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 90000 })
      .catch(() => console.log('waitForSelector timed out — proceeding anyway'));
    await new Promise(r => setTimeout(r, 1500));

    const finalUrl = page.url();
    console.log('Navigation complete. URL:', finalUrl);

    // ── Extraction ───────────────────────────────────────────────────────────
    // page.$$eval selects ALL matching elements, then runs the callback function
    // INSIDE the browser's JavaScript context.  This avoids the overhead of
    // serialising DOM nodes across the CDP boundary one-by-one.
    // The callback must return plain serialisable values (no DOM nodes or functions).
    console.log('Extracting product data...');
    const products = await page.$$eval('[data-component-type="s-search-result"]', cards =>
      cards.map((card, i) => {
        // Amazon splits prices into a "whole" element (.a-price-whole) and a
        // "fraction" element (.a-price-fraction) — we rejoin them as "$X.YY".
        function fmt(whole, frac) {
          if (!whole) return null;
          const w = whole.innerText.replace(/[\s\n]/g, '').replace(/\.$/, '');
          return '$' + w + (frac ? '.' + frac.innerText.trim() : '');
        }

        // Title — prefer title-recipe container to skip brand-only h2s
        const titleEl  = card.querySelector('[data-cy="title-recipe"] h2 span') ||
                         card.querySelector('h2 a span') || card.querySelector('h2 span');

        // Current price
        const priceRecipe = card.querySelector('[data-cy="price-recipe"]');
        const priceEl  = priceRecipe?.querySelector('.a-price:not(.a-text-price) .a-price-whole') ||
                         card.querySelector('.a-price:not(.a-text-price) .a-price-whole');
        const fracEl   = priceEl?.closest('.a-price')?.querySelector('.a-price-fraction');

        // List / was price (strikethrough)
        const listEl   = priceRecipe?.querySelector('.a-price.a-text-price .a-price-whole') ||
                         card.querySelector('.a-price.a-text-price .a-price-whole');
        const listFrac = listEl?.closest('.a-price')?.querySelector('.a-price-fraction');

        // Rating (number only) + review count
        const ratingEl    = card.querySelector('[data-cy="reviews-block"] .a-icon-alt') ||
                            card.querySelector('.a-icon-alt');
        const rating      = ratingEl
          ? ratingEl.innerText.replace(' out of 5 stars', '').trim() : null;

        const reviewEl    = card.querySelector('[data-cy="reviews-block"] .s-underline-text') ||
                            card.querySelector('[data-cy="reviews-block"] .a-size-base');
        const reviewCount = reviewEl ? reviewEl.innerText.replace(/,/g, '').trim() : null;

        // "2K+ bought in past month" (leaf span, no child elements)
        const boughtEl = Array.from(card.querySelectorAll('span')).find(el =>
          /bought in past month/i.test(el.innerText) && el.childElementCount === 0
        );

        // More buying choices — price lives in span.a-color-base (no .a-price widget)
        const moreRecipe = card.querySelector('[data-cy="secondary-offer-recipe"]');
        const moreEl     = moreRecipe?.querySelector('span.a-color-base');

        // Image + link
        const imgEl  = card.querySelector('.s-image');
        const linkEl = card.querySelector('[data-cy="title-recipe"] a[href*="/dp/"]') ||
                       card.querySelector('a[href*="/dp/"]');

        return {
          index:                  i + 1,
          title:                  titleEl?.innerText.trim()  || null,
          price:                  fmt(priceEl, fracEl),
          listPrice:              fmt(listEl, listFrac),
          rating,
          reviewCount,
          boughtRecently:         boughtEl ? boughtEl.innerText.trim() : null,
          moreBuyingChoicesPrice: moreEl
            ? moreEl.innerText.replace(/ /g, ' ').trim() : null,
          imageUrl:               imgEl?.src  || null,
          link:                   linkEl?.href || null,
        };
      })
    ).catch(() => []);

    const counts = {
      titles:     products.filter(p => p.title).length,
      prices:     products.filter(p => p.price).length,
      listPrices: products.filter(p => p.listPrice).length,
      ratings:    products.filter(p => p.rating).length,
      reviews:    products.filter(p => p.reviewCount).length,
      images:     products.filter(p => p.imageUrl).length,
      links:      products.filter(p => p.link).length,
    };
    console.log(`Extracted ${products.length} cards — titles:${counts.titles} prices:${counts.prices} listPrices:${counts.listPrices} ratings:${counts.ratings} reviews:${counts.reviews} images:${counts.images} links:${counts.links}`);

    // Write results as pretty-printed JSON alongside the script.
    fs.writeFileSync(path.join(__dirname, 'amazon-data.json'), JSON.stringify({
      query: QUERY,
      url: finalUrl,
      timestamp: new Date().toISOString(),
      counts,   // summary tallies (how many cards had each field)
      products, // full array of extracted product objects
    }, null, 2));
    console.log('Data saved: amazon-data.json');

    // ── Stop live stream, then take comparison screenshots ────────────────────
    liveStreaming = false;
    await streamLoop; // wait for any in-flight frame to finish

    console.log('Taking screenshots...');

    // Freeze ALL JS-driven animation before the first screenshot so nothing can
    // shift layout between the clean and highlighted captures.
    // Amazon carousels use both setInterval and requestAnimationFrame — we kill both.
    await page.evaluate(() => {
      const maxId = window.setTimeout(() => {}, 0);
      for (let i = 0; i <= maxId; i++) { clearTimeout(i); clearInterval(i); }
      // Carousels that use requestAnimationFrame instead of setInterval
      window.requestAnimationFrame = () => 0;
      window.webkitRequestAnimationFrame = () => 0;
    });

    // Screenshot 1 — clean page, no modifications.
    await page.screenshot({ path: path.join(__dirname, 'working-result.png'), fullPage: true });
    console.log('Screenshot saved: working-result.png');

    // Screenshot 2 — inject HIGHLIGHT_CSS to draw coloured outlines around every
    // DOM element we scraped, then capture immediately (animation is still frozen).
    // Chrome flushes the CSS paint pass before each screenshot call, so no extra
    // delay is needed between inject and capture.
    await page.evaluate(css => {
      const s = document.createElement('style');
      s.id = '__hl';
      s.textContent = css;
      document.head.appendChild(s);
    }, HIGHLIGHT_CSS);
    await page.screenshot({ path: path.join(__dirname, 'working-highlighted.png'), fullPage: true });
    console.log('Highlighted screenshot saved: working-highlighted.png');
    // Remove the injected style so the page is clean if further actions are needed.
    await page.evaluate(() => document.getElementById('__hl')?.remove());

    console.log('\n=== SUMMARY ===');
    console.log(`  Query: "${QUERY}"`);
    for (const [k, n] of Object.entries(counts)) {
      console.log(`  ${k}: ${n > 0 ? `✓ ${n}` : '✗ 0'}`);
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
  } finally {
    if (browser) await browser.disconnect();
  }
})();
