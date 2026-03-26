// src/app/api/editor/hotels/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateItem } from "@/lib/directus";

const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v === "" ? null : v;
}

function normalizeNumber(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function getArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    const selectedActivityIds = getArray(body.activities);
    const selectedAwardIds = getArray(body.awards);
    const selectedSettingIds = getArray(body.settings);
    const selectedStyleIds = getArray(body.styles);

    const payload = {
      hotel_name: normalizeText(body.hotel_name),
      www: normalizeText(body.www),
      insta: normalizeText(body.insta),

      region: normalizeText(body.region),
      country: normalizeText(body.country),
      state_province__county__island: normalizeText(
        body.state_province__county__island
      ),
      city: normalizeText(body.city),
      local_area: normalizeText(body.local_area),

      highlights: normalizeText(body.highlights),
      description: normalizeText(body.description),
      high_season: normalizeText(body.high_season),
      low_season: normalizeText(body.low_season),
      rain_season: normalizeText(body.rain_season),

      ext_points: normalizeNumber(body.ext_points),
      editor_rank_13: normalizeNumber(body.editor_rank_13),
      total_rooms_suites_villas: normalizeNumber(body.total_rooms_suites_villas),
      rooms_suites: normalizeNumber(body.rooms_suites),
      villas: normalizeNumber(body.villas),

      published: Boolean(body.published),

      activities: selectedActivityIds.map((value) => ({ activities_id: value })),
      awards: selectedAwardIds.map((value) => ({ awards_id: value })),
      settings: selectedSettingIds.map((value) => ({ settings_id: value })),
      styles: selectedStyleIds.map((value) => ({ styles_id: value })),
    };

    await updateItem(COLLECTION, id, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown save error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}