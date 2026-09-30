-- Member BOOK clicks: the booking-intent signal the concierge tiering reads.
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (ref hrlvtzcapsqkgrcawluf - not the Hotel database; see CLAUDE.md §31), like
-- 2026-09-24-concierge-answer-log.sql. Until it runs, the writes from
-- /api/members/book-click fail quietly ("[book click]" in the server log) and
-- no click is affected.
--
-- Nothing here is a booking. Hotel checkout stops at the White Label redirect
-- seam (§32) and flights are booked by Trip.com, so what we can see is the
-- last click on our side:
--   hotel_checkout  Continue on the Hotels page after choosing a room (prebook)
--   hotel_external  BOOK to the website of a hotel we cannot sell
--   flight_tripcom  Proceed in the Trip.com dialog
-- Unlike the answer log this is keyed on the member's id, because tiering by
-- booking frequency needs exactly that. It holds no search text.

create table if not exists public.member_book_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('hotel_checkout', 'hotel_external', 'flight_tripcom')),
  hotel_id integer,                  -- Directus hotel id, for the hotel kinds
  flight_route text,                 -- e.g. "CPH-CDG / CDG-CPH", for flights
  source text check (source in ('concierge', 'classic'))  -- null when the page cannot tell
);

create index if not exists member_book_clicks_user_created_idx
  on public.member_book_clicks (user_id, created_at desc);

-- A member adds and reads their own clicks only.
alter table public.member_book_clicks enable row level security;
revoke all on public.member_book_clicks from anon, authenticated;
grant insert, select on public.member_book_clicks to authenticated;

drop policy if exists "members add own book clicks" on public.member_book_clicks;
create policy "members add own book clicks"
  on public.member_book_clicks for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "members read own book clicks" on public.member_book_clicks;
create policy "members read own book clicks"
  on public.member_book_clicks for select to authenticated
  using (user_id = auth.uid());
