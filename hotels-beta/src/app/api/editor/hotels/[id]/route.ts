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

    const payload = {
      hotel_name: normalizeText(body.hotel_name),
      www: normalizeText(body.www),
      insta: normalizeText(body.insta),

      region: normalizeText(body.region),
      country: normalizeText(body.country),
      state_province_county_island: normalizeText(
        body.state_province_county_island
      ),
      city: normalizeText(body.city),
      local_area: normalizeText(body.local_area),

      highlights: normalizeText(body.highlights),
      description: normalizeText(body.description),

      ext_points: normalizeNumber(body.ext_points),
      editor_rank: normalizeNumber(body.editor_rank),
      total_rooms_suites_villas: normalizeNumber(body.total_rooms_suites_villas),

      published: Boolean(body.published),

      activities: getArray(body.activities),
      awards: getArray(body.awards),
      setting: getArray(body.setting),
      style: getArray(body.style),
    };

    await updateItem(COLLECTION, id, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown save error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}