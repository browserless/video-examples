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
- **Script 2 (Playwright)** → `scraping-sandbox.netlify.app/products`. A responsive page, so
  the layout visibly reflows from desktop to mobile. The auto-scale story.

## Files

- **`1-bql-os-emulation.graphql`** — the BrowserQL mutation: navigate, read back the identity
  the page sees, and screenshot the detection table.
- **`run-1-bql.sh`** — runs that mutation for one OS, prints the identity, saves the screenshot.
- **`2-playwright-baas.mjs`** — connects Playwright over CDP to the stealth endpoint and captures
  the same page twice, as Windows desktop and as an Android phone.

## Quick start

```bash
git clone https://github.com/browserless/video-examples.git
cd video-examples/os-emulation
npm install
cp .env.example .env        # then open .env and paste your BROWSERLESS_TOKEN
```

Script 1 also needs [`jq`](https://jqlang.github.io/jq/) (`brew install jq` on macOS,
`sudo apt install jq` on Linux). `curl` and `base64` already ship with macOS and Linux.

```bash
# Script 1 — BrowserQL: OS identity + clean detection signals
chmod +x run-1-bql.sh
./run-1-bql.sh windows      # try: macos | linux | android

# Script 2 — Playwright: desktop and mobile from the same code
node 2-playwright-baas.mjs
```

You don't need a local Chrome. Both scripts drive a remote browser, which is why Script 2 uses
`playwright-core` — it skips Playwright's ~1 GB browser download and installs in a couple of
seconds.

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
pw-desktop-windows platform=Win32          width=1920px  dpr=1     touch=0
pw-mobile-android  platform=Linux armv8l   width= 412px  dpr=2.625 touch=5
```

Same URL, same code, one word different. The desktop capture is a four-column product grid; the
Android capture is a single stacked column with a collapsed header. The viewport, pixel ratio,
and touch points were never set by hand.

Exact device metrics vary between runs, because Browserless rotates through a pool of real
device profiles rather than reusing one hardcoded fake phone. Android widths of 360, 384, 412,
and 448 with matching pixel ratios are all normal.

## Notes

- **Lowercase only.** A capital `Windows` returns HTTP 400. Invalid values are rejected, not
  silently ignored.
- **Stealth routes only.** `emulationOs` is accepted on `/chromium/bql` and `/chromium/stealth`.
  Plain `/chromium` and the REST APIs return 400.
- **Use the provisioned page.** Script 2 reads `contexts()[0].pages()[0]` rather than calling
  `newPage()`, because the device metrics are applied to the page Browserless already opened.
- **Android on Script 1.** sannysoft is a very tall page, and a full-page screenshot at an
  Android viewport can bump the 30s cap. Desktop OSes are the reliable pick there; Android is
  Script 2's job.
- **What it does not change:** timezone, locale and `Accept-Language`, WebRTC, or the TCP/IP
  network stack. Pair it with a region-matched or mobile proxy when you need those to agree too.

## Requirements

- Node 18 or newer (Script 2)
- `jq` (Script 1)
- A [Browserless](https://browserless.io) API token
