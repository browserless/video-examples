# Browserless · OS Emulation

One parameter — `emulationOs` — makes a Browserless browser present a fully coherent OS
identity: user agent, UA client hints, `navigator.platform`, WebGL/GPU **and its graphics
API**, CPU cores, fonts, voices, and audio latency. On mobile values you also get that
device's viewport, pixel ratio, and touch points.

Values (lowercase only): `windows` · `macos` · `linux` · `android`

Only works on **stealth routes** — `/*/bql`, `/stealth`, `/chromium/stealth`. Plain routes
and the REST APIs reject it.

Three scripts, each showing the beat it demonstrates best:

- **Script 1 (BrowserQL)** → `bot.sannysoft.com`. Proves the OS identity is coherent and that
  every bot-detection check comes back green. The anti-detection story.
- **Script 2 (BAP)** → `scraping-sandbox.netlify.app/products`. A responsive page, so
  the layout visibly reflows from desktop to mobile. The auto-scale story.
- **Script 3 (Playwright)** → the same page as script 2, over CDP instead. The same result
  through a library you may already be using.

### What is BAP?

**BAP** (Browser Automation Protocol) is Browserless's own automation protocol. Rather than
speaking CDP to a remote Chrome, the SDK speaks BrowserQL over a single WebSocket and hands you
a familiar Puppeteer-shaped API — `newPage`, `goto`, `evaluate`, `screenshot`.

It's the natural fit for this example because **BAP only connects to `/bql` endpoints, and those
are stealth routes**. `emulationOs` is rejected on plain CDP routes like `/chromium`, so driving
this over CDP means remembering to pick the stealth endpoint yourself. With BAP you're on a
stealth route by construction — there's no non-stealth route to get wrong.

## Files

- **`1-bql-os-emulation.graphql`** — the BrowserQL mutation: navigate, read back the identity
  the page sees, and screenshot the detection table.
- **`run-1-bql.sh`** — runs that mutation for one OS, prints the identity, saves the screenshot.
- **`2-bap-os-emulation.mjs`** — connects the BAP SDK to the stealth `/bql` endpoint and captures
  the same page twice, as Windows desktop and as an Android phone.
- **`3-playwright-baas.mjs`** — the same capture over CDP with Playwright. Its header carries the
  BAP equivalent of the connect-and-capture, so you can switch without opening another file.

## Quick start

```bash
git clone https://github.com/browserless/video-examples.git
cd video-examples/os-emulation
npm install
cp .env.example .env        # then open .env and paste your BROWSERLESS_TOKEN
```

Script 1 is a bash script and also needs [`jq`](https://jqlang.github.io/jq/)
(`brew install jq` on macOS, `sudo apt install jq` on Linux). `curl` and `base64` already ship
with macOS and Linux.

To point either script at a different region or a self-hosted instance, set `BROWSERLESS_BASE`
in `.env` — an https URL, which the BAP script converts to wss itself.

```bash
# Script 1 — BrowserQL: OS identity + clean detection signals
./run-1-bql.sh windows      # try: macos | linux | android

# Script 2 — BAP: desktop and mobile from the same code
node 2-bap-os-emulation.mjs

# Script 3 — the same thing over CDP, if you'd rather drive it with Playwright
node 3-playwright-baas.mjs
```

You don't need a local Chrome. Every script drives a remote browser: the BAP SDK
(`@browserless.io/bap-ts`) is a thin WebSocket client, and script 3 uses `playwright-core`, which
skips Playwright's ~1 GB browser download. Both install in a couple of seconds.

### BAP or Playwright?

Reach for **BAP** by default. It only connects to `/bql`, so you land on a stealth route by
construction, and it drops the CDP handshake for a single WebSocket.

Reach for **Playwright** (script 3) when you already have Playwright code, or you need an API BAP
doesn't cover. Just remember the trap the CDP route brings with it: `emulationOs` is rejected on
plain `/chromium`, so you have to pick `/chromium/stealth` yourself.

## What you should see

**Script 1** prints the identity the page actually observed. The GPU line is the part worth
watching, because it changes with the OS rather than just the user agent:

| `emulationOs` | `navigator.platform` | Graphics API in the GPU string |
|---|---|---|
| `windows` | `Win32` | **Direct3D11** — e.g. `ANGLE (NVIDIA GeForce RTX 4060 Direct3D11 …)` |
| `macos` | `MacIntel` | **Metal** — e.g. `ANGLE (Intel Inc., ANGLE Metal Renderer: …)` |
| `linux` | `Linux x86_64` | **OpenGL** — e.g. `ANGLE (Mesa Intel UHD Graphics 770, OpenGL 4.6)` |

The graphics API is the part that's pinned to the OS. The specific card rotates between runs —
on `windows` you'll see NVIDIA, Intel, and AMD cards on different sessions — because each
session picks from a pool of real hardware profiles rather than reusing one fixed identity.
Whichever card comes up, the API always matches the OS.

A user agent claiming macOS while the GPU reports Direct3D11 is exactly the mismatch detectors
look for. Here the whole stack moves together.

It also saves `bql-<os>.png`. Open it and the Intoli table at the top is fully green: WebDriver
missing, Chrome present, Plugins Length 5, WebGL vendor and renderer consistent with the claimed
OS. Further down, the Canvas rows report the same fingerprint hash across all five contexts —
including the sandboxed iframes — and that hash changes when you switch OS, because a different
GPU and font stack rasterizes differently.

**Scripts 2 and 3** each print one line per device and save a screenshot of each. Script 2:

```
bap-desktop-windows platform=Win32          width=2048px  dpr=1.25   touch=0
bap-mobile-android  platform=Linux armv8l   width= 384px  dpr=3.75   touch=5
```

Script 3 prints the same shape with a `pw-` prefix, and writes `pw-*.png` — so you can run both
and compare the captures side by side.

Same URL, same code, one word different. The desktop capture is a four-column product grid; the
Android capture is a single stacked column with a collapsed header. The viewport, pixel ratio,
and touch points were never set by hand.

Exact device metrics vary between runs, because Browserless rotates through a pool of real
device profiles rather than reusing one hardcoded fake phone. Android widths of 360, 384, 412,
and 448 with matching pixel ratios are all normal.

## Notes

- **Lowercase only.** `run-1-bql.sh` checks the value before it sends anything, so a capital
  `Windows` fails instantly. Send one anyway and the API returns HTTP 400 — invalid values are
  rejected, not silently ignored, so a typo can never leave you with a browser that quietly
  isn't emulating anything.
- **Stealth routes only.** `emulationOs` is accepted on `/chromium/bql` and `/chromium/stealth`.
  Plain `/chromium` and the REST APIs return 400.
- **`newPage()` is what provisions the session.** `Browserless.connect()` opens no socket; the
  WebSocket opens on `newPage()`, so the emulated device metrics are already applied to the page
  it hands back. The SDK appends `&token=` when the endpoint already carries a query string,
  which is why `emulationOs` can live directly in the endpoint URL.
- **Use the provisioned page (script 3).** Playwright reads `contexts()[0].pages()[0]` rather
  than calling `newPage()`, because the device metrics are applied to the page Browserless already
  opened. BAP has no such trap — its `newPage()` is what provisions the session.
- **Lazy images.** The sandbox lazy-loads its product images, so the ones below the fold never
  enter the viewport and never finish loading — at a narrow mobile width, a wait-for-all-images
  can never complete. Script 2 bounds `waitForImages` and falls back to an immediate capture;
  script 3 lets its `waitForFunction` time out and carries on.
- **Android on Script 1.** sannysoft is a very tall page, and a full-page screenshot at an
  Android viewport can bump the 30s cap. Desktop OSes are the reliable pick there; Android is
  the job of scripts 2 and 3.
- **What it does not change:** timezone, locale and `Accept-Language`, WebRTC, or the TCP/IP
  network stack. Pair it with a region-matched or mobile proxy when you need those to agree too.

## Requirements

- Node 18 or newer (Scripts 2 and 3)
- bash and `jq` (Script 1)
- A [Browserless](https://browserless.io) API token
