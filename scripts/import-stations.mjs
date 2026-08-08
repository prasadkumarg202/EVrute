#!/usr/bin/env node
/**
 * Import India-wide EV charging station data from OPEN sources.
 *
 *   node scripts/import-stations.mjs                 # OpenChargeMap, all India
 *   node scripts/import-stations.mjs --source=osm    # OpenStreetMap
 *   node scripts/import-stations.mjs --state=Telangana
 *   node scripts/import-stations.mjs --dry-run
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT DO
 *
 * It CANNOT pull from ChargeMOD, Statiq, Tata Power, Ather, Jio-bp or any
 * other commercial network. Their station data is proprietary, none of them
 * publish an open API, and scraping their apps would breach their terms.
 * Getting their live data legitimately requires an OCPI roaming agreement
 * with each operator, or joining a roaming hub — a commercial negotiation,
 * not an integration task.
 *
 * It CAN pull from open, licensed datasets. Many commercial networks' sites
 * are *listed* in these datasets because their operators or the public added
 * them, so coverage is genuinely useful — you just get location and
 * metadata, never live availability or the ability to start a charge.
 *
 *   OpenChargeMap  CC-BY-SA 4.0  — attribution required
 *   OpenStreetMap  ODbL 1.0      — attribution required
 *
 * Both licences oblige you to display attribution. The importer stores the
 * required line on every row (`stations.data_attribution`); the station page
 * renders it. Do not strip that.
 *
 * Everything imported is marked non-operable in the database. A charge can
 * never be started on it. See migration 0020.
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- config ---
function loadEnv() {
  for (const rel of ['apps/web/.env.local', 'apps/web/.env', '.env.local', '.env']) {
    try {
      const parsed = Object.fromEntries(
        readFileSync(join(root, rel), 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#') && l.includes('='))
          .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
          }),
      );
      if (parsed.NEXT_PUBLIC_SUPABASE_URL) return { ...parsed, ...process.env, _file: rel };
    } catch {
      /* try the next candidate */
    }
  }
  return { ...process.env, _file: null };
}

const env = loadEnv();
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const OCM_KEY = env.OPENCHARGEMAP_API_KEY ?? '';
const DRY_RUN = args.has('dry-run');
const SOURCE = args.get('source') ?? 'ocm';
const STATE_FILTER = args.get('state') ?? null;
const BATCH = 400;

if (!SUPABASE_URL) fail('NEXT_PUBLIC_SUPABASE_URL is not set.');
if (!SERVICE_KEY && !DRY_RUN) {
  fail(
    'SUPABASE_SERVICE_ROLE_KEY is not set. The importer writes through a\n' +
      'service-role RPC because `stations` has no INSERT grant for clients.\n' +
      'Re-run with --dry-run to preview without writing.',
  );
}

function fail(message) {
  console.error(`\n\x1b[31m${message}\x1b[0m\n`);
  process.exit(1);
}
const log = (m) => console.log(`  ${m}`);

// ------------------------------------------------------------ OpenChargeMap ---
/**
 * OCM paginates by offset. Without an API key it rate-limits aggressively —
 * a free key from openchargemap.org/site/develop makes a full India pull
 * practical. India has roughly 8–12k POIs depending on the day.
 */
async function fetchOpenChargeMap() {
  const rows = [];
  const seen = new Set();
  let offset = 0;
  const pageSize = 500;

  for (;;) {
    const params = new URLSearchParams({
      output: 'json',
      countrycode: 'IN',
      maxresults: String(pageSize),
      offset: String(offset),
      compact: 'false',
      verbose: 'false',
    });
    if (OCM_KEY) params.set('key', OCM_KEY);

    const url = `https://api.openchargemap.io/v3/poi/?${params}`;
    const response = await fetch(url, {
      headers: { 'user-agent': 'EVRute/0.1 (station import; contact: ops@evrute.in)' },
    });

    if (response.status === 403 || response.status === 401) {
      fail(
        'OpenChargeMap rejected the request (401/403).\n' +
          'Get a free API key at https://openchargemap.org/site/develop and set\n' +
          'OPENCHARGEMAP_API_KEY in apps/web/.env.local.',
      );
    }
    if (response.status === 429) {
      log('rate limited — waiting 30s');
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (!response.ok) fail(`OpenChargeMap returned HTTP ${response.status}`);

    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;

    for (const poi of page) {
      const address = poi.AddressInfo;
      if (!address?.Latitude || !address?.Longitude) continue;

      const ref = String(poi.ID);
      if (seen.has(ref)) continue;
      seen.add(ref);

      const state = address.StateOrProvince?.trim() || '';
      if (STATE_FILTER && !state.toLowerCase().includes(STATE_FILTER.toLowerCase())) continue;

      rows.push({
        external_ref: ref,
        name: (address.Title || 'Charging station').slice(0, 120),
        address_line1: [address.AddressLine1, address.AddressLine2]
          .filter(Boolean).join(', ').slice(0, 200),
        city: address.Town?.trim() || '',
        state,
        postal_code: (address.Postcode || '').replace(/\D/g, '').slice(0, 6),
        network: poi.OperatorInfo?.Title?.trim() || null,
        source_url: `https://openchargemap.org/site/poi/details/${ref}`,
        attribution: 'Station data © OpenChargeMap contributors, CC-BY-SA 4.0',
        lat: address.Latitude,
        lng: address.Longitude,
        is_24x7: /24|always/i.test(address.AccessComments || '') || true,
      });
    }

    offset += page.length;
    log(`fetched ${offset} POIs (kept ${rows.length})`);
    if (page.length < pageSize) break;

    // Be a good citizen: OCM is volunteer-funded infrastructure.
    await new Promise((r) => setTimeout(r, 1200));
  }

  return rows;
}

// ------------------------------------------------------------- OpenStreetMap ---
async function fetchOpenStreetMap() {
  // Overpass is heavily loaded; one country-wide query with a generous
  // timeout beats many small ones.
  const query = `
    [out:json][timeout:180];
    area["ISO3166-1"="IN"][admin_level=2]->.india;
    (
      node["amenity"="charging_station"](area.india);
      way["amenity"="charging_station"](area.india);
    );
    out center tags;
  `;

  log('querying Overpass (this can take a minute)…');
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'EVRute/0.1 (station import; contact: ops@evrute.in)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) fail(`Overpass returned HTTP ${response.status}`);
  const body = await response.json();

  return (body.elements ?? [])
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) return null;
      const t = el.tags ?? {};
      const state = t['addr:state'] || '';
      if (STATE_FILTER && !state.toLowerCase().includes(STATE_FILTER.toLowerCase())) return null;

      return {
        external_ref: `${el.type}/${el.id}`,
        name: (t.name || t.operator || 'Charging station').slice(0, 120),
        address_line1: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
        city: t['addr:city'] || '',
        state,
        postal_code: (t['addr:postcode'] || '').replace(/\D/g, '').slice(0, 6),
        network: t.operator || t.brand || null,
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        attribution: 'Station data © OpenStreetMap contributors, ODbL 1.0',
        lat,
        lng,
        is_24x7: t.opening_hours === '24/7',
      };
    })
    .filter(Boolean);
}

// -------------------------------------------------------------------- write ---
async function upsert(sourceEnum, rows) {
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_external_stations`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_source: sourceEnum, p_rows: chunk }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      fail(`Upsert failed at row ${i}: HTTP ${response.status} ${text.slice(0, 400)}`);
    }

    const result = await response.json();
    const row = Array.isArray(result) ? result[0] : result;
    inserted += row?.inserted ?? 0;
    updated += row?.updated ?? 0;
    log(`upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  return { inserted, updated };
}

// --------------------------------------------------------------------- main ---
console.log('\nEVRute station import\n');
log(`env file:  ${env._file ?? '(process env only)'}`);
log(`source:    ${SOURCE === 'osm' ? 'OpenStreetMap' : 'OpenChargeMap'}`);
log(`state:     ${STATE_FILTER ?? 'all India'}`);
log(`mode:      ${DRY_RUN ? 'DRY RUN (no writes)' : 'live'}`);
if (SOURCE !== 'osm' && !OCM_KEY) {
  log('\x1b[33mnote:      no OPENCHARGEMAP_API_KEY — expect heavy rate limiting\x1b[0m');
}
console.log();

const rows = SOURCE === 'osm' ? await fetchOpenStreetMap() : await fetchOpenChargeMap();
const sourceEnum = SOURCE === 'osm' ? 'openstreetmap' : 'openchargemap';

console.log(`\n  ${rows.length} stations collected`);

const byNetwork = rows.reduce((acc, r) => {
  const k = r.network ?? '(unknown operator)';
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log('\n  Top networks:');
for (const [network, count] of Object.entries(byNetwork).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(count).padStart(5)}  ${network}`);
}

if (DRY_RUN) {
  console.log('\n  Sample row:');
  console.log(JSON.stringify(rows[0], null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('\n\x1b[33m  Dry run — nothing written.\x1b[0m\n');
  process.exit(0);
}

console.log();
const { inserted, updated } = await upsert(sourceEnum, rows);

console.log(
  `\n\x1b[32m  Done.\x1b[0m ${inserted} inserted, ${updated} updated.\n` +
    '  All imported stations are marked discovery-only — a charging session\n' +
    '  cannot be started on them. Attribution is stored per row and must stay\n' +
    "  visible; it is a condition of both sources' licences.\n",
);
