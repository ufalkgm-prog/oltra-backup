-- Saved-trip item prices (Members > Saved trips).
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (ref hrlvtzcapsqkgrcawluf - not the Hotel database; see CLAUDE.md §31),
-- the same way the room_selection migration was applied in §30. There is no
-- service-role key or linked CLI in the dev environment, so this cannot be
-- applied from a script.
--
-- Until this runs, saving a hotel or flight to a trip will fail: the insert
-- payloads in src/lib/members/db.ts already send these columns.

alter table member_trip_flights
  add column if not exists price_amount numeric,
  add column if not exists price_currency text;

-- Needed by the trip consistency warnings (hotel/flight cross-checks).
--
-- arrive_at is NOT the arrival at the destination: for a return itinerary it
-- is the arrival back home, because a return trip is saved as one row. So the
-- destination arrival and the departure home are stored separately - without
-- them, "your flight lands after your hotel starts" would compare the wrong
-- end of the trip. return_depart_at is null for a one-way.
alter table member_trip_flights
  add column if not exists adults integer,
  add column if not exists kids integer,
  add column if not exists destination_arrive_at timestamptz,
  add column if not exists return_depart_at timestamptz;

comment on column member_trip_flights.destination_arrive_at is
  'Arrival at the destination (outbound final segment). Differs from arrive_at on a return itinerary, where arrive_at is the arrival back home.';

alter table member_trip_hotels
  add column if not exists price_amount numeric,
  add column if not exists price_currency text;

-- The search that produced the price, so "Update price and availability" can
-- re-run the same query instead of guessing. All nullable: a hotel can be
-- saved with no dates, rooms or guests at all, and then simply has no price.
alter table member_trip_hotels
  add column if not exists rooms integer,
  add column if not exists adults integer,
  add column if not exists kids integer,
  add column if not exists children_ages jsonb;

comment on column member_trip_hotels.rooms is
  'Bedrooms requested at save time. Null when the hotel was saved without a search.';

comment on column member_trip_flights.price_amount is
  'Total itinerary price shown at save time, in price_currency. Indicative only - not a held fare.';

comment on column member_trip_hotels.price_amount is
  'Total stay price shown at save time, in price_currency. Indicative only - not a held rate.';
