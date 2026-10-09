-- Export the MEMBERS project's schema as one block of SQL (2026-10-09).
--
-- Run in the Supabase Dashboard SQL Editor against the MEMBERS project (not
-- the Hotel database; see CLAUDE.md §31). It reads structure only - tables,
-- columns, constraints, indexes, row-level security, policies, grants,
-- triggers and functions - never a row of member data. It returns one row,
-- one cell (schema_dump): copy that cell.

with
tbl as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
cols as (
  select t.relname,
         string_agg(
           format('  %I %s%s%s',
                  a.attname,
                  format_type(a.atttypid, a.atttypmod),
                  case when a.attnotnull then ' not null' else '' end,
                  coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
           E',\n' order by a.attnum) as body
  from tbl t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  group by t.relname
),
cons as (
  select t.relname,
         string_agg(
           format('alter table public.%I add constraint %I %s;',
                  t.relname, co.conname, pg_get_constraintdef(co.oid)),
           E'\n' order by co.contype, co.conname) as body
  from tbl t
  join pg_constraint co on co.conrelid = t.oid
  group by t.relname
),
idx as (
  select tablename as relname,
         string_agg(indexdef || ';', E'\n' order by indexname) as body
  from pg_indexes
  where schemaname = 'public'
    and indexname not in (select conname from pg_constraint)
  group by tablename
),
pol as (
  select tablename as relname,
         string_agg(
           format('create policy %I on public.%I as %s for %s to %s%s%s;',
                  policyname, tablename, permissive, cmd,
                  array_to_string(roles, ', '),
                  coalesce(' using (' || qual || ')', ''),
                  coalesce(' with check (' || with_check || ')', '')),
           E'\n' order by policyname) as body
  from pg_policies
  where schemaname = 'public'
  group by tablename
),
grt as (
  select table_name as relname,
         string_agg(format('-- granted to %s: %s', grantee, privileges), E'\n' order by grantee) as body
  from (
    select table_name, grantee,
           string_agg(privilege_type, ', ' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee not in ('postgres', 'supabase_admin')
    group by table_name, grantee
  ) g
  group by table_name
),
trg as (
  select t.relname,
         string_agg(pg_get_triggerdef(tg.oid) || ';', E'\n') as body
  from tbl t
  join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
  group by t.relname
),
tables_sql as (
  select string_agg(
           format(E'-- ===== %s =====\ncreate table public.%I (\n%s\n);\n%s\n%s\nalter table public.%I %s row level security;%s\n%s\n%s\n%s\n',
                  t.relname, t.relname, c.body,
                  coalesce(cons.body, ''),
                  coalesce(idx.body, ''),
                  t.relname,
                  case when t.relrowsecurity then 'enable' else 'disable' end,
                  case when t.relforcerowsecurity
                       then E'\nalter table public.' || quote_ident(t.relname) || ' force row level security;'
                       else '' end,
                  coalesce(pol.body, '-- no policies'),
                  coalesce(trg.body, ''),
                  coalesce(grt.body, '')),
           E'\n' order by t.relname) as body
  from tbl t
  join cols c using (relname)
  left join cons using (relname)
  left join idx using (relname)
  left join pol using (relname)
  left join trg using (relname)
  left join grt using (relname)
),
functions_sql as (
  select string_agg(pg_get_functiondef(p.oid) || ';', E'\n') as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
auth_triggers_sql as (
  select string_agg(pg_get_triggerdef(oid) || ';', E'\n') as body
  from pg_trigger
  where tgrelid = 'auth.users'::regclass and not tgisinternal
),
roles_sql as (
  select string_agg(format('-- role %s (login: %s)', rolname, rolcanlogin), E'\n' order by rolname) as body
  from pg_roles
  where rolname not like 'pg\_%'
    and rolname not in ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator',
                        'dashboard_user', 'pgbouncer')
    and rolname not like 'supabase%'
)
select concat_ws(E'\n\n',
         '-- MEMBERS project schema export',
         (select body from tables_sql),
         E'-- ===== functions (public) =====\n' || coalesce((select body from functions_sql), '-- none'),
         E'-- ===== triggers on auth.users =====\n' || coalesce((select body from auth_triggers_sql), '-- none'),
         E'-- ===== custom roles =====\n' || coalesce((select body from roles_sql), '-- none')
       ) as schema_dump;
