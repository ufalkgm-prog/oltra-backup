/** The basemap, in one place.
 *
 * `streets-v4` everywhere, no dark variant (§12/§34) — the URL was written out
 * at each of the four maps, which is four chances for them to drift apart the
 * next time one of them is touched.
 *
 * No `&language=en`: MapTiler returns a byte-identical style with and without
 * it, checked 2026-09-21. English labels come from `applyEnglishLabels`, which
 * every map calls on load. */
export function mapStyleUrl(key: string): string {
  return `https://api.maptiler.com/maps/streets-v4/style.json?key=${key}`;
}
