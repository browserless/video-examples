# Browserless · OS Emulation

One parameter — `emulationOs` — makes a Browserless browser present a fully coherent OS
identity: user agent, UA client hints, `navigator.platform`, WebGL/GPU **and its graphics
API**, CPU cores, fonts, voices, and audio latency. On mobile values you also get that
device's viewport, pixel ratio, and touch points.

Values (lowercase only): `windows` · `macos` · `linux` · `android`

Only works on **stealth routes** — `/*/bql`, `/stealth`, `/chromium/stealth`. Plain routes
and the REST APIs reject it.

Two scripts, each showing the beat it demonstrates best:

- **Script 1 (BrowserQL)** → `bot.sannysoft.com`. Proves the OS identity is coherent and that
  every bot-detection check comes back green. The anti-detection story.
- **Script 2 (BAP)** → `scraping-sandbox.netlify.app/products`. A responsive page, so
  the layout visibly reflows from desktop to mobile. The auto-scale story.

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
```

You don't need a local Chrome. Both scripts drive a remote browser, and the BAP SDK
(`@browserless.io/bap-ts`) is a thin WebSocket client — no bundled browser, so it installs in a
couple of seconds.

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

**Script 2** prints one line per device and saves a screenshot of each:

```
bap-desktop-windows platform=Win32          width=2048px  dpr=1.25   touch=0
bap-mobile-android  platform=Linux armv8l   width= 384px  dpr=3.75   touch=5
```

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
- **Lazy images and `waitForImages`.** The sandbox lazy-loads its product images, so the ones
  below the fold never enter the viewport and `waitForImages` can never finish at a narrow mobile
  width. Script 2 bounds that wait and falls back to an immediate capture.
- **Android on Script 1.** sannysoft is a very tall page, and a full-page screenshot at an
  Android viewport can bump the 30s cap. Desktop OSes are the reliable pick there; Android is
  Script 2's job.
- **What it does not change:** timezone, locale and `Accept-Language`, WebRTC, or the TCP/IP
  network stack. Pair it with a region-matched or mobile proxy when you need those to agree too.

## Requirements

- Node 18 or newer (Script 2)
- bash and `jq` (Script 1)
- A [Browserless](https://browserless.io) API token
