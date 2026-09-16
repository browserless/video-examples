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
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'

const HERE = dirname(fileURLToPath(import.meta.url))

const envPath = join(HERE, '.env')
if (existsSync(envPath)) dotenv.config({ path: envPath, override: false })

const TOKEN = process.env.BROWSERLESS_TOKEN
const BASE = process.env.BROWSERLESS_BASE || 'wss://production-sfo.browserless.io'
const SITE = 'https://scraping-sandbox.netlify.app/products' // responsive site → the layout reflows with the emulated device

if (!TOKEN) {
  console.error('\nMissing Browserless token.')
  console.error('Copy the example env file and paste your token into it:')
  console.error('  cp .env.example .env')
  console.error('Or set it inline:')
  console.error('  BROWSERLESS_TOKEN=your_token node 2-playwright-baas.mjs\n')
  process.exit(1)
}

async function capture(emulationOs, label) {
  // NOTE: stealth endpoint — emulationOs is ignored on the plain /chromium route.
  const endpoint = `${BASE}/chromium/stealth?token=${TOKEN}&emulationOs=${emulationOs}`

  const browser = await chromium.connectOverCDP(endpoint)
  try {
    // Use the page Browserless already provisioned, so the device metrics apply.
    const page = browser.contexts()[0].pages()[0]

    await page.goto(SITE, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500) // let the page settle

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
await capture('windows', 'pw-desktop-windows')
await capture('android', 'pw-mobile-android')
process.exit(0)
