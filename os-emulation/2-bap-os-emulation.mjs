// BAP — OS Emulation
//
// BAP (Browser Automation Protocol) is Browserless's own automation protocol. Instead of
// speaking CDP to a remote Chrome, the SDK speaks BrowserQL over a single WebSocket and
// gives you a familiar Puppeteer-shaped API — newPage, goto, evaluate, screenshot.
//
// It matters here for one reason: BAP only connects to `/bql` endpoints, and those are
// Browserless's STEALTH routes. `emulationOs` is rejected on plain CDP routes like
// /chromium, so with CDP you have to remember to pick the stealth endpoint. With BAP
// you're on one by construction — there is no non-stealth route to get wrong.
//
// The SAME code runs as a desktop Windows browser or a mobile Android phone —
// the viewport, DPR and touch all auto-scale from that one word.
//
// Run:
//   npm install
//   cp .env.example .env     # paste your token into .env
//   node 2-bap-os-emulation.mjs
import Browserless from '@browserless.io/bap-ts'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'

const HERE = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(HERE, '.env') }) // no-ops if .env is absent; never overrides real env vars

const TOKEN = process.env.BROWSERLESS_TOKEN
const BASE = process.env.BROWSERLESS_BASE || 'https://production-sfo.browserless.io'
const SITE = 'https://scraping-sandbox.netlify.app/products' // responsive site → the layout reflows with the emulated device

if (!TOKEN) {
  console.error('\nMissing Browserless token.')
  console.error('Copy the example env file and paste your token into it:')
  console.error('  cp .env.example .env')
  console.error('Or set it inline:')
  console.error('  BROWSERLESS_TOKEN=your_token node 2-bap-os-emulation.mjs\n')
  process.exit(1)
}

// Keep the token out of anything we print — it can surface in connection errors.
const redact = (text) => String(text).split(TOKEN).join('***')

// evaluate() takes a snippet and returns its value, same as the BQL mutation in script 1.
const PROBE = `JSON.stringify({
  platform: navigator.platform,
  width: window.innerWidth,
  dpr: window.devicePixelRatio,
  touch: navigator.maxTouchPoints
})`

async function capture(emulationOs, label) {
  // The endpoint must end in /bql — the CDP routes (/chromium, /chromium/stealth) don't speak BAP.
  // /chromium/bql here to match script 1; /stealth/bql and /chrome/bql work the same way.
  // The SDK appends `&token=` when the endpoint already carries a query string, so emulationOs
  // can live right here in the URL.
  const endpoint = `${BASE.replace(/^http/, 'ws')}/chromium/bql?emulationOs=${emulationOs}`

  const browser = Browserless.connect({ browserWSEndpoint: endpoint, token: TOKEN })
  try {
    // connect() opens no socket. newPage() is what provisions the session, so the emulated
    // device metrics are already applied to the page it hands back.
    const page = await browser.newPage()
    await page.goto(SITE, { waitUntil: 'load' })

    const info = JSON.parse(await page.evaluate(PROBE))
    console.log(
      `${label.padEnd(19)} platform=${info.platform.padEnd(14)} ` +
        `width=${String(info.width).padStart(4)}px  dpr=${info.dpr}  touch=${info.touch}`
    )

    // waitForImages is built into the screenshot call, but this page lazy-loads its product
    // images: the ones below the fold never enter the viewport, so on a narrow mobile layout
    // the wait can never finish. Bound it and fall back — a slow image shouldn't cost us the
    // capture. On desktop the grid is above the fold and the first call succeeds.
    const shot = { path: join(HERE, `${label}.png`), type: 'png' }
    try {
      await page.screenshot({ ...shot, waitForImages: true, timeout: 10_000 })
    } catch {
      await page.screenshot(shot)
    }
  } finally {
    await browser.close() // closes every page and its socket, freeing account concurrency
  }
}

// Same code, two devices — nothing changes but the emulationOs value.
// Each runs independently, so a failure on one still leaves you the other.
let failed = false
for (const [emulationOs, label] of [
  ['windows', 'bap-desktop-windows'],
  ['android', 'bap-mobile-android'],
]) {
  try {
    await capture(emulationOs, label)
  } catch (err) {
    failed = true
    console.error(`${label} failed: ${redact(err.message)}`)
  }
}

if (failed) process.exit(1)
