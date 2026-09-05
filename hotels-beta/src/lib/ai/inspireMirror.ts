import type { InspireMonth, InspirePurpose } from "@/lib/inspire/types";
import type { AiQueryState } from "./types";

/* Translating a concierge answer into the Inspire page's own two controls.
 *
 * Inspire asks a different question from the rest of the site — when and what
 * kind of trip, rather than where — so it has no destination field to fill.
 * What it can mirror is the month and the purpose, and those are exactly what
 * "the best hotels for skiing in the Alps in February" is made of.
 *
 * Its five purposes are a much coarser vocabulary than the hotel taxonomy's
 * 22 settings and 37 activities, so this is a deliberate narrowing, not a
 * lookup. Order matters: a ski hotel is nearly always tagged Mountains too, so
 * ski has to be tested first or every ski answer would come back as
 * "Mountains". */

const MONTHS: InspireMonth[] = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Most specific first — the first rule that matches wins. */
const PURPOSE_RULES: { purpose: InspirePurpose; activities: string[]; settings: string[] }[] = [
  { purpose: "ski", activities: ["Skiing"], settings: [] },
  {
    purpose: "safari",
    activities: ["Safari", "Wilderness safari", "Wildlife", "Gorilla Hiking"],
    settings: ["Wildlife Reserve", "Nature Reserve"],
  },
  {
    purpose: "beach",
    activities: ["Beach", "Snorkeling", "Diving", "Watersports", "Sailing"],
    settings: [
      "Beach",
      "Beachfront",
      "Coastal",
      "Island",
      "Oceanfront",
      "Overwater",
      "Private Island",
      "Seaside",
    ],
  },
  {
    purpose: "mountains",
    activities: ["Hiking", "Paragliding"],
    settings: ["Mountains", "Hillside"],
  },
  {
    purpose: "city_break",
    activities: ["Shopping", "Sightseeing", "Gastronomy"],
    settings: ["City"],
  },
];

/** The Inspire purpose a concierge answer implies, or "" when none of its five
 * fits — in which case the page's own selector is left alone rather than
 * guessed at. */
export function purposeFromQuery(query: AiQueryState): InspirePurpose | "" {
  const activities = new Set(query.activities);
  const settings = new Set(query.settings);

  for (const rule of PURPOSE_RULES) {
    if (rule.activities.some((a) => activities.has(a))) return rule.purpose;
    if (rule.settings.some((s) => settings.has(s))) return rule.purpose;
  }
  return "";
}

/** The month the concierge settled on, read from the check-in it resolved.
 * Parsed off the ISO string rather than through Date, so a timezone west of
 * UTC cannot roll "1 February" back into January. */
export function monthFromQuery(query: AiQueryState): InspireMonth | "" {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(query.from);
  if (!match) return "";
  const index = Number(match[1]) - 1;
  return MONTHS[index] ?? "";
}
