const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.BROWSERLESS_TOKEN || '';
const BASE  = process.env.BROWSERLESS_BASE || 'https://production-sfo.browserless.io';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Plain HTTP fetch proxy (avoids browser CORS) ─────────────────────────────
app.post('/api/plain-fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const html = await resp.text();
    res.json({ ok: true, status: resp.status, size: html.length, preview: html.slice(0, 3500), ...analyzeHtml(html) });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.json({ ok: false, error: err.message, verdict: isTimeout ? 'timeout' : 'error', verdictLabel: isTimeout ? '⏱ Timed out' : '❌ Network error' });
  }
});

function analyzeHtml(html) {
  const isNextJS    = html.includes('__NEXT_DATA__');
  const isReact     = !isNextJS && /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i.test(html);
  const isCloudflare= html.includes('Just a moment') || html.includes('cf-browser-verification') || html.includes('Checking if the site connection is secure');
  const hasTable    = /<table/i.test(html);

  const textLen = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ')
    .filter(w => w.length > 4).length;

  let verdict, verdictLabel, verdictColor;
  if      (isCloudflare)            { verdict = 'blocked';  verdictLabel = '🛡️ Cloudflare challenge'; verdictColor = 'orange'; }
  else if (isNextJS)                { verdict = 'shell';    verdictLabel = '❌ Next.js shell — no content'; verdictColor = 'red'; }
  else if (isReact)                 { verdict = 'shell';    verdictLabel = '❌ React shell — no content'; verdictColor = 'red'; }
  else if (textLen > 300)           { verdict = 'full';     verdictLabel = '✅ Server-rendered HTML'; verdictColor = 'green'; }
  else if (textLen > 50)            { verdict = 'partial';  verdictLabel = '⚠️ Partial content'; verdictColor = 'yellow'; }
  else                              { verdict = 'empty';    verdictLabel = '❌ Empty response'; verdictColor = 'red'; }

  return { verdict, verdictLabel, verdictColor, wordCount: textLen, hasTable, isNextJS, isReact, isCloudflare };
}

// ─── Google search plain fetch (will be blocked / return garbage) ─────────────
app.post('/api/google-fetch', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const html = await resp.text();
    const isCaptcha  = /unusual.traffic|captcha|automated.queries|robot/i.test(html);
    const isConsent  = html.includes('consent.google.com') || /before you continue/i.test(html);

    let verdict, verdictLabel, verdictColor;
    if (resp.status === 429 || resp.status === 403) {
      verdict = 'blocked'; verdictLabel = '🛡️ Blocked — 403 Forbidden'; verdictColor = 'orange';
    } else if (isCaptcha) {
      verdict = 'blocked'; verdictLabel = '🛡️ Blocked — CAPTCHA wall'; verdictColor = 'orange';
    } else if (isConsent) {
      verdict = 'blocked'; verdictLabel = '🛡️ Blocked — Consent gate'; verdictColor = 'orange';
    } else if (html.trim().length < 500) {
      verdict = 'empty';   verdictLabel = '❌ Empty response';          verdictColor = 'red';
    } else {
      verdict = 'raw';     verdictLabel = '⚠️ Raw HTML Blob';           verdictColor = 'yellow';
    }

    res.json({ ok: true, status: resp.status, verdict, verdictLabel, verdictColor, preview: html.slice(0, 300), size: html.length });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.json({
      ok: false, error: err.message,
      verdict: isTimeout ? 'timeout' : 'error',
      verdictLabel: isTimeout ? '⏱ Timed out' : '❌ Network error',
      verdictColor: 'red',
    });
  }
});

// ─── Browserless /search ───────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  if (!TOKEN) return res.status(400).json({ error: 'BROWSERLESS_TOKEN not configured' });

  const { query, limit = 6, sources = ['web'] } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const resp = await fetch(`${BASE}/search?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: Math.min(parseInt(limit) || 6, 10), sources }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.json({ ok: false, error: `Browserless ${resp.status}: ${txt.slice(0, 200)}` });
    }

    const data = await resp.json();
    console.log('[/search] raw:', JSON.stringify(data).slice(0, 400));

    // Walk all possible shapes Browserless has returned
    let results =
      Array.isArray(data)            ? data :            // flat array
      Array.isArray(data.results)    ? data.results :    // {results:[]}
      Array.isArray(data.results?.web) ? data.results.web : // {results:{web:[]}}
      Array.isArray(data.data)       ? data.data :       // {data:[]}
      Array.isArray(data.data?.web)  ? data.data.web :   // {data:{web:[]}}  ← new format
      (() => {                                            // any nested array
        const search = o => {
          if (!o || typeof o !== 'object') return null;
          for (const v of Object.values(o)) {
            if (Array.isArray(v) && v.length) return v;
            const found = search(v);
            if (found) return found;
          }
          return null;
        };
        return search(data) || [];
      })();

    const apiError = !data.success && data.error ? data.error : null;
    console.log('[/search] resolved', results.length, 'results', apiError ? '| error:' + apiError : '');
    res.json({ ok: true, results, apiError });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Browserless /map ─────────────────────────────────────────────────────────
app.post('/api/map', async (req, res) => {
  if (!TOKEN) return res.status(400).json({ error: 'BROWSERLESS_TOKEN not configured' });

  const { url, limit = 200, sitemap = 'include', includeSubdomains = false } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const resp = await fetch(`${BASE}/map?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, limit: Math.min(parseInt(limit) || 200, 500), sitemap, includeSubdomains }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.json({ ok: false, error: `Browserless ${resp.status}: ${txt.slice(0, 200)}` });
    }

    const data = await resp.json();
    const urls = Array.isArray(data) ? data : (data.urls || data.links || data.data || []);
    res.json({ ok: true, urls });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Browserless /crawl via SSE so the UI gets live progress ──────────────────
app.get('/api/crawl-stream', async (req, res) => {
  if (!TOKEN) {
    res.status(400).json({ error: 'BROWSERLESS_TOKEN not configured' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const { url, limit, maxDepth, waitFor, onlyMainContent } = req.query;

  try {
    send('status', { phase: 'connecting', message: 'Connecting to Browserless…' });

    const body = {
      url,
      limit:    Math.min(parseInt(limit)    || 5, 20),
      maxDepth: Math.min(parseInt(maxDepth) || 1, 3),
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: onlyMainContent !== 'false',
        waitFor: Math.min(parseInt(waitFor) || 0, 5000),
      },
    };

    const startResp = await fetch(`${BASE}/crawl?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!startResp.ok) {
      const txt = await startResp.text();
      send('error', { message: `Browserless API ${startResp.status}: ${txt.slice(0, 300)}` });
      return res.end();
    }

    const start = await startResp.json();
    const crawlId  = start.id;
    const pollBase = start.url || `${BASE}/crawl/${crawlId}`;

    send('status', { phase: 'crawling', message: `Crawl started`, id: crawlId });

    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      await sleep(3000);

      const sep   = pollBase.includes('?') ? '&' : '?';
      const pollResp = await fetch(`${pollBase}${sep}token=${TOKEN}`, { signal: AbortSignal.timeout(10000) });
      const data  = await pollResp.json();
      const status = (data.status || data.state || '').toLowerCase();
      const completed = data.completed ?? 0;
      const total     = data.total     ?? '?';

      send('progress', { status, completed, total, message: `${completed} / ${total} pages` });

      if (['completed', 'complete', 'done'].includes(status)) {
        const pages = data.data || data.pages || [];
        send('result', { id: crawlId, pages, completed, total: data.total, failed: data.failed || 0 });
        send('status', { phase: 'done', message: `Done — ${pages.length} pages scraped` });
        return res.end();
      }

      if (['failed', 'error'].includes(status)) {
        send('error', { message: `Crawl ${status}: ${data.error || 'unknown'}` });
        return res.end();
      }
    }

    send('error', { message: 'Timed out waiting for crawl (4 min)' });
    res.end();

  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

// ─── Browserless /scrape — get readable text content from a URL ──────────────
app.post('/api/scrape', async (req, res) => {
  if (!TOKEN) return res.status(400).json({ error: 'BROWSERLESS_TOKEN not configured' });
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const resp = await fetch(`${BASE}/scrape?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, elements: [{ selector: 'article, [role=main], main, body' }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.json({ ok: false, error: `Browserless ${resp.status}: ${txt.slice(0, 200)}` });
    }
    const data = await resp.json();
    // Extract text from first matching element
    const results = data?.data?.[0]?.results || [];
    const text = results.map(r => r.text).filter(Boolean).join('\n\n').trim();
    res.json({ ok: true, text: text || '(no content extracted)' });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Proxy fetch for S3 contentUrl (avoids CORS on presigned URLs) ───────────
app.get('/api/fetch-content', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  http://localhost:${PORT}\n`);
});
