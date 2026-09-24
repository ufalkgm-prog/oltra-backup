-- Concierge answer log: one record per answer, for the monitoring agent.
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (ref hrlvtzcapsqkgrcawluf - not the Hotel database; see CLAUDE.md §31). There
-- is no service-role key or linked CLI in the dev environment, so this cannot
-- be applied from a script.
--
-- The chat route writes a row after every answer (src/lib/ai/answerLog.ts,
-- writeAnswerLog in src/app/api/chat/route.ts). Until this runs, those writes
-- fail quietly - "[ai log]" in the server log - and answers are unaffected.
--
-- ANSWERS ONLY (Ulrik, 2026-09-24): there is no column for the member's
-- question, and the member is a hash, never their id.

create table if not exists public.concierge_answer_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_hash text not null,
  page text,
  turn integer not null,
  model text not null,
  triage_label text not null,        -- TRAVEL, MIXED, PROBE, ACCOUNT, OTHER, UNKNOWN, ERROR
  removed_kind text,                 -- what a MIXED rewrite took out: PROBE, PRIVACY, ACCOUNT, OTHER
  declined boolean not null,         -- triage answered instead of the model
  duration_ms integer not null,
  steps integer not null,
  tools text[] not null,             -- tool names in the order called
  finish_reason text,                -- "length" = cut off
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  reasoning_tokens integer,
  presented boolean not null,        -- presentResults called
  hotel_count integer not null,
  restaurant_count integer not null,
  flight_count integer not null,
  later_stop_count integer not null,
  stay jsonb,                        -- checkIn, checkOut, adults, kids, childrenAges, rooms
  destination jsonb,                 -- city, area, adminRegion, country
  flights jsonb,                     -- legs: origin, destination, dates, cabin, departAfter, returnAfter
  search_party jsonb,                -- the party and cabin the searches actually used
  framing text,
  follow_up text,
  answer_text text                   -- the prose shown, or triage's reply
);

create index if not exists concierge_answer_log_created_at_idx
  on public.concierge_answer_log (created_at desc);

-- Members may add their own answers' records and see none of them.
alter table public.concierge_answer_log enable row level security;
revoke all on public.concierge_answer_log from anon, authenticated;
grant insert on public.concierge_answer_log to authenticated;
drop policy if exists "members add answer records" on public.concierge_answer_log;
create policy "members add answer records"
  on public.concierge_answer_log for insert to authenticated
  with check (true);

-- A READ-ONLY ROLE FOR THE MONITORING AGENT. It can read this table and
-- nothing else, and write nothing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'concierge_log_reader') then
    create role concierge_log_reader nologin;
  end if;
end $$;
grant usage on schema public to concierge_log_reader;
grant select on public.concierge_answer_log to concierge_log_reader;
drop policy if exists "monitoring reads answer records" on public.concierge_answer_log;
create policy "monitoring reads answer records"
  on public.concierge_answer_log for select to concierge_log_reader
  using (true);

-- How the agent uses the role - choose ONE, and keep the credential out of git:
--
-- (a) Over the REST API: let the API switch to the role, then give the agent
--     a JWT whose "role" claim is concierge_log_reader, signed with the
--     project's JWT secret (Dashboard > Project Settings > API). The agent
--     sends it as the Bearer token with the anon key as apikey.
--       grant concierge_log_reader to authenticator;
--
-- (b) Over a Postgres connection string: give the role a login and password
--     and hand the agent the pooler connection string for it.
--       alter role concierge_log_reader login password '<set a strong password>';
--
-- Retention: nothing deletes old rows. When the table grows, keep e.g. 180
-- days with a scheduled
--   delete from public.concierge_answer_log where created_at < now() - interval '180 days';
