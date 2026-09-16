// BaaS + Playwright — OS Emulation
//
// Connect Playwright to a Browserless STEALTH endpoint and add ONE query param: emulationOs.
// The SAME code runs as a desktop Windows browser or a mobile Android phone —
// the viewport, DPR and touch all auto-scale from that one word.
//
// Run:
//   npm install
//   cp .env.example .env     # paste your token into .env
//   node 2-playwright-baas.mjs
import { chromium } from 'playwright-core'
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
  console.error('  BROWSERLESS_TOKEN=your_token node 2-playwright-baas.mjs\n')
  process.exit(1)
}

// Keep the token out of anything we print — Playwright puts the endpoint in its error messages.
const redact = (text) => String(text).split(TOKEN).join('***')

async function capture(emulationOs, label) {
  // NOTE: stealth endpoint — emulationOs is ignored on the plain /chromium route.
  const endpoint = `${BASE.replace(/^http/, 'ws')}/chromium/stealth?token=${TOKEN}&emulationOs=${emulationOs}`

  const browser = await chromium.connectOverCDP(endpoint)
  try {
    // Use the page Browserless already provisioned, so the device metrics apply.
    const page = browser.contexts()[0]?.pages()[0]
    if (!page) throw new Error('no pre-provisioned page on the session — cannot apply device metrics')

    await page.goto(SITE, { waitUntil: 'load' })
    // The screenshot is the point, so wait for the product images rather than a fixed sleep.
    await page
      .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 })
      .catch(() => {}) // a slow image should not cost us the capture

    const info = await page.evaluate(() => ({
      platform: navigator.platform,
      width: window.innerWidth,
      dpr: window.devicePixelRatio,
      touch: navigator.maxTouchPoints,
    }))
    console.log(
      `${label.padEnd(18)} platform=${info.platform.padEnd(14)} ` +
        `width=${String(info.width).padStart(4)}px  dpr=${info.dpr}  touch=${info.touch}`
    )

    await page.screenshot({ path: join(HERE, `${label}.png`), fullPage: false })
  } finally {
    await browser.close()
  }
}

// Same code, two devices — nothing changes but the emulationOs value.
// Each runs independently, so a failure on one still leaves you the other.
let failed = false
for (const [emulationOs, label] of [
  ['windows', 'pw-desktop-windows'],
  ['android', 'pw-mobile-android'],
]) {
  try {
    await capture(emulationOs, label)
  } catch (err) {
    failed = true
    console.error(`${label} failed: ${redact(err.message)}`)
  }
}

if (failed) process.exit(1)
