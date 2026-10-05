-- Member feedback / suggestions: kept as well as e-mailed (Ulrik, 2026-10-05).
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (ref hrlvtzcapsqkgrcawluf - not the Hotel database; see CLAUDE.md §31), like
-- 2026-09-30-member-book-clicks.sql. Until it runs, /api/email/feedback still
-- sends the e-mail and logs "[feedback] store failed" on the server; the member
-- sees no difference.
--
-- Until now a submission was only an e-mail to the SMTP_USER mailbox, so a
-- failed send lost it. The route now writes this row whether or not the e-mail
-- goes out, and `emailed` says which. `member_email` is the login address at
-- the time of writing - the Reply-To of the e-mail - so a row can be answered
-- even when the mail never arrived, or after the member changes address.

create table if not exists public.member_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_email text,
  topic text not null check (topic in ('suggest-hotel', 'suggest-restaurant', 'general')),
  message text not null check (length(btrim(message)) > 0),
  emailed boolean not null default false
);

create index if not exists member_feedback_created_idx
  on public.member_feedback (created_at desc);

-- A member can add their own feedback and nothing else: no reading back, no
-- editing. You read it in the dashboard (Table Editor), which bypasses RLS.
alter table public.member_feedback enable row level security;
revoke all on public.member_feedback from anon, authenticated;
grant insert on public.member_feedback to authenticated;

drop policy if exists "members add own feedback" on public.member_feedback;
create policy "members add own feedback"
  on public.member_feedback for insert to authenticated
  with check (user_id = auth.uid());
