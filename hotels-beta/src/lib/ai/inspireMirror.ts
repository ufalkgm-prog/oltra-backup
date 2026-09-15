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

/** The five purposes and the tags that imply each. An answer must imply exactly
 * one of them to set the selector (see purposeFromQuery). */
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
      "Beachfront",
      "Coastal",
      "Island",
      "Oceanfront",
      "Overwater",
      "Private Island",
    ],
  },
  {
    purpose: "mountains",
    activities: ["Hiking", "Paragliding"],
    /* Not Hillside: Tuscany and Ubud are hillside, and neither is a mountain
       trip. With the setting now deciding first, Hillside would have turned
       every countryside-and-hillside answer back into "mountains". */
    settings: ["Mountains"],
  },
  {
    purpose: "city_break",
    activities: ["Shopping", "Sightseeing", "Gastronomy"],
    settings: ["City"],
  },
];

/** Activities that name the trip whatever the hotel's setting. */
const DEFINING_ACTIVITIES: Record<string, InspirePurpose> = {
  Skiing: "ski",
  Safari: "safari",
  "Wilderness safari": "safari",
  "Gorilla Hiking": "safari",
};

/** The Inspire purpose a concierge answer implies, or "" when none of its five
 * fits — in which case the page's own selector is left alone rather than
 * guessed at.
 *
 * The setting decides before the activities do. Activities are what a guest
 * does from a hotel, and most of them happen in several kinds of place: walking
 * and good food in the European countryside (2026-09-15) matched Hiking to
 * "mountains" and led the page with Courchevel at 8°C. So when the answer names
 * a setting, only a setting can pick the purpose, and a setting Inspire has no
 * purpose for (Countryside, Lakeside, Desert) picks none. Activities decide only
 * when no setting was given, or when one names the trip outright (skiing,
 * safari). */
export function purposeFromQuery(query: AiQueryState): InspirePurpose | "" {
  for (const activity of query.activities) {
    const defined = DEFINING_ACTIVITIES[activity];
    if (defined) return defined;
  }

  /* One purpose or none. An answer whose tags point two ways — City and
     Oceanfront, for two Marrakech riads and a Madeira cliff hotel (2026-09-15)
     — used to take whichever rule came first, Beach, and led the page with
     beaches for an answer mostly about a medina. When the tags disagree the
     selector is left as it was. */
  const single = (matches: InspirePurpose[]): InspirePurpose | "" =>
    new Set(matches).size === 1 ? matches[0] : "";

  const settings = new Set(query.settings);
  if (settings.size) {
    return single(
      PURPOSE_RULES.filter((rule) => rule.settings.some((s) => settings.has(s))).map(
        (rule) => rule.purpose
      )
    );
  }

  const activities = new Set(query.activities);
  return single(
    PURPOSE_RULES.filter((rule) => rule.activities.some((a) => activities.has(a))).map(
      (rule) => rule.purpose
    )
  );
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
