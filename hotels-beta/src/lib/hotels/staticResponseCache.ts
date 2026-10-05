// Cache headers for one hotel's static detail - images, description, policies.
// These change when an editor or the daily ETG sync (§48) writes them, never
// per visitor, yet each selection on the Hotels page used to cost three
// uncached Directus round trips of 0.4-1.2s (2026-10-05 test pass).
//
// The browser keeps them five minutes, so returning to a hotel is instant;
// Vercel's CDN an hour, serving a stale copy while it refreshes, so an edit
// shows within the hour. Middleware runs before the CDN, so the beta gate
// still holds. Success responses only - an error is never cached.
//
// Not for anything priced: ETG prohibit caching hotelpage and Prebook (§32).
export const STATIC_HOTEL_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
} as const;
