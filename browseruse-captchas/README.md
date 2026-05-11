# browser-use + Browserless: Automated CAPTCHA Handling

A minimal demo showing how [browser-use](https://github.com/browser-use/browser-use)
(an LLM-powered browser agent) drives a remote [Browserless](https://browserless.io)
Chromium instance through pages that throw a CAPTCHA — entirely hands-free.

The CAPTCHA is handled by Browserless's built-in solver service, which covers
the common types you'll run into on the open web (reCAPTCHA v2 / v3,
hCaptcha, Cloudflare Turnstile, and similar). The agent's job is just to
navigate, wait for the solve, and proceed with the rest of the task.

## What you'll see

- A rich-styled terminal session showing each agent step in real time.
- A `screenshots/` folder fills up with one PNG per step (`step_01.png`,
  `step_02.png`, …) — captured straight from the agent's `BrowserStateSummary`.
- A green success panel at the end with the page's confirmation message and
  the total elapsed time.

## Prerequisites

- **Python 3.11+**
- A **Browserless** account with a token that includes the CAPTCHA solver
  add-on — get one at https://account.browserless.io
- An **OpenAI** API key — get one at https://platform.openai.com/api-keys

> Both APIs are paid services. A single run costs a few cents.

## Setup

```bash
./setup.sh
cp .env.example .env
# edit .env and fill in both keys
source .venv/bin/activate
python main.py
```

## What success looks like

1. Terminal prints a cyan banner and a magenta panel announcing screenshot capture.
2. Step-by-step lines appear: navigate → wait for CAPTCHA → ⏳ solver works →
   click Check → extract success message. Each step prints `📸 screenshots/step_NN.png`.
3. A green panel shows: **✅ CAPTCHA solved successfully!** with the page's
   confirmation text, followed by `⏱ Completed in ~30s`.
4. Open `screenshots/` to scrub through what the agent saw at each step.

## The two magic query parameters

The CDP URL passed to browser-use is:

```
wss://production-sfo.browserless.io/chromium?token=...&solveCaptchas=true&integrations=browseruse
```

| Param | What it does |
| --- | --- |
| `solveCaptchas=true` | Enables the Browserless CAPTCHA solver. When the page loads a CAPTCHA challenge, Browserless detects it and solves it server-side — no agent action required. |
| `integrations=browseruse` | Tells Browserless which client library is connecting so the session is tuned for browser-use's automation patterns (cleaner session lifecycle, better diagnostics). |

## File index

| File | Purpose |
| --- | --- |
| [main.py](main.py) | The whole demo — agent setup, step callback, run loop. |
| [setup.sh](setup.sh) | Creates `.venv` and installs deps via the venv's pip directly (sidesteps PEP 668). |
| [.env.example](.env.example) | Template for the two required keys. |
| [README.md](README.md) | This file. |

## Troubleshooting

- **`KeyError: 'BROWSERLESS_TOKEN'`** — `.env` missing or the variable is empty.
  Run `cp .env.example .env` and fill it in.
- **No screenshots saved** — `state.screenshot` is empty for that step (browser-use
  occasionally skips capture on very fast steps). Confirm at least one PNG
  appears in `screenshots/` after a few steps.
- **`error: externally-managed-environment` (PEP 668)** — you ran `pip install`
  outside the venv. Use `./setup.sh` (which calls `.venv/bin/pip` directly) or
  `source .venv/bin/activate` first.
- **Agent gives up before solving** — bump `max_steps` in `main.py` (default 15).
  Slow CAPTCHAs can need 8–12 steps just for the wait loop.
- **`Connection refused` / `Unauthorized` from Browserless** — the WebSocket
  region in `CDP_URL` (`production-sfo`) must match the region your token was
  issued for. Check your dashboard for the correct subdomain (e.g.
  `production-lon` for London) and update `CDP_URL` in `main.py`.
