-- MEMBERS project schema, as it stood live on 2026-10-09.
--
-- Exported with scripts/members/export-schema.sql (structure only, no member
-- data) and committed so the tables, row-level security and grants can be
-- reviewed from the repo and the project rebuilt if lost. Re-run the export
-- and replace this file after any change made in the dashboard.
--
-- Includes every dated migration in this folder, through
-- 2026-10-09-rls-hardening.sql.

-- ===== concierge_answer_log =====
create table public.concierge_answer_log (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  member_hash text not null,
  page text,
  turn integer not null,
  model text not null,
  triage_label text not null,
  removed_kind text,
  declined boolean not null,
  duration_ms integer not null,
  steps integer not null,
  tools text[] not null,
  finish_reason text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  reasoning_tokens integer,
  presented boolean not null,
  hotel_count integer not null,
  restaurant_count integer not null,
  flight_count integer not null,
  later_stop_count integer not null,
  stay jsonb,
  destination jsonb,
  flights jsonb,
  search_party jsonb,
  framing text,
  follow_up text,
  answer_text text
);
alter table public.concierge_answer_log add constraint concierge_answer_log_pkey PRIMARY KEY (id);
CREATE INDEX concierge_answer_log_created_at_idx ON public.concierge_answer_log USING btree (created_at DESC);
alter table public.concierge_answer_log enable row level security;
create policy "members add answer records" on public.concierge_answer_log as PERMISSIVE for INSERT to authenticated with check (true);
create policy "monitoring reads answer records" on public.concierge_answer_log as PERMISSIVE for SELECT to concierge_log_reader using (true);

-- granted to authenticated: INSERT
-- granted to concierge_log_reader: SELECT
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_book_clicks =====
create table public.member_book_clicks (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid(),
  kind text not null,
  hotel_id integer,
  flight_route text,
  source text
);
alter table public.member_book_clicks add constraint member_book_clicks_kind_check CHECK ((kind = ANY (ARRAY['hotel_checkout'::text, 'hotel_external'::text, 'flight_tripcom'::text])));
alter table public.member_book_clicks add constraint member_book_clicks_source_check CHECK ((source = ANY (ARRAY['concierge'::text, 'classic'::text])));
alter table public.member_book_clicks add constraint member_book_clicks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_book_clicks add constraint member_book_clicks_pkey PRIMARY KEY (id);
CREATE INDEX member_book_clicks_user_created_idx ON public.member_book_clicks USING btree (user_id, created_at DESC);
alter table public.member_book_clicks enable row level security;
create policy "members add own book clicks" on public.member_book_clicks as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy "members read own book clicks" on public.member_book_clicks as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));

-- granted to authenticated: INSERT, SELECT
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_family_members =====
create table public.member_family_members (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  full_name text,
  birthday date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.member_family_members add constraint member_family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_family_members add constraint member_family_members_pkey PRIMARY KEY (id);

alter table public.member_family_members enable row level security;
create policy member_family_members_all_own on public.member_family_members as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
CREATE TRIGGER set_updated_at_member_family_members BEFORE UPDATE ON public.member_family_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_favorite_hotels =====
create table public.member_favorite_hotels (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  hotel_directus_id text not null,
  hotel_name text,
  location text,
  meta text,
  thumbnail text,
  created_at timestamp with time zone not null default now()
);
alter table public.member_favorite_hotels add constraint member_favorite_hotels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_favorite_hotels add constraint member_favorite_hotels_pkey PRIMARY KEY (id);
alter table public.member_favorite_hotels add constraint member_favorite_hotels_user_id_hotel_directus_id_key UNIQUE (user_id, hotel_directus_id);

alter table public.member_favorite_hotels enable row level security;
create policy member_favorite_hotels_all_own on public.member_favorite_hotels as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_favorite_restaurants =====
create table public.member_favorite_restaurants (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  restaurant_directus_id text not null,
  restaurant_name text,
  location text,
  meta text,
  thumbnail text,
  created_at timestamp with time zone not null default now()
);
alter table public.member_favorite_restaurants add constraint member_favorite_restaurants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_favorite_restaurants add constraint member_favorite_restaurants_pkey PRIMARY KEY (id);
alter table public.member_favorite_restaurants add constraint member_favorite_restaurants_user_id_restaurant_directus_id_key UNIQUE (user_id, restaurant_directus_id);

alter table public.member_favorite_restaurants enable row level security;
create policy member_favorite_restaurants_all_own on public.member_favorite_restaurants as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_feedback =====
create table public.member_feedback (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid(),
  member_email text,
  topic text not null,
  message text not null,
  emailed boolean not null default false
);
alter table public.member_feedback add constraint member_feedback_message_check CHECK ((length(btrim(message)) > 0));
alter table public.member_feedback add constraint member_feedback_topic_check CHECK ((topic = ANY (ARRAY['suggest-hotel'::text, 'suggest-restaurant'::text, 'general'::text])));
alter table public.member_feedback add constraint member_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_feedback add constraint member_feedback_pkey PRIMARY KEY (id);
CREATE INDEX member_feedback_created_idx ON public.member_feedback USING btree (created_at DESC);
alter table public.member_feedback enable row level security;
create policy "members add own feedback" on public.member_feedback as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));

-- granted to authenticated: INSERT
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_profiles =====
create table public.member_profiles (
  user_id uuid not null,
  member_name text,
  email text,
  phone text,
  home_airport text,
  preferred_currency text,
  preferred_hotel_styles text[] not null default '{}'::text[],
  preferred_airlines text[] not null default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  birthday date,
  marketing_emails_opt_in boolean not null default false,
  marketing_emails_consented_at timestamp with time zone
);
alter table public.member_profiles add constraint member_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_profiles add constraint member_profiles_pkey PRIMARY KEY (user_id);

alter table public.member_profiles enable row level security;
create policy member_profiles_delete_own on public.member_profiles as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy member_profiles_insert_own on public.member_profiles as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy member_profiles_select_own on public.member_profiles as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy member_profiles_update_own on public.member_profiles as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
CREATE TRIGGER set_updated_at_member_profiles BEFORE UPDATE ON public.member_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_reviews =====
create table public.member_reviews (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  review_type text not null,
  target_directus_id text,
  target_label text not null,
  overall_rating integer,
  service_rating integer,
  design_rating integer,
  food_rating integer,
  location_rating integer,
  value_rating integer,
  comments text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  date_visited date
);
alter table public.member_reviews add constraint member_reviews_design_rating_check CHECK (((design_rating >= 1) AND (design_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_food_rating_check CHECK (((food_rating >= 1) AND (food_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_location_rating_check CHECK (((location_rating >= 1) AND (location_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_overall_rating_check CHECK (((overall_rating >= 1) AND (overall_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_review_type_check CHECK ((review_type = ANY (ARRAY['hotel'::text, 'restaurant'::text])));
alter table public.member_reviews add constraint member_reviews_service_rating_check CHECK (((service_rating >= 1) AND (service_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_value_rating_check CHECK (((value_rating >= 1) AND (value_rating <= 5)));
alter table public.member_reviews add constraint member_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_reviews add constraint member_reviews_pkey PRIMARY KEY (id);

alter table public.member_reviews enable row level security;
create policy member_reviews_all_own on public.member_reviews as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
CREATE TRIGGER set_updated_at_member_reviews BEFORE UPDATE ON public.member_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_trip_flights =====
create table public.member_trip_flights (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  trip_id uuid not null,
  external_flight_id text,
  route text,
  timing text,
  cabin text,
  status text,
  thumbnail text,
  depart_at timestamp with time zone,
  arrive_at timestamp with time zone,
  has_overlap_warning boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  price_amount numeric,
  price_currency text,
  adults integer,
  kids integer,
  destination_arrive_at timestamp with time zone,
  return_depart_at timestamp with time zone,
  segments jsonb
);
alter table public.member_trip_flights add constraint member_trip_flights_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES member_trips(id) ON DELETE CASCADE;
alter table public.member_trip_flights add constraint member_trip_flights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_trip_flights add constraint member_trip_flights_pkey PRIMARY KEY (id);

alter table public.member_trip_flights enable row level security;
create policy member_trip_flights_all_own on public.member_trip_flights as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM member_trips t
  WHERE ((t.id = member_trip_flights.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE TRIGGER set_updated_at_member_trip_flights BEFORE UPDATE ON public.member_trip_flights FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_trip_hotels =====
create table public.member_trip_hotels (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  trip_id uuid not null,
  hotel_directus_id text not null,
  hotel_name text,
  location text,
  stay_label text,
  status text,
  thumbnail text,
  check_in date,
  check_out date,
  has_overlap_warning boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  room_selection jsonb,
  price_amount numeric,
  price_currency text,
  rooms integer,
  adults integer,
  kids integer,
  children_ages jsonb
);
alter table public.member_trip_hotels add constraint member_trip_hotels_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES member_trips(id) ON DELETE CASCADE;
alter table public.member_trip_hotels add constraint member_trip_hotels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_trip_hotels add constraint member_trip_hotels_pkey PRIMARY KEY (id);

alter table public.member_trip_hotels enable row level security;
create policy member_trip_hotels_all_own on public.member_trip_hotels as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM member_trips t
  WHERE ((t.id = member_trip_hotels.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE TRIGGER set_updated_at_member_trip_hotels BEFORE UPDATE ON public.member_trip_hotels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_trip_restaurants =====
create table public.member_trip_restaurants (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  trip_id uuid not null,
  restaurant_directus_id text not null,
  restaurant_name text,
  location text,
  reservation_label text,
  status text,
  thumbnail text,
  reservation_at timestamp with time zone,
  has_overlap_warning boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.member_trip_restaurants add constraint member_trip_restaurants_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES member_trips(id) ON DELETE CASCADE;
alter table public.member_trip_restaurants add constraint member_trip_restaurants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_trip_restaurants add constraint member_trip_restaurants_pkey PRIMARY KEY (id);

alter table public.member_trip_restaurants enable row level security;
create policy member_trip_restaurants_all_own on public.member_trip_restaurants as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM member_trips t
  WHERE ((t.id = member_trip_restaurants.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE TRIGGER set_updated_at_member_trip_restaurants BEFORE UPDATE ON public.member_trip_restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

-- ===== member_trips =====
create table public.member_trips (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  destination text,
  period_label text,
  travelers_label text,
  status text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.member_trips add constraint member_trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.member_trips add constraint member_trips_pkey PRIMARY KEY (id);

alter table public.member_trips enable row level security;
create policy member_trips_all_own on public.member_trips as PERMISSIVE for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
CREATE TRIGGER set_updated_at_member_trips BEFORE UPDATE ON public.member_trips FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- granted to anon: DELETE, INSERT, SELECT, UPDATE
-- granted to authenticated: DELETE, INSERT, SELECT, UPDATE
-- granted to service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE


-- ===== functions (public) =====
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- ===== triggers on auth.users =====
-- none

-- ===== custom roles =====
-- role concierge_log_reader (login: f)
