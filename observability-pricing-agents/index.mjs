import { buildPrompt } from './prompt.mjs';

const VENDORS = (process.env.VENDORS || [
  'Datadog',
  'New Relic',
  'Grafana Cloud',
  'Dynatrace',
  'Splunk Observability Cloud',
  'Elastic Observability',
  'Sentry',
  'Honeycomb',
  'Better Stack',
  'Coralogix',
].join(','))
  .split(',')
  .map((vendor) => vendor.trim())
  .filter(Boolean);

const TOKEN = process.env.BROWSERLESS_TOKEN;
const BASE_URL = (process.env.BROWSERLESS_BASE_URL || 'https://production-sfo.browserless.io').replace(/\/$/, '');
const POLL_MS = Number(process.env.POLL_MS || 2500);
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 900000);

if (!TOKEN) {
  console.error('Missing BROWSERLESS_TOKEN.');
  console.error('Run: BROWSERLESS_TOKEN=your_token npm start');
  process.exit(1);
}

const runs = new Map(VENDORS.map((vendor) => [vendor, {
  vendor,
  id: null,
  status: 'waiting',
  steps: [],
  result: null,
  error: null,
}]));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const endpoint = (path) => `${BASE_URL}${path}?token=${encodeURIComponent(TOKEN)}`;

function truncate(value, length = 52) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function money(value) {
  return typeof value === 'number' ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
}

function render() {
  console.clear();
  console.log('OBSERVABILITY PRICING — 10 BROWSER AGENTS IN PARALLEL');
  console.log('Scenario: 20 engineers · 50 hosts · 100 GB logs/month · 30-day retention\n');
  console.log(`${'VENDOR'.padEnd(27)} ${'STATUS'.padEnd(11)} LATEST STEP`);
  console.log('─'.repeat(100));

  for (const run of runs.values()) {
    const latestStep = run.steps.at(-1) || run.error || '';
    console.log(`${truncate(run.vendor, 26).padEnd(27)} ${run.status.padEnd(11)} ${truncate(latestStep)}`);
  }

  const complete = [...runs.values()].filter((run) => ['succeeded', 'failed', 'timed_out', 'stopped'].includes(run.status)).length;
  console.log(`\n${complete}/${runs.size} runs finished`);
}

async function createRun(vendor) {
  const run = runs.get(vendor);
  run.status = 'submitting';
  render();

  const response = await fetch(endpoint('/agent/run'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: buildPrompt(vendor), timeout: TIMEOUT_MS }),
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
  while (!['succeeded', 'failed', 'timed_out', 'stopped'].includes(run.status)) {
    await sleep(POLL_MS);

    const response = await fetch(endpoint(`/agent/run/${run.id}`));
    if (!response.ok) {
      throw new Error(`GET /agent/run/${run.id} returned ${response.status}: ${await response.text()}`);
    }

    const body = await response.json();
    run.status = body.status;
    run.steps = Array.isArray(body.steps) ? body.steps : [];
    run.error = body.error || null;

    if (body.status === 'succeeded') {
      run.result = parseResult(body.data);
    }

    render();
  }
  return run;
}

function parseResult(data) {
  // /agent/run wraps the agent's output as a JSON string in `data.answer`.
  if (data && typeof data === 'object' && typeof data.answer === 'string') {
    data = data.answer;
  }
  if (data && typeof data === 'object') return data;
  if (typeof data !== 'string') return data;

  const cleaned = data.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    return { notes: data };
  }
}

async function researchVendor(vendor) {
  try {
    const run = await createRun(vendor);
    return await pollRun(run);
  } catch (error) {
    const run = runs.get(vendor);
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);
    render();
    return run;
  }
}

function printResults() {
  console.log('\n\nFINAL COMPARISON\n');
  console.log(`${'VENDOR'.padEnd(27)} ${'PLAN'.padEnd(24)} ${'100 GB'.padStart(12)} ${'200 GB'.padStart(12)} ${'SSO?'.padStart(8)}`);
  console.log('─'.repeat(88));

  for (const run of runs.values()) {
    const result = run.result || {};
    const sso = result.sso_saml_included === true ? 'Yes' : result.sso_saml_included === false ? 'No' : '—';
    console.log(
      `${truncate(run.vendor, 26).padEnd(27)} ${truncate(result.plan || '—', 23).padEnd(24)} ${money(result.monthly_cost_100gb_usd).padStart(12)} ${money(result.monthly_cost_200gb_usd).padStart(12)} ${sso.padStart(8)}`,
    );
  }

  console.log('\nFull JSON results:\n');
  console.log(JSON.stringify([...runs.values()].map(({ vendor, id, status, result, error }) => ({ vendor, id, status, result, error })), null, 2));
}

render();
console.log('\nLaunching every vendor at once…');
await Promise.all(VENDORS.map(researchVendor));
render();
printResults();
