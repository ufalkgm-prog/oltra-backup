import "server-only";

/* The locked taxonomy vocabularies, mirrored from Directus.
 *
 * These are the exact `meta.options.choices` values on the `setting`, `style`
 * and `activities` fields, which have been locked with `allowOther: false`
 * since CLAUDE.md §44 — an editor cannot introduce a new one without a schema
 * change, so a hardcoded copy cannot silently drift the way an unconstrained
 * field would.
 *
 * They exist here because the concierge needs them in its tool schema. Live
 * testing showed the model guessing plausible-but-wrong tags on its first
 * attempt ("quiet", "secluded", "wellness"), matching nothing, and spending two
 * extra tool round trips recovering. Declaring them as JSON Schema `enum`s
 * makes an invalid tag structurally impossible rather than merely discouraged.
 *
 * If §44's lists ever change, refresh these — `GET /fields/hotels/{field}` is
 * the source. A stale entry here costs a filter that quietly matches nothing,
 * so keep them in step.
 */

export const SETTING_VALUES = [
  "Beach",
  "Beachfront",
  "Canalside",
  "City",
  "Clifftop",
  "Coastal",
  "Countryside",
  "Desert",
  "Hillside",
  "Island",
  "Jungle",
  "Lakeside",
  "Mountains",
  "Nature Reserve",
  "Oceanfront",
  "Overwater",
  "Private Island",
  "Rainforest",
  "Riverside",
  "Seaside",
  "Waterfront",
  "Wildlife Reserve",
] as const;

export const STYLE_VALUES = [
  "African",
  "Alpine",
  "Art Deco",
  "Camp",
  "Chinese",
  "Colonial",
  "Contemporary",
  "Cottages",
  "Design",
  "Grand",
  "Historical",
  "Intimate",
  "Lodge",
  "Mediterranean",
  "Middle Eastern",
  "Oriental",
  "Safari Lodge",
  "Tented Camp",
  "Traditional",
  "Tropical",
] as const;

export const ACTIVITY_VALUES = [
  "Archery",
  "Badminton",
  "Beach",
  "Boating",
  "Bowling",
  "Casino",
  "Cycling",
  "Diving",
  "Falconry",
  "Family",
  "Fishing",
  "Fitness",
  "Gastronomy",
  "Golf",
  "Gorilla Hiking",
  "Hiking",
  "Horseback riding",
  "Hunting",
  "Ice skating",
  "Kayaking",
  "Nature",
  "Padel",
  "Paragliding",
  "Rafting",
  "Safari",
  "Sailing",
  "Shopping",
  "Sightseeing",
  "Skiing",
  "Snorkeling",
  "Spa",
  "Tennis",
  "Watersports",
  "Whalewatching",
  "Wilderness safari",
  "Wildlife",
  "Wine",
] as const;
