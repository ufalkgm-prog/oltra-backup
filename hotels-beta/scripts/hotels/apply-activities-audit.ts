#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Always resolve relative to project root (hotels-beta)
const ROOT = process.cwd();

// Load .env.local from root
dotenv.config({
  path: path.resolve(ROOT, ".env.local"),
});

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) {
  throw new Error("Missing DIRECTUS_URL in hotels-beta/.env.local");
}
if (!DIRECTUS_TOKEN) {
  throw new Error("Missing DIRECTUS_TOKEN in hotels-beta/.env.local");
}

const ACTIVITY_COLLECTION = "activities";
const JUNCTION_COLLECTION = "hotels_activities";
const PLAN_PATH = path.resolve(ROOT, "scripts/activities_audit_plan.json");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const DELETE_TAXONOMY = args.has("--delete-taxonomy");
const VERIFY_ONLY = args.has("--verify-only");
const DRY_RUN = !APPLY && !VERIFY_ONLY;

interface ActivityRow {
  id: string;
  name: string;
  slug: string;
}

interface JunctionRow {
  id: string;
  hotels_id: string | number;
  activities_id: string;
}

interface MergePlan {
  source_id: string;
  source_name: string;
  source_slug: string;
  target_id: string;
  target_name: string;
  target_slug: string;
}

interface DeletePlan {
  source_id: string;
  source_name: string;
  source_slug: string;
}

interface SurvivorPlan {
  id: string;
  name: string;
  slug: string;
}

interface AuditPlan {
  source_file: string;
  generated_at: string;
  activities_collection: string;
  junction_collection: string;
  survivors: SurvivorPlan[];
  merges: MergePlan[];
  hard_deletes: DeletePlan[];
}

interface ResolvedSurvivor {
  plan_id: string;
  live_id: string;
  name: string;
  slug: string;
}

interface ResolvedMerge {
  source_plan_id: string;
  source_live_id: string;
  source_name: string;
  source_slug: string;
  target_plan_id: string;
  target_live_id: string;
  target_name: string;
  target_slug: string;
}

interface ResolvedDelete {
  source_plan_id: string;
  source_live_id: string | null;
  source_name: string;
  source_slug: string;
}

interface ResolvedPlan {
  survivors: ResolvedSurvivor[];
  merges: ResolvedMerge[];
  hard_deletes: ResolvedDelete[];
}

function directusHeaders(initHeaders?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    "Content-Type": "application/json",
    ...(initHeaders ?? {}),
  };
}

async function directus<T>(urlPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${urlPath}`, {
    ...init,
    headers: directusHeaders(init?.headers),
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
  const limit = 500;

  while (true) {
    const qs = new URLSearchParams({
      fields: fields.join(","),
      page: String(page),
      limit: String(limit),
    });

    const res = await directus<{ data: T[] }>(`/items/${collection}?${qs.toString()}`);
    all.push(...res.data);

    if (res.data.length < limit) break;
    page += 1;
  }

  return all;
}

async function patchItem(collection: string, id: string, payload: Record<string, unknown>) {
  await directus(`/items/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function deleteItem(collection: string, id: string) {
  await directus(`/items/${collection}/${id}`, {
    method: "DELETE",
  });
}

function loadPlan(): AuditPlan {
  return JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
}

function buildById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function buildByName<T extends { name: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();

  for (const row of rows) {
    const key = row.name.trim();
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  }

  return out;
}

function warnSlugMismatch(context: string, planSlug: string, liveSlug: string) {
  if (planSlug !== liveSlug) {
    console.warn(
      `Slug mismatch for ${context}: plan has "${planSlug}" but Directus has "${liveSlug}". Continuing with live row.`
    );
  }
}

function resolveLiveActivityRow(
  row: { id: string; name: string; slug: string },
  liveById: Map<string, ActivityRow>,
  liveByName: Map<string, ActivityRow[]>,
  allowMissing: boolean
): ActivityRow | null {
  const exactById = liveById.get(row.id);
  if (exactById) {
    if (exactById.name !== row.name) {
      throw new Error(
        `Plan mismatch for ${row.id}: plan has name "${row.name}" but Directus has "${exactById.name}"`
      );
    }
    warnSlugMismatch(`"${row.name}"`, row.slug, exactById.slug);
    return exactById;
  }

  const nameMatches = liveByName.get(row.name.trim()) ?? [];

  if (nameMatches.length === 1) {
    const live = nameMatches[0];
    console.warn(
      `Stale activity id in plan for "${row.name}": plan has ${row.id}, Directus has ${live.id}. Using live id.`
    );
    warnSlugMismatch(`"${row.name}"`, row.slug, live.slug);
    return live;
  }

  if (nameMatches.length > 1) {
    throw new Error(
      `Multiple Directus activities found with name "${row.name}". Cannot safely resolve stale plan id ${row.id}.`
    );
  }

  if (allowMissing) {
    console.warn(
      `Missing non-surviving activity already absent in Directus: ${row.id} ${row.name}`
    );
    return null;
  }

  throw new Error(
    `Plan row missing in Directus activities and no unique name match found: ${row.id} ${row.name}`
  );
}

function resolvePlan(plan: AuditPlan, activities: ActivityRow[]): ResolvedPlan {
  const liveById = buildById(activities);
  const liveByName = buildByName(activities);

  const missingSurvivors: string[] = [];

  const resolvedSurvivors: ResolvedSurvivor[] = [];

  for (const survivor of plan.survivors) {
    try {
      const live = resolveLiveActivityRow(survivor, liveById, liveByName, false);
      if (!live) {
        missingSurvivors.push(`${survivor.name} (${survivor.id})`);
        continue;
      }

      resolvedSurvivors.push({
        plan_id: survivor.id,
        live_id: live.id,
        name: live.name,
        slug: live.slug,
      });
    } catch (error) {
      missingSurvivors.push(`${survivor.name} (${survivor.id})`);
    }
  }

  if (missingSurvivors.length) {
    throw new Error(
      `Missing or unresolved survivor activities in Directus:\n- ${missingSurvivors.join("\n- ")}`
    );
  }

  const survivorByName = new Map(resolvedSurvivors.map((s) => [s.name, s]));
  const survivorByLiveId = new Map(resolvedSurvivors.map((s) => [s.live_id, s]));

  const resolvedMerges: ResolvedMerge[] = plan.merges.map((merge) => {
    const sourceLive = resolveLiveActivityRow(
      {
        id: merge.source_id,
        name: merge.source_name,
        slug: merge.source_slug,
      },
      liveById,
      liveByName,
      false
    );

    if (!sourceLive) {
      throw new Error(`Merge source unexpectedly resolved to null: ${merge.source_name}`);
    }

    const targetSurvivor =
      survivorByLiveId.get(merge.target_id) ?? survivorByName.get(merge.target_name);

    if (!targetSurvivor) {
      throw new Error(
        `Merge target could not be resolved to a surviving activity: ${merge.source_name} -> ${merge.target_name}`
      );
    }

    if (targetSurvivor.name !== merge.target_name) {
      throw new Error(
        `Merge target name mismatch for ${merge.source_name}: plan expects "${merge.target_name}" but resolved survivor is "${targetSurvivor.name}"`
      );
    }

    warnSlugMismatch(
      `merge target "${merge.target_name}"`,
      merge.target_slug,
      targetSurvivor.slug
    );

    return {
      source_plan_id: merge.source_id,
      source_live_id: sourceLive.id,
      source_name: sourceLive.name,
      source_slug: sourceLive.slug,
      target_plan_id: merge.target_id,
      target_live_id: targetSurvivor.live_id,
      target_name: targetSurvivor.name,
      target_slug: targetSurvivor.slug,
    };
  });

  const resolvedDeletes: ResolvedDelete[] = plan.hard_deletes.map((del) => {
    const sourceLive = resolveLiveActivityRow(
      {
        id: del.source_id,
        name: del.source_name,
        slug: del.source_slug,
      },
      liveById,
      liveByName,
      true
    );

    return {
      source_plan_id: del.source_id,
      source_live_id: sourceLive?.id ?? null,
      source_name: del.source_name,
      source_slug: sourceLive?.slug ?? del.source_slug,
    };
  });

  return {
    survivors: resolvedSurvivors,
    merges: resolvedMerges,
    hard_deletes: resolvedDeletes,
  };
}

function buildDuplicateDeletes(rows: JunctionRow[]): string[] {
  const grouped = new Map<string, JunctionRow[]>();

  for (const row of rows) {
    const key = `${row.hotels_id}::${row.activities_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const deleteIds: string[] = [];
  for (const list of grouped.values()) {
    if (list.length <= 1) continue;
    const [, ...dupes] = list;
    for (const dup of dupes) deleteIds.push(dup.id);
  }

  return deleteIds;
}

function summarizeByActivity(rows: JunctionRow[], ids: Set<string>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!ids.has(row.activities_id)) continue;
    counts.set(row.activities_id, (counts.get(row.activities_id) ?? 0) + 1);
  }

  return counts;
}

async function main() {
  const plan = loadPlan();
  const activities = await fetchAll<ActivityRow>(ACTIVITY_COLLECTION, ["id", "name", "slug"]);
  const junction = await fetchAll<JunctionRow>(JUNCTION_COLLECTION, ["id", "hotels_id", "activities_id"]);

  const resolved = resolvePlan(plan, activities);

  const mergeBySourceLiveId = new Map(
    resolved.merges.map((m) => [m.source_live_id, m])
  );

  const mergeSourceLiveIds = new Set(resolved.merges.map((m) => m.source_live_id));
  const hardDeleteLiveIds = new Set(
    resolved.hard_deletes
      .map((d) => d.source_live_id)
      .filter((id): id is string => Boolean(id))
  );
  const obsoleteLiveIds = new Set([...mergeSourceLiveIds, ...hardDeleteLiveIds]);

  const mergeUpdates = junction
    .filter((row) => mergeSourceLiveIds.has(row.activities_id))
    .map((row) => {
      const merge = mergeBySourceLiveId.get(row.activities_id);
      if (!merge) {
        throw new Error(`Missing resolved merge for activity ${row.activities_id}`);
      }

      return {
        rowId: row.id,
        hotelId: row.hotels_id,
        fromId: merge.source_live_id,
        fromName: merge.source_name,
        toId: merge.target_live_id,
        toName: merge.target_name,
      };
    });

  const hardDeleteJunctionRows = junction.filter((row) => hardDeleteLiveIds.has(row.activities_id));

  const simulated = junction
    .filter((row) => !hardDeleteLiveIds.has(row.activities_id))
    .map((row) => {
      const merge = mergeBySourceLiveId.get(row.activities_id);
      return merge ? { ...row, activities_id: merge.target_live_id } : row;
    });

  const duplicateDeleteIds = buildDuplicateDeletes(simulated);

  console.log(`Mode: ${VERIFY_ONLY ? "VERIFY" : DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Activities loaded: ${activities.length}`);
  console.log(`Junction rows loaded: ${junction.length}`);
  console.log(`Survivors: ${resolved.survivors.length}`);
  console.log(`Merges: ${resolved.merges.length}`);
  console.log(`Hard deletes: ${resolved.hard_deletes.length}`);
  console.log(`Junction updates to merged targets: ${mergeUpdates.length}`);
  console.log(`Junction rows to delete for hard deletes: ${hardDeleteJunctionRows.length}`);
  console.log(`Duplicate junction rows to delete after merge: ${duplicateDeleteIds.length}`);

  const mergeImpact = summarizeByActivity(junction, mergeSourceLiveIds);
  const deleteImpact = summarizeByActivity(junction, hardDeleteLiveIds);

  if (resolved.merges.length) {
    console.log("\nMerge impact by source activity:");
    for (const merge of resolved.merges) {
      console.log(
        `- ${merge.source_name} -> ${merge.target_name}: ${mergeImpact.get(merge.source_live_id) ?? 0} relation(s)`
      );
    }
  }

  if (resolved.hard_deletes.length) {
    console.log("\nHard delete impact by source activity:");
    for (const del of resolved.hard_deletes) {
      const count = del.source_live_id ? (deleteImpact.get(del.source_live_id) ?? 0) : 0;
      console.log(`- ${del.source_name}: ${count} relation(s)`);
    }
  }

  const remainingObsoleteReferences = simulated.filter((row) => obsoleteLiveIds.has(row.activities_id));
  if (remainingObsoleteReferences.length) {
    throw new Error(`Simulation still contains ${remainingObsoleteReferences.length} obsolete activity references.`);
  }

  if (VERIFY_ONLY || DRY_RUN) {
    console.log("\nNo changes written.");
    console.log("Use --apply to write relation changes, and optionally --delete-taxonomy to remove obsolete activity rows.");
    return;
  }

  for (const update of mergeUpdates) {
    await patchItem(JUNCTION_COLLECTION, update.rowId, { activities_id: update.toId });
    console.log(`Patched ${update.rowId}: ${update.fromName} -> ${update.toName}`);
  }

  for (const row of hardDeleteJunctionRows) {
    await deleteItem(JUNCTION_COLLECTION, row.id);
    console.log(`Deleted junction ${row.id} for obsolete activity ${row.activities_id}`);
  }

  const refreshedJunction = await fetchAll<JunctionRow>(JUNCTION_COLLECTION, ["id", "hotels_id", "activities_id"]);
  const duplicateDeletesAfterApply = buildDuplicateDeletes(refreshedJunction);

  for (const id of duplicateDeletesAfterApply) {
    await deleteItem(JUNCTION_COLLECTION, id);
    console.log(`Deleted duplicate junction ${id}`);
  }

  if (DELETE_TAXONOMY) {
    for (const merge of resolved.merges) {
      if (merge.source_live_id !== merge.target_live_id) {
        await deleteItem(ACTIVITY_COLLECTION, merge.source_live_id);
        console.log(`Deleted merged taxonomy row ${merge.source_name}`);
      } else {
        console.warn(`Skipped taxonomy delete for ${merge.source_name} because source and target resolved to the same live id.`);
      }
    }

    for (const del of resolved.hard_deletes) {
      if (del.source_live_id) {
        await deleteItem(ACTIVITY_COLLECTION, del.source_live_id);
        console.log(`Deleted obsolete taxonomy row ${del.source_name}`);
      } else {
        console.warn(`Skipped taxonomy delete for ${del.source_name}; already absent in Directus.`);
      }
    }
  } else {
    console.log("\nTaxonomy rows were left in place.");
    console.log("Re-run with --apply --delete-taxonomy after verifying the live relation cleanup.");
  }

  const finalJunction = await fetchAll<JunctionRow>(JUNCTION_COLLECTION, ["id", "hotels_id", "activities_id"]);
  const stillObsolete = finalJunction.filter((row) => obsoleteLiveIds.has(row.activities_id));
  const remainingDupes = buildDuplicateDeletes(finalJunction);

  console.log("\nVerification summary:");
  console.log(`Remaining obsolete activity references: ${stillObsolete.length}`);
  console.log(`Remaining duplicate junction rows: ${remainingDupes.length}`);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});