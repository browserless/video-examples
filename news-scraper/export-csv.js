// CSV export run.
//
// This is for the CSV only workflow. On each run it:
//   1. Runs the scraper, retrying once after a short wait if the first attempt returns
//      nothing (which usually means a transient network or DNS hiccup, not real emptiness).
//   2. Only when the scrape actually produced items, archives the existing
//      output/scraped-all-items.csv into output/Previous runs/ (renamed with that file's
//      timestamp so nothing is overwritten), then writes the fresh CSV.
//   3. If the scrape produced nothing, it leaves the existing CSV untouched and exits 2, so a
//      failed run never destroys the last good file.
//
// Run it with:
//   node export-csv.js

import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRAPER = join(HERE, 'scrape.js')
const RESULTS = join(HERE, 'results-playwright.json')
const OUTPUT_DIR = join(HERE, 'output')
const CSV_PATH = join(OUTPUT_DIR, 'scraped-all-items.csv')
const ARCHIVE_DIR = join(OUTPUT_DIR, 'Previous runs')

// Load env from a local .env if present, without overriding the environment.
for (const file of ['.env.local', '.env']) {
  const path = join(HERE, file)
  if (existsSync(path)) dotenv.config({ path, override: false })
}
if (!process.env.BROWSERLESS_BASE) {
  process.env.BROWSERLESS_BASE = 'https://production-sfo.browserless.io'
}
if (!process.env.BROWSERLESS_TOKEN) {
  console.error('\nMissing BROWSERLESS_TOKEN. Set it in the environment or a local .env file, then run again.\n')
  process.exit(1)
}

// Move the current CSV into Previous runs, named with its own last modified timestamp.
async function archiveExistingCsv() {
  if (!existsSync(CSV_PATH)) {
    console.log('[export-csv] no existing CSV to archive, this looks like a first run')
    return
  }
  await mkdir(ARCHIVE_DIR, { recursive: true })
  const info = await stat(CSV_PATH)
  const stamp = new Date(info.mtimeMs).toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const archivePath = join(ARCHIVE_DIR, `scraped-all-items-${stamp}.csv`)
  await rename(CSV_PATH, archivePath)
  console.log(`[export-csv] archived previous CSV to ${archivePath}`)
}

// Run the scraper as a child process and resolve when it exits cleanly.
function runScraper() {
  return new Promise((resolve, reject) => {
    console.log(`[export-csv] running scraper: ${SCRAPER}`)
    const child = spawn('node', [SCRAPER], { cwd: HERE, env: process.env })
    child.stdout.on('data', (c) => process.stdout.write(c))
    child.stderr.on('data', (c) => process.stderr.write(c))
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`scraper exited with code ${code}`))))
  })
}

// Wrap a value for CSV: always quoted, inner quotes doubled.
function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Run the scraper once and turn its results into CSV rows. Returns the rows and a count.
async function scrapeToRows() {
  await runScraper()
  let data
  try {
    data = JSON.parse(await readFile(RESULTS, 'utf8'))
  } catch (err) {
    throw new Error(`could not read scraper results at ${RESULTS}: ${err.message}`)
  }
  const sources = Array.isArray(data.sources) ? data.sources : []
  const rows = [['source', 'publishedDate', 'title', 'url', 'excerpt']]
  let count = 0
  for (const s of sources) {
    if (!s.ok || !Array.isArray(s.items)) continue
    for (const item of s.items) {
      rows.push([s.name, item.publishedDate || '', item.title || '', item.url || '', item.excerpt || ''])
      count += 1
    }
  }
  return { rows, count }
}

async function main() {
  // Scrape first. If the whole run came back empty, that is almost always a transient
  // network or DNS problem (for example the machine had just woken up), so wait briefly and
  // try once more before giving up.
  let { rows, count } = await scrapeToRows()
  if (count === 0) {
    console.log('[export-csv] first attempt returned no items, waiting 15s and retrying once')
    await delay(15000)
    ;({ rows, count } = await scrapeToRows())
  }

  if (count === 0) {
    // Still nothing. Leave the existing CSV exactly where it is. A failed run must never
    // destroy the last good file, so we do not archive and we do not write.
    console.error('[export-csv] no items scraped this run, leaving the existing CSV untouched')
    process.exit(2)
  }

  // Only now that we have real data, preserve the previous CSV and write the new one.
  await archiveExistingCsv()
  await mkdir(OUTPUT_DIR, { recursive: true })
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  await writeFile(CSV_PATH, csv)

  console.log(`\n[export-csv] wrote ${count} items to ${CSV_PATH}`)
}

main().catch((err) => {
  console.error('[export-csv] fatal:', err.message)
  process.exit(1)
})
