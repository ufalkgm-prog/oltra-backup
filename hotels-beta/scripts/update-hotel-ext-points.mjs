#!/usr/bin/env node

/**
 * Recalculate OLTRA hotel ext_points from Directus awards + editor_rank_13.
 *
 * Usage from the OLTRA repo root:
 *   node scripts/update-hotel-ext-points.mjs --dry-run
 *   node scripts/update-hotel-ext-points.mjs --apply
 *
 * Optional:
 *   node scripts/update-hotel-ext-points.mjs --apply --env .env.local
 *   node scripts/update-hotel-ext-points.mjs --dry-run --hotel-id <directus-id-or-hotelid>
 *   node scripts/update-hotel-ext-points.mjs --dry-run --json-report ext-points-report.json
 *
 * Notes:
 * - Dry run is the default. Use --apply to patch Directus.
 * - No dependencies are required; this uses Node 18+ built-in fetch.
 * - The script accepts several common Directus env names; see getConfig().
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HOTEL_COLLECTION = 'hotels';
const EXT_POINTS_FIELD = 'ext_points';
const EDITOR_RANK_FIELD = 'editor_rank_13';

const AWARD_POINT_RULES = new Map([
  [
    'fd18110a-9764-4c20-90f4-fd149d890ead',
    { code: 'michelin3keys', badge: 'M3', name: 'Michelin 3 Keys', points: 5 },
  ],
  [
    '74a666bf-f7fb-4fff-b550-52eccfa98c4b',
    { code: 'best50', badge: '50', name: "The World's 50 Best Hotels", points: 5 },
  ],
  [
    '902c14cc-50a7-4be9-a4ee-b582afb9112e',
    { code: 'cn', badge: 'CN', name: 'Conde Nast Gold List', points: 3 },
  ],
  [
    'f8ac8e9c-397e-4e44-ba71-b1f9224e7c3f',
    { code: 'tl100', badge: 'TL', name: 'Travel + Leisure 100', points: 3 },
  ],
  [
    'cb4f80af-963d-4f09-a8aa-213718e399fb',
    { code: 'forbes5', badge: 'F5', name: 'Forbes 5 Star', points: 3 },
  ],
  [
    '32f0e878-e188-4ed1-98f8-6b22914f8f22',
    { code: 'aaa', badge: '5D', name: 'AAA/CAA Five Diamond Hotels', points: 3 },
  ],
  [
    'd292cfb3-a88f-44dd-b052-2980cfd3bac8',
    { code: 'telegraph', badge: 'T', name: 'Telegraph Best Hotels in the World', points: 3 },
  ],
]);

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: true,
    envPath: null,
    hotelId: null,
    jsonReportPath: null,
    limit: 500,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === '--dry-run') {
      args.apply = false;
      args.dryRun = true;
    } else if (arg === '--env') {
      args.envPath = argv[++i];
    } else if (arg.startsWith('--env=')) {
      args.envPath = arg.slice('--env='.length);
    } else if (arg === '--hotel-id') {
      args.hotelId = argv[++i];
    } else if (arg.startsWith('--hotel-id=')) {
      args.hotelId = arg.slice('--hotel-id='.length);
    } else if (arg === '--json-report') {
      args.jsonReportPath = argv[++i];
    } else if (arg.startsWith('--json-report=')) {
      args.jsonReportPath = arg.slice('--json-report='.length);
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg.startsWith('--limit=')) {
      args.limit = Number(arg.slice('--limit='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000.');
  }

  return args;
}

function printHelpAndExit() {
  console.log(`Recalculate OLTRA hotel ext_points from Directus awards + editor_rank_13.

Usage:
  node scripts/update-hotel-ext-points.mjs --dry-run
  node scripts/update-hotel-ext-points.mjs --apply

Options:
  --dry-run                 Preview only. This is the default.
  --apply                   Patch Directus hotel records.
  --env <path>              Env file path. Defaults to .env.local or env.local.
  --hotel-id <id>           Restrict to one Directus id or hotelid.
  --json-report <path>      Write a JSON report.
  --limit <number>          Page size, 1-1000. Default: 500.
`);
  process.exit(0);
}

function loadEnvFile(explicitPath) {
  const candidates = explicitPath
    ? [explicitPath]
    : [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), 'env.local')];

  const envFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envFile) return null;

  const source = fs.readFileSync(envFile, 'utf8');

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(rawValue);
  }

  return envFile;
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    value = value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  } else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.search(/\s#/);
    if (commentIndex !== -1) value = value.slice(0, commentIndex).trim();
  }

  return value;
}

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }

  return null;
}

function getConfig() {
  const directusUrl = firstEnv([
    'DIRECTUS_URL',
    'NEXT_PUBLIC_DIRECTUS_URL',
    'DIRECTUS_API_URL',
    'NEXT_PUBLIC_DIRECTUS_API_URL',
    'DIRECTUS_HOST',
  ]);

  const staticToken = firstEnv([
    'DIRECTUS_TOKEN',
    'DIRECTUS_API_TOKEN',
    'DIRECTUS_STATIC_TOKEN',
    'DIRECTUS_ACCESS_TOKEN',
    'DIRECTUS_ADMIN_TOKEN',
  ]);

  const email = firstEnv(['DIRECTUS_EMAIL', 'DIRECTUS_ADMIN_EMAIL']);
  const password = firstEnv(['DIRECTUS_PASSWORD', 'DIRECTUS_ADMIN_PASSWORD']);

  if (!directusUrl) {
    throw new Error(
      'Missing Directus URL. Expected one of: DIRECTUS_URL, NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_API_URL, NEXT_PUBLIC_DIRECTUS_API_URL, DIRECTUS_HOST.',
    );
  }

  if (!staticToken && (!email || !password)) {
    throw new Error(
      'Missing Directus credentials. Provide a token via DIRECTUS_TOKEN/DIRECTUS_API_TOKEN/DIRECTUS_STATIC_TOKEN, or DIRECTUS_EMAIL + DIRECTUS_PASSWORD.',
    );
  }

  return {
    directusUrl: directusUrl.replace(/\/$/, ''),
    staticToken,
    email,
    password,
  };
}

async function getAuthHeaders(config) {
  if (config.staticToken) {
    return { Authorization: `Bearer ${config.staticToken}` };
  }

  const loginResponse = await fetch(`${config.directusUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
    }),
  });

  if (!loginResponse.ok) {
    throw new Error(`Directus login failed: ${loginResponse.status} ${await loginResponse.text()}`);
  }

  const loginJson = await loginResponse.json();
  const accessToken = loginJson?.data?.access_token;

  if (!accessToken) {
    throw new Error('Directus login response did not include data.access_token.');
  }

  return { Authorization: `Bearer ${accessToken}` };
}

async function directusFetch(config, authHeaders, endpoint, options = {}) {
  const response = await fetch(`${config.directusUrl}${endpoint}`, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Directus request failed: ${response.status} ${response.statusText}\n${endpoint}\n${body}`,
    );
  }

  if (response.status === 204) return null;

  return response.json();
}

async function fetchHotels(config, authHeaders, args) {
  const hotels = [];
  let offset = 0;

  while (true) {
    const searchParams = new URLSearchParams();

    searchParams.set('limit', String(args.limit));
    searchParams.set('offset', String(offset));
    searchParams.set(
      'fields',
      [
        'id',
        'hotelid',
        'hotel_name',
        EDITOR_RANK_FIELD,
        EXT_POINTS_FIELD,
        'awards',
        'awards.*',
        'awards.*.*',
        'awards.awards_id',
        'awards.awards_id.*',
      ].join(','),
    );

    if (args.hotelId) {
      searchParams.set('filter[_or][0][id][_eq]', args.hotelId);
      searchParams.set('filter[_or][1][hotelid][_eq]', args.hotelId);
    }

    const json = await directusFetch(
      config,
      authHeaders,
      `/items/${HOTEL_COLLECTION}?${searchParams.toString()}`,
    );

    const page = Array.isArray(json?.data) ? json.data : [];
    hotels.push(...page);

    if (args.hotelId || page.length < args.limit) break;

    offset += args.limit;
  }

  return hotels;
}

async function patchHotelExtPoints(config, authHeaders, hotelId, points) {
  return directusFetch(config, authHeaders, `/items/${HOTEL_COLLECTION}/${encodeURIComponent(hotelId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      [EXT_POINTS_FIELD]: points,
    }),
  });
}

function collectKnownAwardIds(value, output = new Set()) {
  if (value == null) return output;

  if (typeof value === 'string') {
    if (AWARD_POINT_RULES.has(value)) output.add(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectKnownAwardIds(item, output);
    return output;
  }

  if (typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      collectKnownAwardIds(nestedValue, output);
    }
  }

  return output;
}

function getEditorRankPoints(rawValue) {
  const warnings = [];

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return {
      points: 0,
      badge: null,
      warnings,
    };
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue)) {
    warnings.push(`Ignoring non-numeric ${EDITOR_RANK_FIELD}: ${JSON.stringify(rawValue)}`);
    return {
      points: 0,
      badge: null,
      warnings,
    };
  }

  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 3) {
    warnings.push(
      `Ignoring out-of-range ${EDITOR_RANK_FIELD}: ${JSON.stringify(rawValue)}. Expected 1, 2, or 3.`,
    );

    return {
      points: 0,
      badge: null,
      warnings,
    };
  }

  return {
    points: numericValue,
    badge: `E${numericValue}`,
    warnings,
  };
}

function calculateHotelPoints(hotel) {
  const knownAwardIds = collectKnownAwardIds(hotel.awards);
  const matchedAwards = [];
  let total = 0;

  for (const [awardId, rule] of AWARD_POINT_RULES.entries()) {
    if (!knownAwardIds.has(awardId)) continue;

    total += rule.points;
    matchedAwards.push({
      awardId,
      ...rule,
    });
  }

  const editorRank = getEditorRankPoints(hotel[EDITOR_RANK_FIELD]);
  total += editorRank.points;

  const badges = [
    ...matchedAwards.map((award) => award.badge),
    ...(editorRank.badge ? [editorRank.badge] : []),
  ];

  return {
    total,
    matchedAwards,
    editorRankPoints: editorRank.points,
    badges,
    warnings: editorRank.warnings,
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function makeReportRow(hotel, calculation) {
  const currentExtPoints = toNumberOrNull(hotel[EXT_POINTS_FIELD]);

  return {
    id: hotel.id,
    hotelid: hotel.hotelid ?? null,
    hotel_name: hotel.hotel_name ?? null,
    current_ext_points: currentExtPoints,
    new_ext_points: calculation.total,
    changed: currentExtPoints !== calculation.total,
    editor_rank_13: hotel[EDITOR_RANK_FIELD] ?? null,
    editor_rank_points: calculation.editorRankPoints,
    badges: calculation.badges,
    award_points: calculation.matchedAwards.map((award) => ({
      code: award.code,
      badge: award.badge,
      points: award.points,
    })),
    warnings: calculation.warnings,
  };
}

function printSummary(report, args) {
  const changed = report.filter((row) => row.changed);
  const warnings = report.flatMap((row) =>
    row.warnings.map((warning) => ({
      ...row,
      warning,
    })),
  );

  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Hotels reviewed: ${report.length}`);
  console.log(`Hotels requiring update: ${changed.length}`);
  console.log(`Hotels unchanged: ${report.length - changed.length}`);

  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}`);

    for (const row of warnings.slice(0, 20)) {
      console.log(`  - ${row.hotel_name ?? row.id}: ${row.warning}`);
    }

    if (warnings.length > 20) {
      console.log(`  ...and ${warnings.length - 20} more warnings.`);
    }
  }

  if (changed.length > 0) {
    console.log('\nChanged hotels:');

    for (const row of changed) {
      const label = row.hotel_name ?? row.hotelid ?? row.id;
      const badges = row.badges.length ? ` [${row.badges.join(', ')}]` : '';

      console.log(`  - ${label}: ${row.current_ext_points ?? 'null'} -> ${row.new_ext_points}${badges}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loadedEnvFile = loadEnvFile(args.envPath);
  const config = getConfig();
  const authHeaders = await getAuthHeaders(config);

  console.log(`Directus: ${config.directusUrl}`);

  if (loadedEnvFile) {
    console.log(`Env file: ${loadedEnvFile}`);
  }

  const hotels = await fetchHotels(config, authHeaders, args);
  const report = hotels.map((hotel) => makeReportRow(hotel, calculateHotelPoints(hotel)));
  const changed = report.filter((row) => row.changed);

  printSummary(report, args);

  if (args.jsonReportPath) {
    fs.writeFileSync(args.jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nJSON report written: ${args.jsonReportPath}`);
  }

  if (args.dryRun) {
    console.log('\nNo Directus records were changed. Run with --apply to update ext_points.');
    return;
  }

  for (const row of changed) {
    await patchHotelExtPoints(config, authHeaders, row.id, row.new_ext_points);
    console.log(`Updated ${row.hotel_name ?? row.id}: ${row.current_ext_points ?? 'null'} -> ${row.new_ext_points}`);
  }

  console.log(`\nDone. Updated ${changed.length} hotel record${changed.length === 1 ? '' : 's'}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});