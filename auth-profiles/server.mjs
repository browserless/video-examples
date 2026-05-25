import express from 'express';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

// ── .env loader (read-only) ────────────────────────────────────────────────
function loadEnvFile(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(new URL('./.env', import.meta.url).pathname);

if (!process.env.BROWSERLESS_TOKEN) {
  console.warn('No BROWSERLESS_TOKEN in env — you can supply it via the UI at runtime.');
}

const TOKEN = process.env.BROWSERLESS_TOKEN;
const BROWSERLESS_BASE = process.env.BROWSERLESS_BASE || 'https://production-sfo.browserless.io';
const PROFILE_NAME = 'amplitude-profile';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://your-app.example.com/dashboard';
const DASHBOARD_SELECTOR = '#onenav-scroll-container > div > div.flex.min-h-full.min-w-0.grow.flex-col > div.flex.min-w-0.grow.flex-row > div > div > div > div > div > div > div.flex.flex-col.grow.min-w-0.bg-monochrome-minus5 > div.flex.flex-col.grow.min-w-0.gap-y-4.px-4 > div:nth-child(3) > div.w-full.overflow-visible > div > div.flex.flex-col.min-w-0.justify-center.bg-monochrome-minus5';
const VIEWPORT = { width: 1056, height: 816 };

// Optional menu-collapse click the PDF flow performs before capture,
// followed by an 8s settle to let the chart re-render.
const PDF_CLICK_1 = '#onenav-scroll-container > div > div.flex.min-h-full.min-w-0.grow.flex-col > div.flex.min-w-0.grow.flex-row > div > div > div > div > div > div > div.lcontainer6kKFrA1.lcontainer-flush6kKFrA10 > div > div > div.lcontainer-shadow6kKFrA30.lcontainer-shadow-visual-lift6kKFrA36 > div:nth-child(1) > div > div > div.lcontainer_XI4xw1.lvisual-lift-container_XI4xw7 > div > button';
const PDF_SETTLE_MS = 8000;

const tokenPreview = TOKEN && TOKEN.length > 8
  ? `${TOKEN.slice(0, 4)}…${TOKEN.slice(-4)} (len ${TOKEN.length})`
  : TOKEN ? `(len ${TOKEN.length})` : '(not set)';
console.log(`Using Browserless base: ${BROWSERLESS_BASE}`);
console.log(`Using token: ${tokenPreview}`);

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── streaming helpers ─────────────────────────────────────────────────────
function openStream(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}
function sendLine(res, type, message, data) {
  const payload = data === undefined ? { type, message } : { type, message, data };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
function highlight(res, range) {
  sendLine(res, 'highlight', range);
}

// ── DEV panel helpers (remove with the dev drawer) ────────────────────────
const devLog = [];
function devRecord(entry) {
  const e = { t: new Date().toISOString(), ...entry };
  devLog.push(e);
  if (devLog.length > 200) devLog.shift();
  return e;
}
function redact(s, extra) {
  let r = String(s);
  if (TOKEN) r = r.split(TOKEN).join('<TOKEN>');
  if (extra && extra !== TOKEN) r = r.split(extra).join('<TOKEN>');
  return r;
}
async function debugFetch(label, url, init, res, reqToken) {
  const method = init?.method || 'GET';
  const safeUrl = redact(url, reqToken);
  devRecord({ kind: 'request', label, method, url: safeUrl });
  if (res) sendLine(res, 'debug', `→ ${method} ${safeUrl}`, { kind: 'request', label, method, url: safeUrl });
  const r = await fetch(url, init);
  const headers = Object.fromEntries(r.headers.entries());
  devRecord({ kind: 'response', label, status: r.status, statusText: r.statusText, headers });
  if (res) sendLine(res, 'debug', `← ${r.status} ${r.statusText}`, { kind: 'response', label, status: r.status, statusText: r.statusText, headers });
  return r;
}

// ── session state (single active creation session) ────────────────────────
let session = null;
async function destroySession() {
  if (session?.browser) { try { await session.browser.close(); } catch {} }
  session = null;
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 1 — Create browser
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/create-browser', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  try {
    await destroySession();

    highlight(res, '2-10');
    sendLine(res, 'step', `POST ${base}/profile  name="${profileName}"`);
    const r = await debugFetch(
      'create-profile',
      `${base}/profile?token=${tok}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName }),
      },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    const data = await r.json();
    const wsEndpoint = data.connect || data.browserWSEndpoint || data.webSocketDebuggerUrl;
    sendLine(res, 'step', 'Received connect URL');

    highlight(res, '13-16');
    sendLine(res, 'step', 'puppeteer.connect(...)');
    const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    const page = await browser.newPage();
    session = { browser, page };

    sendLine(res, 'success', 'Browser ready — session held server-side');
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    await destroySession();
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 2 — Authenticate via LiveURL
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/authenticate', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const loginUrl = (req.body?.loginUrl || 'https://your-app.example.com/login').trim();
  try {
    if (!session) {
      sendLine(res, 'error', 'No active browser — run Step 1 first');
      return res.end();
    }
    const { page } = session;

    highlight(res, '2');
    sendLine(res, 'step', `page.goto("${loginUrl}")`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    highlight(res, '6-7');
    sendLine(res, 'step', 'CDP → Browserless.liveURL');
    const cdp = await page.createCDPSession();
    session.cdp = cdp;
    const live = await cdp.send('Browserless.liveURL', { timeout: 180000 });
    const liveURL = typeof live === 'string'
      ? live
      : (live.liveURL || live.url || live.liveUrl);
    if (!liveURL) {
      sendLine(res, 'error', `No LiveURL in response: ${JSON.stringify(live)}`);
      return res.end();
    }
    sendLine(res, 'liveurl', liveURL);
    sendLine(res, 'step', 'LiveURL ready — log in through the embedded window');

    highlight(res, '13-16');
    sendLine(res, 'step', 'Waiting for #onenav-scroll-container (5 min timeout)...');
    try {
      await page.waitForSelector('#onenav-scroll-container', { timeout: 300000 });
      sendLine(res, 'success', 'Login detected — dashboard loaded');

      sendLine(res, 'step', 'Waiting 5 seconds...');
      await new Promise((r) => setTimeout(r, 5000));

      sendLine(res, 'step', 'Injecting success overlay');
      await page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.45);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        `;
        overlay.innerHTML = `
          <div style="
            background: #fff;
            border-radius: 16px;
            padding: 40px 56px;
            text-align: center;
            box-shadow: 0 8px 40px rgba(0,0,0,0.25);
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <div style="font-size: 22px; font-weight: 600; color: #1a1a1a;">Login successful</div>
            <div style="font-size: 15px; color: #666; margin-top: 8px;">Closing browser…</div>
          </div>
        `;
        document.body.appendChild(overlay);
      });
    } catch {
      sendLine(res, 'error', 'Timed out waiting for login');
    }
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 3 — Save profile
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/save-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  try {
    if (!session) {
      sendLine(res, 'error', 'No active browser — run Step 1 first');
      return res.end();
    }
    const { page, browser } = session;

    highlight(res, '2-6');
    sendLine(res, 'step', 'CDP → Browserless.saveProfile');
    const cdp = session.cdp || await page.createCDPSession();
    const result = await cdp.send('Browserless.saveProfile', { name: profileName });
    if (result.ok) {
      sendLine(res, 'success', `Saved — cookieCount: ${result.cookieCount}, originCount: ${result.originCount}`);
    } else {
      sendLine(res, 'error', result.error || 'Save failed');
    }

    highlight(res, '9');
    sendLine(res, 'step', 'browser.close()');
    await browser.close();
    session = null;
    sendLine(res, 'success', 'Creation session closed');
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 4a — Reuse profile via REST /screenshot
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/reuse-screenshot', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const dashboardUrl = (req.body?.dashboardUrl || DASHBOARD_URL).trim();
  try {
    highlight(res, '6-19');
    sendLine(res, 'step', `POST /screenshot?profile=${profileName}`);
    const r = await debugFetch(
      'screenshot-rest',
      `${base}/screenshot?token=${tok}&profile=${profileName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: dashboardUrl,
          options: { type: 'png' },
          selector: DASHBOARD_SELECTOR,
          gotoOptions: { waitUntil: 'load' },
          viewport: VIEWPORT,
          waitForTimeout: 5000,
        }),
      },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    highlight(res, '20');
    const buf = Buffer.from(await r.arrayBuffer());
    sendLine(res, 'success', `screenshot:${buf.toString('base64')}`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 4b — Reuse profile via puppeteer (PDF with clicks)
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/reuse-pdf', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const dashboardUrl = (req.body?.dashboardUrl || DASHBOARD_URL).trim();
  const wsBase = base.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/?token=${tok}&profile=${profileName}`;
  const safeWs = redact(wsUrl, tok);
  devRecord({ kind: 'request', label: 'pdf-ws', method: 'WS', url: safeWs });
  sendLine(res, 'debug', `→ WS ${safeWs}`, { kind: 'request', label: 'pdf-ws', method: 'WS', url: safeWs });

  let browser;
  try {
    highlight(res, '7-11');
    sendLine(res, 'step', `puppeteer.connect(profile=${profileName})`);
    browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

    highlight(res, '12-13');
    sendLine(res, 'step', 'newPage + setViewport');
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    highlight(res, '14');
    sendLine(res, 'step', 'page.goto(dashboardUrl)');
    await page.goto(dashboardUrl, { waitUntil: 'load', timeout: 60000 });

    highlight(res, '23');
    sendLine(res, 'step', 'click — collapse menu (optional)');
    try {
      await page.waitForSelector(PDF_CLICK_1, { timeout: 5000 });
      await page.click(PDF_CLICK_1);
      sendLine(res, 'step', 'click — collapsed');
    } catch {
      sendLine(res, 'step', 'click — not present, skipping');
    }

    highlight(res, '24');
    sendLine(res, 'step', `settle ${PDF_SETTLE_MS}ms — let chart re-render`);
    await new Promise((r) => setTimeout(r, PDF_SETTLE_MS));

    highlight(res, '26');
    sendLine(res, 'step', 'page.pdf()');
    const pdfBuf = Buffer.from(
      await page.pdf({ printBackground: true, format: 'Letter', landscape: true, timeout: 60000 })
    );
    devRecord({ kind: 'response', label: 'pdf-pup', status: 200, statusText: `PDF ${pdfBuf.length}b`, headers: {} });
    sendLine(res, 'debug', `← PDF ${pdfBuf.length} bytes`, { kind: 'response', label: 'pdf-pup', status: 200, statusText: `PDF ${pdfBuf.length}b`, headers: {} });
    sendLine(res, 'success', `pdf:${pdfBuf.toString('base64')}`);

    highlight(res, '27');
    sendLine(res, 'step', 'browser.close()');
    await browser.close();
    browser = null;
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    try { await browser?.close(); } catch {}
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 5 — List profiles
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/list-profiles', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  try {
    highlight(res, '3-7');
    sendLine(res, 'step', `GET ${base}/profiles`);
    const r = await debugFetch(
      'list-profiles',
      `${base}/profiles?token=${tok}`,
      { method: 'GET' },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    const data = await r.json();
    const list = Array.isArray(data) ? data : (data.profiles || data.data || []);
    sendLine(res, 'step', `Found ${list.length} profile(s)`);
    sendLine(res, 'profiles', JSON.stringify(list));
    sendLine(res, 'success', 'List returned');
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 6 — Rename profile (PUT /profile/:name with { name: newName })
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/rename-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const from = (req.body?.from || profileName).trim();
  const to   = (req.body?.to   || `${profileName}-v2`).trim();
  if (!from || !to || from === to) {
    sendLine(res, 'error', 'Provide distinct "from" and "to" names');
    return res.end();
  }
  try {
    highlight(res, '5-14');
    sendLine(res, 'step', `PUT /profile/${from}  body={"name":"${to}"}`);
    const r = await debugFetch(
      'rename-profile',
      `${base}/profile/${encodeURIComponent(from)}?token=${tok}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: to }),
      },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    const data = await r.json();
    sendLine(res, 'profile', JSON.stringify(data));
    sendLine(res, 'success', `Renamed "${from}" → "${data.name || to}"`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 7 — Delete profile
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/delete-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const name = (req.body?.name || profileName).trim();
  if (!name) {
    sendLine(res, 'error', 'Provide a profile name');
    return res.end();
  }
  try {
    highlight(res, '3-7');
    sendLine(res, 'step', `DELETE ${base}/profile/${name}`);
    const r = await debugFetch(
      'delete-profile',
      `${base}/profile/${encodeURIComponent(name)}?token=${tok}`,
      { method: 'DELETE' },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    sendLine(res, 'success', `Deleted "${name}"`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 8 — Inspect a single profile
//   Tries GET /profile/:name first; falls back to filtering the list
//   if the API doesn't expose per-profile metadata.
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/inspect-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const name = (req.body?.name || profileName).trim();
  if (!name) {
    sendLine(res, 'error', 'Provide a profile name');
    return res.end();
  }
  try {
    highlight(res, '3-8');
    sendLine(res, 'step', `GET /profile/${name}`);
    const direct = await debugFetch(
      'inspect-profile',
      `${base}/profile/${encodeURIComponent(name)}?token=${tok}`,
      { method: 'GET' },
      res,
      tok
    );
    if (direct.ok) {
      const data = await direct.json();
      sendLine(res, 'profile', JSON.stringify(data));
      sendLine(res, 'success', 'Metadata returned');
      return res.end();
    }
    // Fallback: list + filter
    sendLine(res, 'step', 'Direct GET failed — falling back to list + filter');
    highlight(res, '15-18');
    const list = await debugFetch(
      'inspect-fallback',
      `${base}/profiles?token=${tok}`,
      { method: 'GET' },
      res,
      tok
    );
    if (!list.ok) {
      const text = await list.text();
      sendLine(res, 'error', `${list.status} ${text}`);
      return res.end();
    }
    const data = await list.json();
    const arr = Array.isArray(data) ? data : (data.profiles || data.data || []);
    const found = arr.find((p) => (p?.name || p) === name);
    if (!found) {
      sendLine(res, 'error', `Profile "${name}" not found`);
      return res.end();
    }
    sendLine(res, 'profile', JSON.stringify(found));
    sendLine(res, 'success', 'Filtered from list');
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 9 — Export profile state (cookies via CDP)
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/export-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const name = (req.body?.name || profileName).trim();
  if (!name) {
    sendLine(res, 'error', 'Provide a profile name');
    return res.end();
  }
  let browser;
  try {
    const wsBase = base.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/?token=${tok}&profile=${encodeURIComponent(name)}`;
    sendLine(res, 'debug', `→ WS ${redact(wsUrl, tok)}`, { kind: 'request', label: 'export-ws', method: 'WS', url: redact(wsUrl, tok) });
    devRecord({ kind: 'request', label: 'export-ws', method: 'WS', url: redact(wsUrl, tok) });

    highlight(res, '4-8');
    sendLine(res, 'step', `puppeteer.connect(profile="${name}")`);
    browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

    highlight(res, '9');
    sendLine(res, 'step', 'newPage');
    const page = await browser.newPage();

    highlight(res, '10');
    sendLine(res, 'step', 'page.goto(about:blank)');
    await page.goto('about:blank');

    highlight(res, '12');
    sendLine(res, 'step', 'createCDPSession');
    const cdp = await page.createCDPSession();

    highlight(res, '13');
    sendLine(res, 'step', 'CDP → Network.getAllCookies');
    const { cookies } = await cdp.send('Network.getAllCookies');
    sendLine(res, 'step', `Got ${cookies.length} cookie(s)`);

    // Summarise: group cookies by domain
    const byDomain = {};
    for (const c of cookies) {
      byDomain[c.domain] = (byDomain[c.domain] || 0) + 1;
    }

    highlight(res, '14');
    sendLine(res, 'step', 'browser.close()');
    await browser.close();
    browser = null;

    sendLine(res, 'export', JSON.stringify({ cookies, byDomain }));
    sendLine(res, 'success', `Exported ${cookies.length} cookie(s) across ${Object.keys(byDomain).length} domain(s)`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    try { await browser?.close(); } catch {}
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 10 — Upload profile state (POST /profile/upload)
//   Creates a NEW profile from a JSON state blob ({ cookies, origins }).
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/upload-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const name = (req.body?.name || '').trim();
  const stateStr = (req.body?.state || '').trim();
  if (!name) {
    sendLine(res, 'error', 'Provide a profile name');
    return res.end();
  }
  let state;
  try { state = JSON.parse(stateStr); }
  catch (e) {
    sendLine(res, 'error', `Invalid state JSON: ${e.message}`);
    return res.end();
  }
  try {
    highlight(res, '5-16');
    const cookieN = Array.isArray(state.cookies) ? state.cookies.length : 0;
    const originN = Array.isArray(state.origins) ? state.origins.length : 0;
    sendLine(res, 'step', `POST /profile/upload  name="${name}"  cookies=${cookieN}  origins=${originN}`);
    const r = await debugFetch(
      'upload-profile',
      `${base}/profile/upload?token=${tok}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state }),
      },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    const data = await r.json();
    sendLine(res, 'profile', JSON.stringify(data));
    sendLine(res, 'success', `Uploaded "${name}" — ${data.cookieCount ?? '?'} cookies, ${data.originCount ?? '?'} origins`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 11 — Refresh profile state (POST /profile/refresh)
//   Updates the saved state of an EXISTING profile in place.
// ─────────────────────────────────────────────────────────────────────────
app.post('/api/step/refresh-profile', async (req, res) => {
  openStream(res);
  const tok  = (req.body?.token || TOKEN || '').trim();
  const base = (req.body?.base  || BROWSERLESS_BASE).replace(/\/$/, '');
  const profileName = (req.body?.profileName || PROFILE_NAME).trim();
  const name = (req.body?.name || '').trim();
  const stateStr = (req.body?.state || '').trim();
  if (!name) {
    sendLine(res, 'error', 'Provide a profile name');
    return res.end();
  }
  let state;
  try { state = JSON.parse(stateStr); }
  catch (e) {
    sendLine(res, 'error', `Invalid state JSON: ${e.message}`);
    return res.end();
  }
  try {
    highlight(res, '5-16');
    const cookieN = Array.isArray(state.cookies) ? state.cookies.length : 0;
    const originN = Array.isArray(state.origins) ? state.origins.length : 0;
    sendLine(res, 'step', `POST /profile/refresh  name="${name}"  cookies=${cookieN}  origins=${originN}`);
    const r = await debugFetch(
      'refresh-profile',
      `${base}/profile/refresh?token=${tok}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, state }),
      },
      res,
      tok
    );
    if (!r.ok) {
      const text = await r.text();
      sendLine(res, 'debug', `body: ${text.slice(0, 500)}`);
      sendLine(res, 'error', `${r.status} ${text}`);
      return res.end();
    }
    const data = await r.json();
    sendLine(res, 'profile', JSON.stringify(data));
    sendLine(res, 'success', `Refreshed "${name}" — ${data.cookieCount ?? '?'} cookies, ${data.originCount ?? '?'} origins`);
    res.end();
  } catch (err) {
    sendLine(res, 'error', err.message || String(err));
    res.end();
  }
});

// ── DEV ONLY ──────────────────────────────────────────────────────────────
app.get('/api/debug', (req, res) => {
  res.json({
    base: BROWSERLESS_BASE,
    tokenPreview,
    tokenLength: TOKEN.length,
    profileName: PROFILE_NAME,
    dashboardUrl: DASHBOARD_URL,
    sessionActive: !!session,
    node: process.version,
    cwd: process.cwd(),
    recent: devLog.slice(-100),
  });
});

app.listen(3000, () => {
  console.log('App running at http://localhost:3000');
});
