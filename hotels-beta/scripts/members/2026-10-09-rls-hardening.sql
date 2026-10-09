-- Row-level security hardening (2026-10-09), from the review of schema.sql.
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project (not
-- the Hotel database; see CLAUDE.md §31). Safe to run more than once.
--
-- 1. A trip item must belong to one of the member's own trips. The policies
--    on member_trip_hotels / _restaurants / _flights only checked that the
--    item's user_id was the member's, so a member who knew another member's
--    trip id could attach a row to it. They could never read or change the
--    other member's data, but the row would hang off a trip that is not
--    theirs and be deleted when that trip was. The new WITH CHECK also
--    requires the trip to be the member's own. Reads are unchanged.
--
-- 2. TRUNCATE, TRIGGER and REFERENCES are revoked from anon and authenticated.
--    TRUNCATE ignores row-level security. The API never issues it, so nothing
--    uses these today; this removes them in case that ever changes.

-- 1. Trip items only on the member's own trips
drop policy if exists member_trip_hotels_all_own on public.member_trip_hotels;
create policy member_trip_hotels_all_own on public.member_trip_hotels
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.member_trips t
      where t.id = trip_id and t.user_id = (select auth.uid())
    )
  );

drop policy if exists member_trip_restaurants_all_own on public.member_trip_restaurants;
create policy member_trip_restaurants_all_own on public.member_trip_restaurants
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.member_trips t
      where t.id = trip_id and t.user_id = (select auth.uid())
    )
  );

drop policy if exists member_trip_flights_all_own on public.member_trip_flights;
create policy member_trip_flights_all_own on public.member_trip_flights
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.member_trips t
      where t.id = trip_id and t.user_id = (select auth.uid())
    )
  );

-- 2. Privileges the API never uses
revoke truncate, trigger, references on
  public.member_profiles,
  public.member_family_members,
  public.member_favorite_hotels,
  public.member_favorite_restaurants,
  public.member_trips,
  public.member_trip_hotels,
  public.member_trip_restaurants,
  public.member_trip_flights,
  public.member_reviews
from anon, authenticated;

notify pgrst, 'reload schema';
