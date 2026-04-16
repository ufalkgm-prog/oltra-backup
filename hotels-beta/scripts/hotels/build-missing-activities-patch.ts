#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ROOT = process.cwd();

dotenv.config({
  path: path.resolve(ROOT, ".env.local"),
});

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in .env.local");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in .env.local");

const RULES_PATH = path.resolve(ROOT, "scripts/activity_enrichment_rules.json");
const OUT_PATH = path.resolve(ROOT, "scripts/missing_activities_patch.generated.json");

const HOTEL_COLLECTION = "hotels";
const MAX_FINAL_ACTIVITIES = 7;
const MAX_FETCH_LIMIT = 200;

type SettingName = "City" | "Beachfront" | "Countryside" | "Mountains";

interface ActivityRule {
  id: string;
  name: string;
  slug: string;
  rule_note?: string;
}

interface RulesFile {
  source_file: string;
  sheet_name: string;
  settings_auto: Record<SettingName, ActivityRule[]>;
  settings_notes?: Record<string, Array<{ activity: string; note: string }>>;
  conditional_when_mentioned: ActivityRule[];
  conditional_when_michelin_restaurant_at_hotel: ActivityRule[];
  conditional_when_wildlife_reserve: ActivityRule[];
}

interface HotelSettingJunction {
  settings_id?: {
    id?: string;
    name?: string | null;
  } | string;
}

interface HotelActivityJunction {
  activities_id?: {
    id?: string;
    name?: string;
  } | string;
  id?: string;
  name?: string;
}

interface HotelRow {
  id: string | number;
  hotel_name?: string;
  name?: string;
  city?: string | null;
  country?: string | null;
  www?: string | null;
  michelin_restaurant_at_hotel?: boolean | null;
  settings?: Array<HotelSettingJunction | string> | null;
  activities?: Array<HotelActivityJunction | string> | null;
}

interface PatchRow {
  id: string | number;
  hotel_name: string;
  existing_activity_count: number;
  existing_activity_names: string[];
  suggested_auto_activity_names: string[];
  conditional_review_activity_names: string[];
  final_activity_names_if_auto_only: string[];
  review_reasons: string[];
  www: string | null;
  city: string | null;
  country: string | null;
  settings: string[];
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function directus<T>(urlPath: string): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus request failed ${res.status} ${res.statusText}\n${text}`);
  }

  return (await res.json()) as T;
}

async function fetchAllHotels(): Promise<HotelRow[]> {
  const fields = [
    "id",
    "hotel_name",
    "city",
    "country",
    "www",
    "settings.settings_id.id",
    "settings.settings_id.name",
    "activities.activities_id.id",
    "activities.activities_id.name",
  ].join(",");

  const all: HotelRow[] = [];
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({
      fields,
      page: String(page),
      limit: String(MAX_FETCH_LIMIT),
    });

    const res = await directus<{ data: HotelRow[] }>(
      `/items/${HOTEL_COLLECTION}?${qs.toString()}`
    );

    all.push(...res.data);
    if (res.data.length < MAX_FETCH_LIMIT) break;
    page += 1;
  }

  return all;
}

function normalizeSettingNames(settings: HotelRow["settings"]): string[] {
  const out = new Set<string>();

  for (const value of settings ?? []) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out.add(trimmed);
      continue;
    }

    const nested = value?.settings_id;

    if (typeof nested === "string") {
      const trimmed = nested.trim();
      if (trimmed) out.add(trimmed);
      continue;
    }

    const nestedName = nested?.name?.trim();
    if (nestedName) {
      out.add(nestedName);
    }
  }

  return [...out];
}

function extractExistingActivityNames(activities: HotelRow["activities"]): string[] {
  const names = new Set<string>();

  for (const value of activities ?? []) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) names.add(trimmed);
      continue;
    }

    const nested = value?.activities_id;

    if (typeof nested === "string") {
      const trimmed = nested.trim();
      if (trimmed) names.add(trimmed);
      continue;
    }

    const nestedName = nested?.name?.trim();
    if (nestedName) {
      names.add(nestedName);
      continue;
    }

    const flatName = value?.name?.trim();
    if (flatName) names.add(flatName);
  }

  return [...names];
}

function mapSetting(settingNames: string[]): SettingName[] {
  const mapped = new Set<SettingName>();

  for (const name of settingNames) {
    const n = name.toLowerCase();

    if (n.includes("city")) mapped.add("City");
    if (n.includes("beach")) mapped.add("Beachfront");
    if (
      n.includes("country") ||
      n.includes("countryside") ||
      n.includes("rural") ||
      n.includes("vineyard")
    ) {
      mapped.add("Countryside");
    }
    if (n.includes("mountain") || n.includes("alps") || n.includes("rockies")) {
      mapped.add("Mountains");
    }
  }

  return [...mapped];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function filterHotelsNeedingActivities(hotels: HotelRow[]): HotelRow[] {
  return hotels.filter((hotel) => extractExistingActivityNames(hotel.activities).length <= 2);
}

function buildPatchRows(hotels: HotelRow[], rules: RulesFile): PatchRow[] {
  return hotels.map((hotel) => {
    const hotelName = hotel.hotel_name ?? hotel.name ?? `Hotel ${hotel.id}`;
    const settingNames = normalizeSettingNames(hotel.settings);
    const mappedSettings = mapSetting(settingNames);
    const existing = extractExistingActivityNames(hotel.activities);

    const auto = new Set<string>();
    const conditional = new Set<string>();
    const reviewReasons: string[] = [];

    for (const setting of mappedSettings) {
      for (const activity of rules.settings_auto[setting] ?? []) {
        if (activity.rule_note) {
          conditional.add(activity.name);
          reviewReasons.push(`${activity.name}: ${activity.rule_note}`);
        } else {
          auto.add(activity.name);
        }
      }
    }

    const conditionalBySetting: Partial<Record<SettingName, string[]>> = {
      City: [
        "History",
        "Family",
        "Yoga",
        "Tennis",
        "Padel",
        "Cooking classes",
        "Golf"
      ],
      Beachfront: [
        "Diving",
        "Kayaking",
        "Fishing",
        "Tennis",
        "Golf",
        "Yoga",
        "Biking",
        "Parasailing",
        "Kitesurfing",
        "Whale watching"
      ],
      Countryside: [
        "Nature",
        "Biking",
        "Horseback riding",
        "Fishing",
        "Fly fishing",
        "Hunting",
        "Golf",
        "Tennis",
        "Yoga",
        "Wine",
        "Cooking classes",
        "Archery"
      ],
      Mountains: [
        "Nature",
        "Biking",
        "Rock climbing",
        "Rappelling",
        "Rafting",
        "Whitewater rafting",
        "Fishing",
        "Fly fishing",
        "Golf",
        "Tennis",
        "Yoga",
        "Paragliding"
      ],
    };

    for (const setting of mappedSettings) {
      for (const activityName of conditionalBySetting[setting] ?? []) {
        conditional.add(activityName);
      }
    }

    if (hotel.michelin_restaurant_at_hotel) {
      for (const activity of rules.conditional_when_michelin_restaurant_at_hotel) {
        auto.add(activity.name);
      }
    }

    const settingText = settingNames.join(" ").toLowerCase();

    if (settingText.includes("wildlife")) {
      for (const activity of rules.conditional_when_wildlife_reserve) {
        auto.add(activity.name);
      }

      conditional.add("Nature");
      conditional.add("Fishing");
      conditional.add("River cruise");
      conditional.add("Falconry");
      conditional.add("Horseback riding");
      conditional.add("Biking");
      conditional.add("Yoga");
      conditional.add("Cooking classes");
      conditional.add("Family");
    } 

    const finalAutoOnly = dedupe([...existing, ...auto]).slice(0, MAX_FINAL_ACTIVITIES);

    return {
      id: hotel.id,
      hotel_name: hotelName,
      existing_activity_count: existing.length,
      existing_activity_names: existing,
      suggested_auto_activity_names: dedupe([...auto]).filter((name) => !existing.includes(name)),
      conditional_review_activity_names: dedupe([...conditional]).filter(
        (name) => !existing.includes(name) && !auto.has(name)
      ),
      final_activity_names_if_auto_only: finalAutoOnly,
      review_reasons: dedupe(reviewReasons),
      www: hotel.www ?? null,
      city: hotel.city ?? null,
      country: hotel.country ?? null,
      settings: settingNames,
    };
  });
}

async function main() {
  const rules = loadJson<RulesFile>(RULES_PATH);
  const hotels = await fetchAllHotels();
  const candidates = filterHotelsNeedingActivities(hotels);
  const patchRows = buildPatchRows(candidates, rules);

  fs.writeFileSync(OUT_PATH, JSON.stringify(patchRows, null, 2));

  console.log(`Fetched ${hotels.length} hotels from Directus.`);
  console.log(`Filtered to ${candidates.length} hotels with 0-2 activities.`);
  console.log(`Wrote ${patchRows.length} hotel suggestions to ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});