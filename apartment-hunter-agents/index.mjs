import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPrompt, CRITERIA, RESPONSE_SCHEMA } from './prompt.mjs';

// Each site starts on its own rental search for the city, so the agent doesn't wander the web.
const ALL_SITES = [
  { name: 'Apartments.com', startUrl: 'https://www.apartments.com/austin-tx/1-bedrooms-under-1800/' },
  { name: 'Zillow', startUrl: 'https://www.zillow.com/austin-tx/rentals/' },
  { name: 'Zumper', startUrl: 'https://www.zumper.com/apartments-for-rent/austin-tx' },
  { name: 'HotPads', startUrl: 'https://hotpads.com/austin-tx/apartments-for-rent' },
  { name: 'Craigslist', startUrl: 'https://austin.craigslist.org/search/apa?min_bedrooms=1&max_bedrooms=1&max_price=1800&pets_dog=1&laundry=1' },
];

const SITES = process.env.SITES
  ? process.env.SITES.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
    .map((name) => ALL_SITES.find((site) => site.name.toLowerCase() === name) || exit(`Unknown site: ${name}`))
  : ALL_SITES;

const TOKEN = process.env.BROWSERLESS_TOKEN;
const BASE_URL = (process.env.BROWSERLESS_BASE_URL || 'https://production-sfo.browserless.io').replace(/\/$/, '');
const POLL_MS = Number(process.env.POLL_MS || 2500);
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 900000);
const MAX_STEPS = Number(process.env.MAX_STEPS || 45);
// Record each run as a Session Replay (paid plans only). Set REPLAY=false to turn it off.
const REPLAY = process.env.REPLAY !== 'false';
// Run the sites one after another instead of all at once, to time the difference.
const SEQUENTIAL = process.env.SEQUENTIAL === 'true';

function exit(message) {
  console.error(message);
  process.exit(1);
}

if (!TOKEN) {
  exit('Missing BROWSERLESS_TOKEN.\nRun: BROWSERLESS_TOKEN=your_token npm start');
}

const runs = new Map(SITES.map(({ name }) => [name, {
  site: name,
  id: null,
  status: 'waiting',
  steps: [],
  result: null,
  error: null,
  replayError: null,
}]));

const TERMINAL = ['succeeded', 'failed', 'timed_out', 'stopped'];
const startedAt = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const endpoint = (path) => `${BASE_URL}${path}?token=${encodeURIComponent(TOKEN)}`;
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(0)}s`;

function truncate(value, length = 52) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function money(value) {
  return typeof value === 'number' ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
}

function render() {
  console.clear();
  console.log(`APARTMENT HUNT — ${runs.size} BROWSER AGENTS ${SEQUENTIAL ? 'ONE AT A TIME' : 'IN PARALLEL'}`);
  console.log(`Search: ${CRITERIA.bedrooms} bed · ${CRITERIA.city} · under ${money(CRITERIA.maxRent)} · dogs OK · in-unit laundry · move in by ${CRITERIA.moveInBy}\n`);
  console.log(`${'SITE'.padEnd(16)} ${'STATUS'.padEnd(11)} ${'FOUND'.padStart(5)}  LATEST STEP`);
  console.log('─'.repeat(100));

  for (const run of runs.values()) {
    const latestStep = run.steps.at(-1) || run.error || '';
    const found = Array.isArray(run.result?.listings) ? String(run.result.listings.length) : '';
    console.log(`${run.site.padEnd(16)} ${run.status.padEnd(11)} ${found.padStart(5)}  ${truncate(latestStep)}`);
  }

  const complete = [...runs.values()].filter((run) => TERMINAL.includes(run.status)).length;
  console.log(`\n${complete}/${runs.size} runs finished · ${elapsed()}`);

  const unrecorded = [...runs.values()].filter((run) => run.replayError);
  if (unrecorded.length) {
    console.log(`Not recorded: ${unrecorded.map((run) => run.site).join(', ')}`);
  }
}

async function createRun({ name, startUrl }) {
  const run = runs.get(name);
  run.status = 'submitting';
  render();

  const response = await fetch(endpoint('/agent/run'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: buildPrompt(name),
      startUrl,
      responseSchema: RESPONSE_SCHEMA,
      // Rental sites use bot protection, so browse like a normal US visitor.
      stealth: true,
      proxy: 'residential',
      proxyCountry: 'US',
      maxSteps: MAX_STEPS,
      timeout: TIMEOUT_MS,
      replay: REPLAY,
    }),
  });

  if (!response.ok) {
    throw new Error(`POST /agent/run returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  run.id = body.id;
  run.status = body.status || 'pending';
  render();
  return run;
}

async function pollRun(run) {
  while (!TERMINAL.includes(run.status)) {
    await sleep(POLL_MS);

    const response = await fetch(endpoint(`/agent/run/${run.id}`));
    if (!response.ok) {
      throw new Error(`GET /agent/run/${run.id} returned ${response.status}: ${await response.text()}`);
    }

    const body = await response.json();
    run.status = body.status;
    run.steps = Array.isArray(body.steps) ? body.steps : [];
    run.error = body.error || null;
    run.replayError = body.replayError || null;

    if (body.status === 'succeeded') {
      run.result = parseResult(body.data);
    }

    render();
  }
  return run;
}

function parseResult(data) {
  // responseSchema is best-effort; if it isn't applied, /agent/run returns its default `{ answer: string }`.
  if (data && typeof data === 'object' && typeof data.answer === 'string') {
    data = data.answer;
  }
  if (data && typeof data === 'object') return data;
  if (typeof data !== 'string') return data;

  const cleaned = data.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return { listings: [], notes: data };
  }
}

async function searchSite(site) {
  try {
    const run = await createRun(site);
    return await pollRun(run);
  } catch (error) {
    const run = runs.get(site.name);
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);
    render();
    return run;
  }
}

// A listing makes the shortlist only when the site supported every requirement. Unknowns (null) are left off.
function matches(listing) {
  return typeof listing.rent_usd === 'number' && listing.rent_usd <= CRITERIA.maxRent
    && listing.beds === CRITERIA.bedrooms
    && (!CRITERIA.dogsAllowed || listing.pets_allowed === true)
    && (!CRITERIA.inUnitLaundry || listing.in_unit_laundry === true)
    && /^\d{4}-\d{2}-\d{2}$/.test(listing.available_date) && listing.available_date <= CRITERIA.moveInBy
    && Boolean(listing.listing_url);
}

// The same building often shows up on several sites; keep the cheapest copy.
function addressKey(listing) {
  return (listing.address || listing.listing_url).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildShortlist() {
  const all = [...runs.values()].flatMap((run) =>
    (Array.isArray(run.result?.listings) ? run.result.listings : []).map((listing) => ({ ...listing, site: run.site })));

  const matching = all.filter(matches);
  const byAddress = new Map();
  for (const listing of matching) {
    const key = addressKey(listing);
    const existing = byAddress.get(key);
    if (!existing || listing.rent_usd < existing.rent_usd) byAddress.set(key, listing);
  }

  const shortlist = [...byAddress.values()].sort((a, b) => a.rent_usd - b.rent_usd);
  return {
    shortlist,
    checked: all.length,
    leftOff: all.length - matching.length,
    duplicates: matching.length - shortlist.length,
  };
}

function printShortlist({ shortlist, checked, leftOff, duplicates }) {
  console.log(`\n\nSHORTLIST — ${shortlist.length} apartments from ${runs.size} sites in ${elapsed()}\n`);
  console.log(`${'RENT'.padStart(7)}  ${'NAME / ADDRESS'.padEnd(44)} ${'AVAILABLE'.padEnd(11)} ${'SITE'.padEnd(15)} LINK`);
  console.log('─'.repeat(120));

  for (const listing of shortlist) {
    console.log(
      `${money(listing.rent_usd).padStart(7)}  ${truncate(listing.name || listing.address, 43).padEnd(44)} ${listing.available_date.padEnd(11)} ${listing.site.padEnd(15)} ${listing.listing_url}`,
    );
  }

  console.log(`\nChecked ${checked} listings. Left off ${leftOff} that didn't match or didn't say (null), and ${duplicates} duplicates across sites.`);
}

function saveResults(shortlist) {
  const dir = new URL('./results/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new URL(`apartments-${stamp}.json`, dir);
  const runResults = [...runs.values()].map(({ site, id, status, result, error, replayError }) => ({ site, id, status, result, error, replayError }));
  writeFileSync(file, JSON.stringify({ criteria: CRITERIA, elapsed: elapsed(), shortlist, runs: runResults }, null, 2));
  console.log(`\nSaved results to ${fileURLToPath(file)}`);
}

render();
if (SEQUENTIAL) {
  for (const site of SITES) await searchSite(site);
} else {
  await Promise.all(SITES.map(searchSite));
}
render();
const result = buildShortlist();
printShortlist(result);
saveResults(result.shortlist);
