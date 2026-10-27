export const CRITERIA = {
  city: 'Austin, TX',
  bedrooms: 1,
  maxRent: 1800,
  dogsAllowed: true,
  inUnitLaundry: true,
  moveInBy: '2026-12-01',
};

// The shape every agent returns, whichever site it searched.
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    site: { type: 'string' },
    listings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
          rent_usd: { type: ['number', 'null'] },
          beds: { type: ['number', 'null'] },
          baths: { type: ['number', 'null'] },
          pets_allowed: { type: ['boolean', 'null'] },
          in_unit_laundry: { type: ['boolean', 'null'] },
          available_date: { type: ['string', 'null'] },
          listing_url: { type: ['string', 'null'] },
        },
        required: ['name', 'address', 'rent_usd', 'beds', 'baths', 'pets_allowed', 'in_unit_laundry', 'available_date', 'listing_url'],
      },
    },
    notes: { type: ['string', 'null'] },
  },
  required: ['site', 'listings', 'notes'],
};

export const buildPrompt = (site, criteria = CRITERIA) => `You are searching ONE rental listing site, ${site}, for apartments that match this search:
- City: ${criteria.city}
- Bedrooms: exactly ${criteria.bedrooms}
- Rent: at most $${criteria.maxRent} per month
- Dogs allowed: ${criteria.dogsAllowed ? 'required' : 'not required'}
- Washer and dryer in the unit: ${criteria.inUnitLaundry ? 'required' : 'not required'}
- Available to move in on or before ${criteria.moveInBy}

SEARCH PROCESS
1. Start on ${site}'s rental search for ${criteria.city}.
2. Use the site's own filters for bedrooms, price, pets, and laundry wherever the site offers them.
3. Read the results. Open a listing only when the results page doesn't show pets, laundry, or availability.
4. Collect up to 10 listings that match every requirement above.

RULES
- Use ONLY ${site}. Do not use other sites, search engines, or listings from memory.
- Only include a listing if what ${site} shows supports every requirement.
- If a listing doesn't say whether dogs are allowed, whether laundry is in the unit, or when it's available, set that field to null instead of guessing.
- rent_usd is the lowest monthly rent shown for a ${criteria.bedrooms}-bedroom unit, as a number.
- available_date is YYYY-MM-DD. Use today's date for "available now".
- listing_url is the direct URL of the listing on ${site}.
- Decline cookie banners rather than accepting them. Do not sign in, contact landlords, or submit any form.
- Stop once you have 10 matching listings or have checked the first page of filtered results.
- If ${site} blocks you or shows no results, return an empty listings array and explain why in notes.

Return JSON with site set to "${site}".`;
