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

const PATCH_PATH = path.resolve(ROOT, "scripts/missing_activities_patch.generated.json");
const HOTEL_COLLECTION = "hotels";
const ACTIVITY_COLLECTION = "activities";
const JUNCTION_COLLECTION = "hotels_activities";
const MAX_FETCH_LIMIT = 500;

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const VERIFY_ONLY = args.has("--verify-only");
const DRY_RUN = !APPLY && !VERIFY_ONLY;

type Id = string | number;

interface PatchRow {
  id: Id;
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

interface ActivityRow {
  id: string;
  name: string;
  slug?: string | null;
}

interface HotelRow {
  id: Id;
  hotel_name?: string | null;
  name?: string | null;
}

interface JunctionRow {
  id: string;
  hotels_id: Id;
  activities_id: string;
}

interface HotelUpdate {
  hotelId: Id;
  hotelName: string;
  currentNames: string[];
  targetNames: string[];
  addActivityIds: string[];
  deleteJunctionIds: string[];
  unchangedActivityIds: string[];
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function directus<T>(urlPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${urlPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus request failed ${res.status} ${res.statusText}\n${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function fetchAll<T>(collection: string, fields: string[]): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({
      fields: fields.join(","),
      page: String(page),
      limit: String(MAX_FETCH_LIMIT),
    });

    const res = await directus<{ data: T[] }>(`/items/${collection}?${qs.toString()}`);
    all.push(...res.data);
    if (res.data.length < MAX_FETCH_LIMIT) break;
    page += 1;
  }

  return all;
}

async function createItem(collection: string, payload: Record<string, unknown>) {
  await directus(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function deleteItem(collection: string, id: string) {
  await directus(`/items/${collection}/${id}`, {
    method: "DELETE",
  });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function asKey(id: Id): string {
  return String(id);
}

function buildNameToActivityMap(activities: ActivityRow[]): Map<string, ActivityRow> {
  const grouped = new Map<string, ActivityRow[]>();

  for (const activity of activities) {
    const key = activity.name.trim();
    const list = grouped.get(key) ?? [];
    list.push(activity);
    grouped.set(key, list);
  }

  const out = new Map<string, ActivityRow>();
  for (const [name, rows] of grouped.entries()) {
    if (rows.length > 1) {
      throw new Error(`Duplicate activity name in Directus: "${name}" has ${rows.length} rows.`);
    }
    out.set(name, rows[0]);
  }

  return out;
}

function buildHotelMaps(hotels: HotelRow[]) {
  const byId = new Map<string, HotelRow>();
  for (const hotel of hotels) byId.set(asKey(hotel.id), hotel);
  return byId;
}

function groupJunctionByHotel(rows: JunctionRow[]) {
  const out = new Map<string, JunctionRow[]>();
  for (const row of rows) {
    const key = asKey(row.hotels_id);
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  }
  return out;
}

function buildUpdates(
  patchRows: PatchRow[],
  hotelsById: Map<string, HotelRow>,
  activityByName: Map<string, ActivityRow>,
  junctionByHotel: Map<string, JunctionRow[]>
): HotelUpdate[] {
  const updates: HotelUpdate[] = [];

  for (const patch of patchRows) {
    const hotelIdKey = asKey(patch.id);
    const hotel = hotelsById.get(hotelIdKey);
    if (!hotel) {
      throw new Error(`Patch references missing hotel id ${patch.id} (${patch.hotel_name})`);
    }

    const targetNames = dedupe(patch.final_activity_names_if_auto_only);
    const targetIds = targetNames.map((name) => {
      const activity = activityByName.get(name);
      if (!activity) {
        throw new Error(`Patch references missing activity name "${name}" for hotel ${patch.hotel_name} (${patch.id})`);
      }
      return activity.id;
    });

    const currentJunctionRows = junctionByHotel.get(hotelIdKey) ?? [];
    const currentActivityIds = dedupe(currentJunctionRows.map((row) => row.activities_id));

    const currentNames = currentActivityIds.map((id) => {
      const activity = [...activityByName.values()].find((a) => a.id === id);
      return activity?.name ?? id;
    });

    const targetIdSet = new Set(targetIds);
    const currentIdSet = new Set(currentActivityIds);

    const addActivityIds = targetIds.filter((id) => !currentIdSet.has(id));
    const deleteJunctionIds = currentJunctionRows
      .filter((row) => !targetIdSet.has(row.activities_id))
      .map((row) => row.id);
    const unchangedActivityIds = currentActivityIds.filter((id) => targetIdSet.has(id));

    updates.push({
      hotelId: patch.id,
      hotelName: patch.hotel_name,
      currentNames,
      targetNames,
      addActivityIds,
      deleteJunctionIds,
      unchangedActivityIds,
    });
  }

  return updates;
}

async function main() {
  const patchRows = loadJson<PatchRow[]>(PATCH_PATH);
  const [activities, hotels, junctionRows] = await Promise.all([
    fetchAll<ActivityRow>(ACTIVITY_COLLECTION, ["id", "name", "slug"]),
    fetchAll<HotelRow>(HOTEL_COLLECTION, ["id", "hotel_name"]),
    fetchAll<JunctionRow>(JUNCTION_COLLECTION, ["id", "hotels_id", "activities_id"]),
  ]);

  const activityByName = buildNameToActivityMap(activities);
  const hotelsById = buildHotelMaps(hotels);
  const junctionByHotel = groupJunctionByHotel(junctionRows);

  const updates = buildUpdates(patchRows, hotelsById, activityByName, junctionByHotel);

  const hotelsAffected = updates.filter((u) => u.addActivityIds.length || u.deleteJunctionIds.length);
  const totalAdds = updates.reduce((sum, u) => sum + u.addActivityIds.length, 0);
  const totalDeletes = updates.reduce((sum, u) => sum + u.deleteJunctionIds.length, 0);

  console.log(`Mode: ${VERIFY_ONLY ? "VERIFY" : DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Patch rows loaded: ${patchRows.length}`);
  console.log(`Hotels loaded: ${hotels.length}`);
  console.log(`Activities loaded: ${activities.length}`);
  console.log(`Junction rows loaded: ${junctionRows.length}`);
  console.log(`Hotels affected: ${hotelsAffected.length}`);
  console.log(`Activity relations to add: ${totalAdds}`);
  console.log(`Activity relations to delete: ${totalDeletes}`);

  console.log("\nSample affected hotels:");
  for (const update of hotelsAffected.slice(0, 12)) {
    const addedNames = update.addActivityIds.map((id) => activities.find((a) => a.id === id)?.name ?? id);
    console.log(`- ${update.hotelName} (${update.hotelId})`);
    console.log(`  Current: ${update.currentNames.join(", ") || "—"}`);
    console.log(`  Target:  ${update.targetNames.join(", ") || "—"}`);
    console.log(`  Add:     ${addedNames.join(", ") || "—"}`);
    console.log(`  Delete junction rows: ${update.deleteJunctionIds.length}`);
  }

  if (VERIFY_ONLY || DRY_RUN) {
    console.log("\nNo changes written.");
    console.log("Run with --apply to write to Directus.");
    return;
  }

  for (const update of hotelsAffected) {
    for (const junctionId of update.deleteJunctionIds) {
      await deleteItem(JUNCTION_COLLECTION, junctionId);
    }

    for (const activityId of update.addActivityIds) {
      await createItem(JUNCTION_COLLECTION, {
        hotels_id: update.hotelId,
        activities_id: activityId,
      });
    }

    console.log(`Updated ${update.hotelName} (${update.hotelId}): +${update.addActivityIds.length} / -${update.deleteJunctionIds.length}`);
  }

  const finalJunctionRows = await fetchAll<JunctionRow>(JUNCTION_COLLECTION, ["id", "hotels_id", "activities_id"]);
  const finalByHotel = groupJunctionByHotel(finalJunctionRows);

  let mismatches = 0;
  for (const patch of patchRows) {
    const targetNames = dedupe(patch.final_activity_names_if_auto_only);
    const targetIds = targetNames.map((name) => activityByName.get(name)?.id).filter((id): id is string => Boolean(id));
    const finalIds = dedupe((finalByHotel.get(asKey(patch.id)) ?? []).map((row) => row.activities_id)).sort();
    const expectedIds = dedupe(targetIds).sort();
    if (JSON.stringify(finalIds) !== JSON.stringify(expectedIds)) mismatches += 1;
  }

  console.log("\nVerification summary:");
  console.log(`Hotels with post-write mismatches: ${mismatches}`);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
