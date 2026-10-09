-- Drop the passport columns from travelling companions (Ulrik, 2026-10-09).
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project
-- (not the Hotel database; see CLAUDE.md §31).
--
-- member_family_members carried passport_number and passport_expiry. No code
-- reads or writes them, and holding passport numbers (often children's) is a
-- liability with no use. Any values in them are deleted with the columns.

alter table public.member_family_members
  drop column if exists passport_number,
  drop column if exists passport_expiry;

-- PostgREST caches the schema; this makes the change visible at once.
notify pgrst, 'reload schema';
