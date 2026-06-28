#!/usr/bin/env node
/**
 * Geocodes restaurants in newrestaurants/ JSON files using Google Maps Geocoding API.
 * Overwrites lat/lng in-place with precise coordinates.
 *
 * Usage (from hotels-beta/):
 *   GOOGLE_MAPS_API_KEY=... node scripts/restaurants/geocode-new-restaurants.mjs
 *   GOOGLE_MAPS_API_KEY=... node scripts/restaurants/geocode-new-restaurants.mjs --only Melbourne
 *   GOOGLE_MAPS_API_KEY=... node scripts/restaurants/geocode-new-restaurants.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, 'newrestaurants');

const CITIES = [
  { label: 'Melbourne',       file: 'oltra_melbourne_restaurants.json' },
  { label: 'Auckland',        file: 'oltra_auckland_restaurants_final.json' },
  { label: 'Brussels',        file: 'oltra_brussels_restaurants.json' },
  { label: 'Munich',          file: 'oltra_munich_restaurants.json' },
  { label: 'Hamburg',         file: 'oltra_hamburg_restaurants.json' },
  { label: 'Frankfurt',       file: 'oltra_frankfurt_restaurants.json' },
  { label: 'Nice',            file: 'oltra_nice_restaurants.json' },
  { label: 'Cannes',          file: 'oltra_cannes_restaurants.json' },
  { label: 'Monaco',          file: 'oltra_monaco_restaurants.json' },
  { label: 'Marseille',       file: 'oltra_marseille_restaurants.json' },
  { label: 'Edinburgh',       file: 'oltra_edinburgh_restaurants.json' },
  { label: 'Las Vegas',       file: 'oltra_las_vegas_restaurants.json' },
  { label: 'Marrakech',       file: 'oltra_marrakech_restaurants.json' },
  { label: 'Helsinki',        file: 'oltra_helsinki_restaurants.json' },
  { label: 'Oslo',            file: 'oltra_oslo_restaurants.json' },
  { label: 'Budapest',        file: 'oltra_budapest_restaurants.json' },
  { label: 'Saint-Tropez',    file: 'oltra_saint_tropez_ramatuelle_restaurants.json' },
  { label: 'Jakarta',         file: 'oltra_jakarta_restaurants.json' },
  { label: 'Kuala Lumpur',    file: 'oltra_kuala_lumpur_restaurants.json' },
  { label: 'Forte dei Marmi', file: 'oltra_forte_dei_marmi_restaurants.json' },
  { label: 'Abu Dhabi',       file: 'abu_dhabi_restaurants.json' },
  { label: 'Athens',          file: 'athens_restaurants.json' },
  { label: 'Berlin',          file: 'berlin_restaurants.json' },
  { label: 'Buenos Aires',    file: 'buenos_aires_restaurants.json' },
  { label: 'Cape Town',       file: 'cape_town_restaurants.json' },
  { label: 'Chicago',         file: 'chicago_restaurants.json' },
  { label: 'Doha',            file: 'doha_restaurants.json' },
  { label: 'Dubai',           file: 'dubai_restaurants.json' },
  { label: 'Istanbul',        file: 'istanbul_restaurants.json' },
  { label: 'Kyoto',           file: 'kyoto_restaurants.json' },
  { label: 'Lima',            file: 'lima_restaurants.json' },
  { label: 'Mexico City',     file: 'mexico_city_restaurants.json' },
  { label: 'Osaka',           file: 'osaka_restaurants.json' },
  { label: 'Rio de Janeiro',  file: 'rio_de_janeiro_restaurants.json' },
  { label: 'San Francisco',   file: 'san_francisco_restaurants.json' },
  { label: 'Santiago',        file: 'santiago_restaurants.json' },
  { label: 'São Paulo',       file: 'sao_paulo_restaurants.json' },
  { label: 'Toronto',         file: 'toronto_restaurants.json' },
  { label: 'Vancouver',       file: 'vancouver_restaurants.json' },
  { label: 'New York',        file: 'new_york_restaurants.json' },
];

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_IDX = process.argv.indexOf('--only');
const ONLY_LABEL = ONLY_IDX !== -1 ? process.argv[ONLY_IDX + 1] : null;

async function geocode(name, localArea, city, country) {
  const query = [name, localArea, city, country].filter(Boolean).join(', ');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.results.length > 0) {
    const { lat, lng } = data.results[0].geometry.location;
    // Round to 5 d.p. (~1m precision) — matches restaurants.lat/lng numeric(10,5)
    return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processCity(cityInfo) {
  const filePath = path.join(BASE_DIR, cityInfo.file);
  if (!fs.existsSync(filePath)) {
    console.error(`  FILE NOT FOUND: ${filePath}`);
    return { total: 0, updated: 0, failed: 0 };
  }

  const restaurants = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let updated = 0, failed = 0;

  for (const r of restaurants) {
    const coords = await geocode(r.restaurant_name, r.local_area, r.city, r.country);
    await sleep(120); // ~8 req/s — well within the 50 req/s Maps limit

    if (!coords) {
      console.log(`  [${r.rank}] FAILED  ${r.restaurant_name}`);
      failed++;
      continue;
    }

    const changed = r.lat !== coords.lat || r.lng !== coords.lng;
    if (changed) {
      console.log(`  [${r.rank}] ${r.restaurant_name}`);
      console.log(`         (${r.lat}, ${r.lng}) → (${coords.lat}, ${coords.lng})`);
    }

    if (!DRY_RUN) {
      r.lat = coords.lat;
      r.lng = coords.lng;
    }
    if (changed) updated++;
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, JSON.stringify(restaurants));
  }

  return { total: restaurants.length, updated, failed };
}

async function main() {
  if (!API_KEY) { console.error('GOOGLE_MAPS_API_KEY not set'); process.exit(1); }
  if (DRY_RUN) console.log('DRY RUN — no files will be written\n');

  const citiesToRun = ONLY_LABEL
    ? CITIES.filter(c => c.label.toLowerCase().includes(ONLY_LABEL.toLowerCase()))
    : CITIES;

  if (citiesToRun.length === 0) { console.error(`No city matched: ${ONLY_LABEL}`); process.exit(1); }

  let totalRestaurants = 0, totalUpdated = 0, totalFailed = 0;

  for (const cityInfo of citiesToRun) {
    console.log(`\n── ${cityInfo.label} (${cityInfo.file})`);
    const { total, updated, failed } = await processCity(cityInfo);
    totalRestaurants += total;
    totalUpdated += updated;
    totalFailed += failed;
    console.log(`   ${total} restaurants · ${updated} coords changed · ${failed} failed`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Total: ${totalRestaurants} restaurants · ${totalUpdated} updated · ${totalFailed} failed`);
  if (DRY_RUN) console.log('(dry run — no files written)');
}

main().catch(err => { console.error(err); process.exit(1); });
