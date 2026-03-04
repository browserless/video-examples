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
const PORT = process.env.PORT || 3000;

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

const RECONNECT_TIMEOUT_LOGIN = 60000; // 60s for 2FA entry (account max)
const RECONNECT_TIMEOUT_REFRESH = 60000; // 60s for screenshot refreshes (account max)

const app = express();
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  let browser;
  try {
    const queryParams = new URLSearchParams({
      token: TOKEN,
      timeout: "300000",
      headless: "false",
    }).toString();

    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://${ENDPOINT}?${queryParams}`,
    });

    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1280, height: 900 });

    console.log("Navigating to ProtonMail login...");
    await page.goto("https://account.proton.me/mail", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Entering credentials...");
    await page.waitForSelector(SELECTORS.username, { timeout: 15000 });
    await page.type(SELECTORS.username, username, { delay: 50 });

    await page.waitForSelector(SELECTORS.password, { timeout: 15000 });
    await page.type(SELECTORS.password, password, { delay: 50 });

    console.log("Clicking submit...");
    await page.waitForSelector(SELECTORS.submit, { timeout: 15000 });
    await page.click(SELECTORS.submit);

    console.log("Waiting for 2FA page...");
    await page.waitForSelector(SELECTORS.twoFAHeader, { timeout: 30000 });
    console.log("2FA page detected!");

    // Prepare reconnection
    const cdp = await page.createCDPSession();
    const { error, browserWSEndpoint } = await cdp.send(
      "Browserless.reconnect",
      { timeout: RECONNECT_TIMEOUT_LOGIN }
    );

    if (error) throw new Error(error);

    console.log("Reconnect endpoint created, disconnecting...");
    browser.disconnect();

    res.json({ browserWSEndpoint });
  } catch (err) {
    console.error("Login error:", err.message);
    if (browser) {
      try {
        browser.disconnect();
      } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/submit-2fa", async (req, res) => {
  const { code, browserWSEndpoint } = req.body;
  if (!code || !browserWSEndpoint) {
    return res
      .status(400)
      .json({ error: "2FA code and browserWSEndpoint are required" });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${browserWSEndpoint}?token=${TOKEN}`,
    });

    const pages = await browser.pages();
    // Find the ProtonMail page (not about:blank)
    const page = pages.find((p) => p.url().includes("proton")) || pages[pages.length - 1];
    console.log("Reconnected to page:", page.url());

    console.log("Entering 2FA code...");
    await page.waitForSelector(SELECTORS.totpFirst, { timeout: 15000 });
    await page.click(SELECTORS.totpFirst);
    await page.keyboard.type(code, { delay: 100 });

    console.log("Waiting for inbox...");
    await page.waitForSelector(SELECTORS.inbox, { timeout: 60000 });
    console.log("Login successful!");

    const screenshotBuffer = await page.screenshot({ encoding: "base64" });

    // Prepare reconnection for refresh
    const cdp = await page.createCDPSession();
    const { error, browserWSEndpoint: newEndpoint } = await cdp.send(
      "Browserless.reconnect",
      { timeout: RECONNECT_TIMEOUT_REFRESH }
    );

    if (error) throw new Error(error);

    browser.disconnect();

    res.json({
      screenshot: screenshotBuffer,
      browserWSEndpoint: newEndpoint,
      timeout: RECONNECT_TIMEOUT_REFRESH / 1000,
    });
  } catch (err) {
    console.error("2FA error:", err.message);
    if (browser) {
      try {
        browser.disconnect();
      } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/refresh-screenshot", async (req, res) => {
  const { browserWSEndpoint } = req.body;
  if (!browserWSEndpoint) {
    return res
      .status(400)
      .json({ error: "browserWSEndpoint is required" });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${browserWSEndpoint}?token=${TOKEN}`,
    });

    const pages = await browser.pages();
    const page = pages.find((p) => p.url().includes("proton")) || pages[pages.length - 1];

    const screenshotBuffer = await page.screenshot({ encoding: "base64" });

    const cdp = await page.createCDPSession();
    const { error, browserWSEndpoint: newEndpoint } = await cdp.send(
      "Browserless.reconnect",
      { timeout: RECONNECT_TIMEOUT_REFRESH }
    );

    if (error) throw new Error(error);

    browser.disconnect();

    res.json({
      screenshot: screenshotBuffer,
      browserWSEndpoint: newEndpoint,
      timeout: RECONNECT_TIMEOUT_REFRESH / 1000,
    });
  } catch (err) {
    console.error("Refresh error:", err.message);
    if (browser) {
      try {
        browser.disconnect();
      } catch (_) {}
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/logout", async (req, res) => {
  const { browserWSEndpoint } = req.body;
  if (!browserWSEndpoint) {
    return res.status(400).json({ error: "browserWSEndpoint is required" });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `${browserWSEndpoint}?token=${TOKEN}`,
    });

    const pages = await browser.pages();
    const page = pages.find((p) => p.url().includes("proton")) || pages[pages.length - 1];

    console.log("Logging out...");
    await page.waitForSelector(SELECTORS.logoutAvatar, { timeout: 10000 });
    await page.click(SELECTORS.logoutAvatar);

    await page.waitForSelector(SELECTORS.logoutButton, { timeout: 10000 });
    await page.click(SELECTORS.logoutButton);

    await new Promise((r) => setTimeout(r, 2000));
    await browser.close();
    console.log("Logged out and browser closed.");

    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err.message);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
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
  <title>Standard Sessions Demo</title>
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
    input:focus { border-color: #6c63ff; }
    button {
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .btn-primary {
      background: #6c63ff;
      color: #fff;
      width: 100%;
    }
    .btn-primary:hover { background: #5a52d5; }
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
    .status.error { color: #ef5350; }
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
      color: #6c63ff;
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
  <h1>Login to protonmail with Standard Sessions</h1>
  <p class="subtitle">Browserless session management via <code>Browserless.reconnect</code> CDP command</p>
  <p class="dev-label" id="debug-info" style="margin-bottom: 16px;">Loading token info...</p>

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
        Please enter your 2FA code (6 digits) &mdash; You have <span id="twofa-countdown">50</span> seconds
      </p>
      <input type="text" id="twofa-code" placeholder="6-digit code" maxlength="6" pattern="[0-9]{6}" />
      <button class="btn-primary" id="twofa-btn" onclick="handleSubmit2FA()">Enter</button>
      <button class="try-again hidden" id="try-again-btn" onclick="resetToLogin()">Try again</button>
      <div class="dev-label">
        BrowserWSEndpoint for development purposes:<br />
        <code id="dev-endpoint"></code>
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
          Refresh screenshot &mdash; available for <span id="refresh-countdown">300</span>s
        </button>
        <button class="btn-danger" id="logout-btn" onclick="handleLogout()">Logout</button>
      </div>
      <div class="dev-label">
        BrowserWSEndpoint for development purposes:<br />
        <code id="dev-endpoint-refresh"></code>
      </div>
    </div>

    <!-- Error display -->
    <div id="error-display" class="hidden">
      <div class="message error" id="error-message"></div>
      <button class="btn-primary" onclick="resetToLogin()">Try again</button>
    </div>
  </div>

  <script>
    // Load debug info on page load
    fetch('/api/debug').then(r => r.json()).then(d => {
      document.getElementById('debug-info').innerHTML =
        'Token: <code>' + d.token + '</code> | Endpoint: <code>' + d.endpoint + '</code>';
    }).catch(() => {
      document.getElementById('debug-info').textContent = 'Failed to load token info';
    });

    let currentEndpoint = null;
    let twofaTimer = null;
    let refreshTimer = null;

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
      clearInterval(refreshTimer);
      currentEndpoint = null;
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('twofa-code').value = '';
      document.getElementById('twofa-btn').disabled = false;
      document.getElementById('try-again-btn').classList.add('hidden');
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

        currentEndpoint = data.browserWSEndpoint;
        document.getElementById('dev-endpoint').textContent = currentEndpoint;
        showOnly('twofa-form');

        // Start 50s countdown (60s reconnect timeout minus 10s buffer)
        twofaTimer = startCountdown('twofa-countdown', 50, () => {
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
          body: JSON.stringify({ code, browserWSEndpoint: currentEndpoint }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        currentEndpoint = data.browserWSEndpoint;
        document.getElementById('screenshot-img').src = 'data:image/png;base64,' + data.screenshot;
        document.getElementById('dev-endpoint-refresh').textContent = currentEndpoint;
        document.getElementById('screenshot-message').innerHTML = '';
        showOnly('screenshot-view');

        // Start refresh countdown
        const refreshSeconds = data.timeout;
        document.getElementById('refresh-countdown').textContent = refreshSeconds;
        refreshTimer = startCountdown('refresh-countdown', refreshSeconds, () => {
          clearInterval(refreshTimer);
          document.getElementById('refresh-btn').disabled = true;
          document.getElementById('refresh-btn').textContent = 'Session expired';
        });
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
          body: JSON.stringify({ browserWSEndpoint: currentEndpoint }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        currentEndpoint = data.browserWSEndpoint;
        document.getElementById('screenshot-img').src = 'data:image/png;base64,' + data.screenshot;
        document.getElementById('dev-endpoint-refresh').textContent = currentEndpoint;

        // Reset refresh countdown
        clearInterval(refreshTimer);
        let refreshSeconds = data.timeout;
        btn.disabled = false;
        btn.textContent = 'Refresh screenshot \\u2014 available for ' + refreshSeconds + 's';
        refreshTimer = setInterval(() => {
          refreshSeconds--;
          btn.textContent = 'Refresh screenshot \\u2014 available for ' + refreshSeconds + 's';
          if (refreshSeconds <= 0) {
            clearInterval(refreshTimer);
            btn.disabled = true;
            btn.textContent = 'Session expired';
          }
        }, 1000);
      } catch (err) {
        showError(err.message);
      }
    }

    async function handleLogout() {
      const btn = document.getElementById('logout-btn');
      btn.disabled = true;
      btn.textContent = 'Logging out...';

      try {
        const resp = await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ browserWSEndpoint: currentEndpoint }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);

        clearInterval(refreshTimer);
        document.getElementById('screenshot-message').innerHTML =
          '<div class="message success">Logged out successfully. Browser closed.</div>';
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

app.get("/api/debug", (req, res) => {
  const masked = TOKEN.length > 8
    ? TOKEN.slice(0, 4) + "..." + TOKEN.slice(-4)
    : "TOO_SHORT";
  res.json({ token: masked, endpoint: ENDPOINT });
});

app.listen(PORT, () => {
  console.log(`Standard Sessions Demo running at http://localhost:${PORT}`);
  console.log(`Token loaded: ${TOKEN.length > 8 ? TOKEN.slice(0, 4) + "..." + TOKEN.slice(-4) : "NOT SET / TOO SHORT"}`);
  console.log(`Endpoint: ${ENDPOINT}`);
});
