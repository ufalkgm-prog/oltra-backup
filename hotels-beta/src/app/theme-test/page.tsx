// Temporary design-review route (design-system audit, 2026-08-11/12).
// Renders real app components against both the current dark surface and the
// proposed warm-ivory surface, side by side, so the two-surface theme
// proposal can be reviewed without retheming the live site. Not linked from
// any nav; excluded from production builds below.
//
// Delete this whole directory once the two-surface decision is made either
// way - it isn't meant to be a permanent part of the app.

import { notFound } from "next/navigation";
import { getHotels, type HotelRecord } from "@/lib/directus";
import ThemeTestView from "./ThemeTestView";

const sampleHotelFields = [
  "id",
  "hotel_name",
  "country",
  "city",
  "highlights",
  "agoda_photo1",
  "ratehawk_image_1",
  "ratehawk_image_1_category",
] as const;

export default async function ThemeTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  let sampleHotels: HotelRecord[] = [];
  try {
    sampleHotels = await getHotels({
      fields: sampleHotelFields as unknown as string[],
      filter: { published: { _eq: true } },
      limit: 3,
      sort: "-ext_points",
    });
  } catch {
    // Results-grid section just renders empty if Directus isn't reachable -
    // not the point of this page, and shouldn't block the rest of it.
    sampleHotels = [];
  }

  return <ThemeTestView sampleHotels={sampleHotels} />;
}
