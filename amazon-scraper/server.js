/**
 * server.js — Express backend for the Amazon Scraper demo UI.
 *
 * Serves the static frontend and exposes three SSE endpoints that run
 * working.js (search scraper) and product.js (product scraper) as child
 * processes, streaming their stdout line-by-line to the browser in real time.
 *
 * Required env vars:
 *   BROWSERLESS_TOKEN  — API key from browserless.io
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3456;

const TOKEN = process.env.BROWSERLESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: BROWSERLESS_TOKEN environment variable is not set.');
  process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));

// SSE script runner — streams stdout from working.js / product.js to the browser
app.get('/run/:script', (req, res) => {
  const script = req.params.script;
  if (!['working', 'product'].includes(script)) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  send('status', 'running');

  const env = { ...process.env, BROWSERLESS_TOKEN: TOKEN };
  if (script === 'product') {
    env.PRODUCT_URL = req.query.url || '';
  } else {
    env.SEARCH_QUERY = req.query.q || 'mechanical keyboard';
  }

  const child = spawn('node', [`${script}.js`], { cwd: __dirname, env });

  child.stdout.on('data', chunk =>
    chunk.toString().split('\n').filter(Boolean).forEach(l => {
      if (l.trim() === 'LIVE_FRAME_READY') send('frame', Date.now());
      else send('line', l);
    })
  );
  child.stderr.on('data', chunk =>
    chunk.toString().split('\n').filter(Boolean).forEach(l => send('error', l))
  );
  child.on('close', code => { send('done', code); res.end(); });
  req.on('close', () => child.kill());
});

// Search JSON data saved by working.js
app.get('/data', (req, res) => {
  const p = path.join(__dirname, 'amazon-data.json');
  if (!fs.existsSync(p)) return res.status(404).json({ exists: false });
  res.sendFile(p);
});

// Product JSON data saved by product.js
app.get('/product-data', (req, res) => {
  const p = path.join(__dirname, 'product-data.json');
  if (!fs.existsSync(p)) return res.status(404).json({ exists: false });
  res.sendFile(p);
});

// Live viewport frame captured during scraping (for the left-panel preview)
app.get('/live-frame', (req, res) => {
  const p = path.join(__dirname, 'live-frame.png');
  if (!fs.existsSync(p)) return res.status(404).json({ exists: false });
  res.sendFile(p);
});

// Final screenshots — clean and highlighted versions
app.get('/screenshot/:name', (req, res) => {
  const map = {
    working:               'working-result.png',
    highlighted:           'working-highlighted.png',
    product:               'product-result.png',
    'product-highlighted': 'product-highlighted.png',
  };
  const file = map[req.params.name];
  if (!file) return res.status(400).end();
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) return res.status(404).json({ exists: false });
  res.sendFile(p);
});

app.listen(PORT, () => console.log(`UI running at http://localhost:${PORT}`));
