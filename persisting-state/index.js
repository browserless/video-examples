import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");
const envResult = dotenv.config({ path: envPath, override: true });
if (envResult.error) {
  console.error("Failed to load .env from:", envPath, envResult.error.message);
} else {
  console.log("Loaded .env from:", envPath);
}
import express from "express";
import puppeteer from "puppeteer-core";

const TOKEN = process.env.BROWSERLESS_TOKEN || "YOUR_API_TOKEN_HERE";
const ENDPOINT = process.env.BROWSERLESS_ENDPOINT || "production-sfo.browserless.io";
const PORT = process.env.PORT || 3001;

// ProtonMail selectors
const SELECTORS = {
  username: "#username",
  password: "#password",
  submit:
    "body > div.app-root > div.flex.\\*\\:min-size-auto.flex-nowrap.flex-column.h-full.overflow-auto.relative.ui-standard.sign-layout-bg > div.sign-layout-container.p-0.sm\\:px-6.flex.flex-nowrap.flex-column.justify-space-between > main > div.w-full.max-w-custom.relative.sign-layout.pt-1.pb-6.sm\\:p-11.px-4.mx-auto.sm\\:shadow-lifted.shadow-color-primary > div.sign-layout-main-content > form > button",
  twoFAHeader:
    "body > div.app-root > div.flex.\\*\\:min-size-auto.flex-nowrap.flex-column.h-full.overflow-auto.relative.ui-standard.sign-layout-bg > div > main > div > div.sign-layout-header.mb-6 > div > h1",
  totpFirst: "#totp",
  inbox: 'h2[title="Inbox"]',
  logoutAvatar: ".user-dropdown-text",
  logoutButton:
    "div.dropdown-content > div > div.mb-4.px-4.flex-column.gap-2 > button",
};

const SESSION_TTL = 604800000; // 7 days in ms
const INBOX_URL = "https://mail.proton.me/u/5/inbox";

// In-memory state
let session = null;
let activeBrowser = null; // Holds browser connection between login and 2FA submission
let activePage = null;

const app = express();
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createSession(config) {
  const response = await fetch(
    `https://${ENDPOINT}/session?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create session (${response.status}): ${text}`);
  }

  return response.json();
}

async function stopSession(stopUrl) {
  const response = await fetch(`${stopUrl}&force=true`, { method: "DELETE" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to stop session (${response.status}): ${text}`);
  }
  console.log("Session stopped and deleted.");
}

// Retry connection with delay (browserless needs time to persist data after close)
async function connectWithRetry(wsEndpoint, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    } catch (err) {
      console.log(`Connection attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) {
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    // Clean up any previous browser connection
    if (activeBrowser) {
      try { await activeBrowser.close(); } catch (_) {}
      activeBrowser = null;
      activePage = null;
    }

    // Create a persisting session — no processKeepAlive so browser.close() works cleanly
    console.log("Creating session...");
    session = await createSession({
      ttl: SESSION_TTL,
      headless: false,
    });
    console.log("Session created:", session.id);

    activeBrowser = await puppeteer.connect({
      browserWSEndpoint: session.connect,
    });

    activePage = (await activeBrowser.pages())[0];
    await activePage.setViewport({ width: 1280, height: 900 });

    console.log("Navigating to ProtonMail login...");
    await activePage.goto("https://account.proton.me/mail", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Entering credentials...");
    await activePage.waitForSelector(SELECTORS.username, { timeout: 15000 });
    await activePage.type(SELECTORS.username, username, { delay: 50 });

    await activePage.waitForSelector(SELECTORS.password, { timeout: 15000 });
    await activePage.type(SELECTORS.password, password, { delay: 50 });

    console.log("Clicking submit...");
    await activePage.waitForSelector(SELECTORS.submit, { timeout: 15000 });
    await activePage.click(SELECTORS.submit);

    console.log("Waiting for 2FA page...");
    await activePage.waitForSelector(SELECTORS.twoFAHeader, { timeout: 30000 });
    console.log("2FA page detected! Browser stays connected in memory.");

    res.json({
      sessionConnect: session.connect,
      sessionStop: session.stop,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    if (activeBrowser) {
      try { await activeBrowser.close(); } catch (_) {}
      activeBrowser = null;
      activePage = null;
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/submit-2fa", async (req, res) => {
  const { code } = req.body;
  if (!code || !session) {
    return res
      .status(400)
      .json({ error: "2FA code is required and session must exist" });
  }

  if (!activeBrowser || !activePage) {
    return res
      .status(400)
      .json({ error: "No active browser connection — please log in again" });
  }

  try {
    // Use the browser/page that's been connected in memory since login
    const page = activePage;
    console.log("Using stored browser. Page URL:", page.url());

    console.log("Entering 2FA code...");
    await page.waitForSelector(SELECTORS.totpFirst, { timeout: 15000 });
    await page.click(SELECTORS.totpFirst);
    await page.keyboard.type(code, { delay: 100 });

    console.log("Waiting for inbox...");
    await page.waitForSelector(SELECTORS.inbox, { timeout: 60000 });
    console.log("Login successful!");

    const screenshotBuffer = await page.screenshot({ encoding: "base64" });

    // Close browser — session data (cookies, localStorage) persists on disk
    console.log("Closing browser. Session data will persist to disk.");
    await activeBrowser.close();
    console.log("Browser closed. session.connect:", session.connect);
    activeBrowser = null;
    activePage = null;

    res.json({ screenshot: screenshotBuffer });
  } catch (err) {
    console.error("2FA error:", err.message);
    if (activeBrowser) {
      try { await activeBrowser.close(); } catch (_) {}
      activeBrowser = null;
      activePage = null;
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/refresh-screenshot", async (req, res) => {
  const connectUrl = req.body.sessionConnect || session?.connect;
  if (!connectUrl) {
    return res.status(400).json({ error: "No session — please log in" });
  }

  let browser;
  try {
    // Connect — new browser process starts, cookies/localStorage restored from disk
    console.log("Connecting to session for refresh...");
    browser = await connectWithRetry(connectUrl);

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setViewport({ width: 1280, height: 900 });

    console.log("Navigating to inbox (cookies persist)...");
    await page.goto(INBOX_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for inbox to load (we're already logged in via persisted cookies)
    await page.waitForSelector(SELECTORS.inbox, { timeout: 30000 });

    const screenshotBuffer = await page.screenshot({ encoding: "base64" });

    await browser.close();
    console.log("Screenshot taken. Browser closed.");

    res.json({ screenshot: screenshotBuffer });
  } catch (err) {
    console.error("Refresh error:", err.message);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/delete-session", async (req, res) => {
  const connectUrl = req.body.sessionConnect || session?.connect;
  const stopUrl = req.body.sessionStop || session?.stop;
  if (!connectUrl || !stopUrl) {
    return res.status(400).json({ error: "No session — please log in" });
  }

  let browser;
  try {
    // Connect to log out first (retry in case previous browser.close() is still cleaning up)
    console.log("Connecting to session for deletion...");
    browser = await connectWithRetry(connectUrl);

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setViewport({ width: 1280, height: 900 });

    console.log("Navigating to inbox for logout...");
    await page.goto(INBOX_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Logging out...");
    await page.waitForSelector(SELECTORS.logoutAvatar, { timeout: 15000 });
    await page.click(SELECTORS.logoutAvatar);

    await page.waitForSelector(SELECTORS.logoutButton, { timeout: 10000 });
    await page.click(SELECTORS.logoutButton);

    await new Promise((r) => setTimeout(r, 2000));
    await browser.close();
    console.log("Logged out. Browser closed.");

    // Delete session via REST API
    await stopSession(stopUrl);

    session = null;
    res.json({ success: true });
  } catch (err) {
    console.error("Delete session error:", err.message);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    // Still try to delete the session even if logout failed
    try {
      await stopSession(stopUrl);
    } catch (_) {}
    session = null;
    res.status(500).json({ error: err.message });
  }
});

// ─── HTML UI ──────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Persisting State Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    h1 {
      font-size: 1.8rem;
      margin-bottom: 8px;
      color: #fff;
    }
    .subtitle {
      color: #888;
      margin-bottom: 32px;
      font-size: 0.9rem;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 32px;
      width: 100%;
      max-width: 520px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #aaa;
      margin-bottom: 6px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #444;
      border-radius: 8px;
      background: #111;
      color: #fff;
      font-size: 1rem;
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #4caf50; }
    button {
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .btn-primary {
      background: #4caf50;
      color: #fff;
      width: 100%;
    }
    .btn-primary:hover { background: #388e3c; }
    .btn-primary:disabled {
      background: #444;
      color: #777;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #2a2a2a;
      color: #ccc;
      border: 1px solid #444;
    }
    .btn-secondary:hover { background: #333; }
    .btn-danger {
      background: #d32f2f;
      color: #fff;
    }
    .btn-danger:hover { background: #b71c1c; }
    .status {
      text-align: center;
      padding: 20px;
      font-size: 1.1rem;
    }
    .heading-2fa {
      font-size: 1.4rem;
      color: #ff9800;
      margin-bottom: 8px;
    }
    .countdown {
      color: #ff9800;
      font-size: 0.95rem;
      margin-bottom: 16px;
    }
    .countdown span { font-weight: bold; }
    .dev-label {
      margin-top: 16px;
      font-size: 0.75rem;
      color: #666;
      word-break: break-all;
    }
    .dev-label code {
      color: #888;
      background: #111;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .screenshot-container {
      margin: 16px 0;
      text-align: center;
    }
    .screenshot-container img {
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .actions button { flex: 1; }
    .try-again {
      color: #4caf50;
      cursor: pointer;
      text-decoration: underline;
      background: none;
      border: none;
      font-size: 0.9rem;
      margin-top: 8px;
    }
    .hidden { display: none; }
    .message {
      text-align: center;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.9rem;
    }
    .message.success { background: #1b5e20; color: #a5d6a7; }
    .message.error { background: #b71c1c33; color: #ef5350; }
  </style>
</head>
<body>
  <h1>Login to protonmail with Persisting State</h1>
  <p class="subtitle">Browserless session management via REST Session API &mdash; cookies &amp; localStorage persist across browser restarts</p>

  <div class="card">
    <!-- State 1: Login Form -->
    <div id="login-form">
      <label for="username">Username</label>
      <input type="text" id="username" placeholder="ProtonMail username" />
      <label for="password">Password</label>
      <input type="password" id="password" placeholder="Password" />
      <button class="btn-primary" id="login-btn" onclick="handleLogin()">Log in</button>
    </div>

    <!-- State 2: Logging In -->
    <div id="logging-in" class="hidden">
      <div class="status">Logging in...</div>
    </div>

    <!-- State 3: 2FA Entry -->
    <div id="twofa-form" class="hidden">
      <div class="heading-2fa">2FA Required!</div>
      <p class="countdown">
        Please enter your 2FA code (6 digits) &mdash; You have <span id="twofa-countdown">120</span> seconds
      </p>
      <input type="text" id="twofa-code" placeholder="6-digit code" maxlength="6" pattern="[0-9]{6}" />
      <button class="btn-primary" id="twofa-btn" onclick="handleSubmit2FA()">Enter</button>
      <button class="try-again hidden" id="try-again-btn" onclick="resetToLogin()">Try again</button>
      <div class="dev-label">
        Session.connect for development purposes:<br />
        <code id="dev-session-connect"></code>
      </div>
      <div class="dev-label">
        Session.stop for development purposes:<br />
        <code id="dev-session-stop"></code>
      </div>
    </div>

    <!-- State 4: 2FA Submitting -->
    <div id="twofa-submitting" class="hidden">
      <div class="status">Verifying 2FA code...</div>
    </div>

    <!-- State 5: Screenshot Display -->
    <div id="screenshot-view" class="hidden">
      <div id="screenshot-message"></div>
      <div class="screenshot-container">
        <img id="screenshot-img" alt="ProtonMail inbox screenshot" />
      </div>
      <div class="actions">
        <button class="btn-secondary" id="refresh-btn" onclick="handleRefresh()">
          Refresh the screenshot &mdash; available for 7 days
        </button>
        <button class="btn-danger" id="delete-btn" onclick="handleDelete()">Delete browser state</button>
      </div>
      <div class="dev-label">
        Session.connect for development purposes:<br />
        <code id="dev-session-connect-refresh"></code>
      </div>
      <div class="dev-label">
        Session.stop for development purposes:<br />
        <code id="dev-session-stop-refresh"></code>
      </div>
    </div>

    <!-- Error display -->
    <div id="error-display" class="hidden">
      <div class="message error" id="error-message"></div>
      <button class="btn-primary" onclick="resetToLogin()">Try again</button>
    </div>
  </div>

  <script>
    let sessionConnect = null;
    let sessionStop = null;
    let twofaTimer = null;

    function showOnly(id) {
      ['login-form', 'logging-in', 'twofa-form', 'twofa-submitting', 'screenshot-view', 'error-display']
        .forEach(s => document.getElementById(s).classList.add('hidden'));
      document.getElementById(id).classList.remove('hidden');
    }

    function showError(msg) {
      document.getElementById('error-message').textContent = msg;
      showOnly('error-display');
    }

    function resetToLogin() {
      clearInterval(twofaTimer);
      sessionConnect = null;
      sessionStop = null;
      localStorage.removeItem('browserless_session');
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('twofa-code').value = '';
      document.getElementById('twofa-btn').disabled = false;
      document.getElementById('try-again-btn').classList.add('hidden');
      document.getElementById('refresh-btn').classList.remove('hidden');
      document.getElementById('refresh-btn').disabled = false;
      document.getElementById('refresh-btn').textContent = 'Refresh the screenshot \\u2014 available for 7 days';
      document.getElementById('delete-btn').classList.remove('hidden');
      document.getElementById('delete-btn').disabled = false;
      document.getElementById('delete-btn').textContent = 'Delete browser state';
      showOnly('login-form');
    }

    function startCountdown(spanId, seconds, onExpire) {
      const span = document.getElementById(spanId);
      let remaining = seconds;
      span.textContent = remaining;
      return setInterval(() => {
        remaining--;
        span.textContent = remaining;
        if (remaining <= 0) {
          onExpire();
        }
      }, 1000);
    }

    async function handleLogin() {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      if (!username || !password) return;

      showOnly('logging-in');

      try {
        const resp = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        sessionConnect = data.sessionConnect;
        sessionStop = data.sessionStop;
        document.getElementById('dev-session-connect').textContent = sessionConnect;
        document.getElementById('dev-session-stop').textContent = sessionStop;
        showOnly('twofa-form');

        // Start 120s countdown (browser stays connected in memory, no keepalive limit)
        twofaTimer = startCountdown('twofa-countdown', 120, () => {
          clearInterval(twofaTimer);
          document.getElementById('twofa-btn').disabled = true;
          document.getElementById('try-again-btn').classList.remove('hidden');
        });
      } catch (err) {
        showError(err.message);
      }
    }

    async function handleSubmit2FA() {
      const code = document.getElementById('twofa-code').value.replace(/\D/g, '').slice(0, 6);
      if (code.length !== 6) {
        alert('Please enter a valid 6-digit code (got ' + code.length + ' digits)');
        return;
      }

      clearInterval(twofaTimer);
      showOnly('twofa-submitting');

      try {
        const resp = await fetch('/api/submit-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        document.getElementById('screenshot-img').src = 'data:image/png;base64,' + data.screenshot;
        document.getElementById('dev-session-connect-refresh').textContent = sessionConnect;
        document.getElementById('dev-session-stop-refresh').textContent = sessionStop;
        document.getElementById('screenshot-message').innerHTML = '';
        showOnly('screenshot-view');

        // Persist session to localStorage so it survives browser close / page refresh
        localStorage.setItem('browserless_session', JSON.stringify({ sessionConnect, sessionStop }));
      } catch (err) {
        showError(err.message);
      }
    }

    async function handleRefresh() {
      const btn = document.getElementById('refresh-btn');
      btn.disabled = true;
      btn.textContent = 'Refreshing...';

      try {
        const resp = await fetch('/api/refresh-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionConnect, sessionStop }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        document.getElementById('screenshot-img').src = 'data:image/png;base64,' + data.screenshot;
        btn.disabled = false;
        btn.textContent = 'Refresh the screenshot \\u2014 available for 7 days';
      } catch (err) {
        showError(err.message);
      }
    }

    // On page load: check if an existing session is saved in localStorage
    (function checkExistingSession() {
      const saved = localStorage.getItem('browserless_session');
      if (!saved) return; // No saved session — show login form (default)

      try {
        const { sessionConnect: sc, sessionStop: ss } = JSON.parse(saved);
        if (!sc || !ss) return;

        sessionConnect = sc;
        sessionStop = ss;

        // Skip login form — show screenshot view with restore message
        document.getElementById('dev-session-connect-refresh').textContent = sc;
        document.getElementById('dev-session-stop-refresh').textContent = ss;
        document.getElementById('screenshot-message').innerHTML =
          '<div class="message success">Existing session found &mdash; click Refresh to take a new screenshot</div>';
        showOnly('screenshot-view');
      } catch (_) {
        localStorage.removeItem('browserless_session');
      }
    })();

    async function handleDelete() {
      if (!confirm('Are you sure? Your browser state will no longer be available')) {
        return;
      }

      const btn = document.getElementById('delete-btn');
      btn.disabled = true;
      btn.textContent = 'Deleting...';

      try {
        const resp = await fetch('/api/delete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionConnect, sessionStop }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        document.getElementById('screenshot-message').innerHTML =
          '<div class="message success">Session logged out and browser deleted</div>';
        document.getElementById('screenshot-img').src = '';
        document.getElementById('refresh-btn').classList.add('hidden');
        btn.classList.add('hidden');

        setTimeout(resetToLogin, 3000);
      } catch (err) {
        showError(err.message);
      }
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Persisting State Demo running at http://localhost:${PORT}`);
});
