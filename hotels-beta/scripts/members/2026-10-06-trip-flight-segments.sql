-- Flight details on a saved flight, for the Saved trips itinerary (Ulrik, 2026-10-06).
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (ref hrlvtzcapsqkgrcawluf - not the Hotel database; see CLAUDE.md §31).
--
-- A saved flight kept only the route, times, cabin and passenger counts. The
-- search result also has each segment's airline, flight number, airports,
-- terminals, aircraft and baggage, and the itinerary now shows them. One jsonb
-- column, shaped { outbound: [...], inbound: [...] } (SavedFlightSegments in
-- src/lib/members/types.ts), rather than a column per detail: a journey has a
-- varying number of segments.
--
-- Until this runs, saving a flight still works: addFlightToTripBrowser retries
-- without the column when PostgREST reports it missing. Flights saved before it
-- simply have no details. The table's existing RLS policies cover the column.

alter table public.member_trip_flights
  add column if not exists segments jsonb;

-- PostgREST caches the schema; this makes the new column visible at once.
notify pgrst, 'reload schema';
