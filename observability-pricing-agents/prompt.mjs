export const buildPrompt = (vendor) => `You are researching the publicly published pricing of ONE observability vendor: ${vendor}.

Price this exact scenario, in USD, for a US-based customer, billed monthly:
- 20 engineers who need full access
- 50 monitored hosts
- 100 GB of LOG DATA ingested per month
- 30-day log retention

RESEARCH PROCESS
1. Start at ${vendor}'s official pricing page.
2. Identify the cheapest publicly priced plan that supports the scenario.
3. Calculate the total monthly cost using only pricing and billing definitions published by ${vendor}.
4. If ${vendor} does not price logs directly by GB, use its official docs or official pricing calculator to determine the billing unit and whether a defensible conversion is possible.
5. Determine the monthly cost if log ingest increases from 100 GB to 200 GB, or identify the applicable published overage rate.
6. Determine whether SSO/SAML is included in the selected plan. If not, identify the cheapest plan that includes it and its public price, if available.

RULES
- Use ONLY first-party pages published by ${vendor}.
- Do not use third-party comparison sites, search-result snippets as evidence, or prices from memory.
- Do not estimate or infer unpublished prices.
- Every numeric pricing claim must be backed by a first-party source URL.
- If information is not publicly available, return null and explain why in notes.
- If the vendor's billing unit cannot be reliably converted from 100 GB of logs using a definition published by the vendor, return null rather than assuming a conversion.
- In conversion_notes, state the billing unit, its published definition, and the arithmetic used.
- Distinguish log ingestion from metrics, traces, spans, events, or other telemetry. Do not substitute another telemetry type for logs.
- Decline cookie banners rather than accepting them.
- Stop once every field has either been answered or established as unavailable.

Return ONLY valid JSON matching this shape, with no markdown fences:
{
  "vendor": "${vendor}",
  "plan": null,
  "monthly_cost_100gb_usd": null,
  "monthly_cost_200gb_usd": null,
  "overage_rate": null,
  "billing_unit": null,
  "conversion_notes": null,
  "sso_saml_included": null,
  "cheapest_sso_plan": null,
  "cheapest_sso_plan_monthly_cost_usd": null,
  "pricing_sources": [{ "url": "", "supports": "" }],
  "notes": null
}`;
