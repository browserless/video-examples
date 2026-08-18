// Newsletter scraper, Playwright approach.
//
// The simple one. For each source it connects over CDP to the Browserless stealth
// endpoint, scrapes the four fields (title, url, publishedDate, excerpt), and closes the
// session straight away. Sessions run in parallel with a hard cap of 9 at once, since
// going over the account concurrency returns 429. Output goes to results-playwright.json.
//
// Run it with:
//   BROWSERLESS_TOKEN=... BROWSERLESS_BASE=https://production-sfo.browserless.io node scrape.js

import { chromium } from 'playwright-core'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const WINDOW_DAYS = 7
const MAX_PARALLEL = 9
const NAV_TIMEOUT = 30000
const SELECTOR_TIMEOUT = 15000

const TOKEN = process.env.BROWSERLESS_TOKEN
const BASE = process.env.BROWSERLESS_BASE

if (!TOKEN || !BASE) {
  console.error('\nMissing Browserless connection details.')
  console.error('Set both environment variables and try again:')
  console.error('  export BROWSERLESS_TOKEN=your_token')
  console.error('  export BROWSERLESS_BASE=https://production-sfo.browserless.io\n')
  process.exit(1)
}

const WS_BASE = BASE.replace(/^https?/, 'wss')

// Build the stealth CDP endpoint. Residential is added only for a source that asks for it.
function endpoint(source) {
  const params = new URLSearchParams({ token: TOKEN })
  if (source.proxy === 'residential') {
    params.set('proxy', 'residential')
    params.set('proxySticky', 'true')
  }
  return `${WS_BASE}/chromium/stealth?${params.toString()}`
}

// Playwright names its wait states in lower case, so map the config values across.
function waitState(source) {
  const raw = source.waitUntil || 'domContentLoaded'
  if (raw === 'networkIdle') return 'networkidle'
  if (raw === 'load') return 'load'
  return 'domcontentloaded'
}

// Normalize whatever raw date string a card gave us into an ISO string, or null.
function toIso(raw, strategy) {
  if (!raw) return null
  const text = String(raw).trim()

  if (strategy === 'text') {
    const phrase = text.match(/([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/)
    const parsed = Date.parse(phrase ? phrase[1] : text)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }

  if (strategy === 'urlpath') {
    const parts = text.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//)
    if (!parts) return null
    const parsed = Date.parse(`${parts[1]}-${parts[2]}-${parts[3]}T12:00:00Z`)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }

  if (strategy === 'relative') {
    const m = text.match(/(\d+)\s*(m|min|minute|h|hour|d|day|w|week)/i)
    if (!m) {
      const parsed = Date.parse(text)
      return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
    }
    const value = Number(m[1])
    const unit = m[2].toLowerCase()
    let ms = value * 60000
    if (unit.startsWith('h')) ms = value * 3600000
    else if (unit.startsWith('d')) ms = value * 86400000
    else if (unit.startsWith('w')) ms = value * 604800000
    return new Date(Date.now() - ms).toISOString()
  }

  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function withinWindow(iso) {
  if (!iso) return false
  return new Date(iso).getTime() >= Date.now() - WINDOW_DAYS * 86400000
}

function toAbsolute(href, pageUrl) {
  if (!href) return null
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

// Scrape one source on its own stealth session, then close it no matter what happens.
async function scrapeSource(source) {
  const started = Date.now()
  console.log(`[playwright] ${source.name} (${source.difficulty}) start, proxy=${source.proxy || 'none'}`)

  let browser
  try {
    browser = await chromium.connectOverCDP(endpoint(source), { timeout: NAV_TIMEOUT })
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(SELECTOR_TIMEOUT)

    // A slow site may not reach the wait state before the navigation timeout. That is not
    // fatal here, the DOM is usually in place, so we swallow only the timeout and let the
    // waitForSelector below decide whether the page is actually usable.
    let status = null
    try {
      const response = await page.goto(source.url, { waitUntil: waitState(source), timeout: NAV_TIMEOUT })
      status = response ? response.status() : null
    } catch (err) {
      if (!/Timeout/i.test(err.message)) throw err
    }

    await page.waitForSelector(source.listSelector, { timeout: SELECTOR_TIMEOUT })
    await page.waitForSelector(source.fields.title.selector, { timeout: SELECTOR_TIMEOUT }).catch(() => {})

    const rows = await page.evaluate(
      ([listSelector, fields]) => {
        const pick = (card, field) => {
          if (!field || !field.selector) return null
          const el = card.querySelector(field.selector)
          if (!el) return null
          if (field.attribute) return el.getAttribute(field.attribute)
          return (el.textContent || '').replace(/\s+/g, ' ').trim()
        }
        return Array.from(document.querySelectorAll(listSelector)).map((card) => ({
          title: pick(card, fields.title),
          url: pick(card, fields.url),
          rawDate: pick(card, fields.date),
          excerpt: pick(card, fields.excerpt)
        }))
      },
      [source.listSelector, source.fields]
    )

    // Clean, normalize dates, drop rows missing a title or link, de-duplicate by URL.
    const seen = new Set()
    const cleaned = []
    for (const row of rows) {
      const url = toAbsolute(row.url, source.url)
      const title = row.title ? row.title.trim() : null
      if (!title || !url || seen.has(url)) continue
      seen.add(url)
      cleaned.push({
        title,
        url,
        publishedDate: toIso(row.rawDate, source.fields.date.strategy),
        excerpt: row.excerpt ? row.excerpt.trim() : null
      })
    }

    const recent = cleaned.filter((i) => withinWindow(i.publishedDate))
    const complete = recent.filter((i) => i.title && i.url && i.publishedDate && i.excerpt).length
    const fieldCompleteness = recent.length ? Math.round((complete / recent.length) * 100) : 0
    const elapsedMs = Date.now() - started

    console.log(
      `[playwright] ${source.name} ok in ${elapsedMs}ms: ${cleaned.length} parsed, ` +
      `${recent.length} within ${WINDOW_DAYS}d, ${fieldCompleteness}% complete`
    )

    return {
      name: source.name,
      url: source.url,
      difficulty: source.difficulty,
      ok: recent.length > 0,
      status,
      error: recent.length > 0 ? null : 'zero recent items after filtering',
      elapsedMs,
      expected: source.expected,
      rawCount: cleaned.length,
      recentCount: recent.length,
      fieldCompleteness,
      items: recent
    }
  } catch (err) {
    const elapsedMs = Date.now() - started
    console.log(`[playwright] ${source.name} FAILED after ${elapsedMs}ms: ${err.message.split('\n')[0]}`)
    return {
      name: source.name,
      url: source.url,
      difficulty: source.difficulty,
      ok: false,
      status: null,
      error: err.message.split('\n')[0],
      elapsedMs,
      expected: source.expected,
      rawCount: 0,
      recentCount: 0,
      fieldCompleteness: 0,
      items: []
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

// Run the sources through a pool so at most MAX_PARALLEL sessions are open at once.
async function runPool(sources, limit) {
  const results = new Array(sources.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, sources.length) }, async () => {
    while (next < sources.length) {
      const index = next++
      results[index] = await scrapeSource(sources[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const raw = await readFile(join(HERE, 'sources.json'), 'utf8')
  const { sources } = JSON.parse(raw)

  console.log(`\n=== Playwright stealth scraper: ${sources.length} sources, up to ${MAX_PARALLEL} in parallel, ${WINDOW_DAYS} day window ===`)
  const runStarted = Date.now()

  const results = await runPool(sources, MAX_PARALLEL)

  const totalMs = Date.now() - runStarted
  const okCount = results.filter((r) => r.ok).length
  console.log(`\n[playwright] done: ${okCount}/${results.length} sources returned recent items in ${totalMs}ms`)

  const payload = {
    approach: 'playwright',
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    totalMs,
    sources: results
  }
  await writeFile(join(HERE, 'results-playwright.json'), JSON.stringify(payload, null, 2))
  console.log('[playwright] wrote results-playwright.json')
}

main().catch((err) => {
  console.error('[playwright] fatal:', err)
  process.exit(1)
})
