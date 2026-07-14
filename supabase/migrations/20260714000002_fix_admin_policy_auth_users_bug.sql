-- Fix a real bug: 4 admin-check RLS policies added this session queried
-- auth.users directly ("select email from auth.users where id = auth.uid()"),
-- but the `authenticated` role has no SELECT grant on auth.users. Because
-- Postgres must evaluate EVERY permissive policy on a table to decide access,
-- one policy hitting "permission denied for table users" (42501) fails the
-- WHOLE query — even though a separate, correct policy would have
-- independently allowed the read. This broke every student-facing query
-- against resources/ai_chunks (surfaced as the dashboard's "Connect Supabase"
-- fallback, itself a second bug — see dashboard.tsx's describeError fix).
--
-- The established, working pattern already used elsewhere in this codebase
-- since the very first migration is auth.jwt() ->> 'email' — it reads the
-- email claim directly from the request JWT, no table access needed at all.

drop policy if exists "taxonomy_topics_admin_write" on public.taxonomy_topics;
create policy "taxonomy_topics_admin_write" on public.taxonomy_topics
  for all using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "knowledge_edges_admin_write" on public.knowledge_edges;
create policy "knowledge_edges_admin_write" on public.knowledge_edges
  for all using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "Admins read all resources" on public.resources;
create policy "Admins read all resources" on public.resources
  for select to authenticated using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "Admins read all ai_chunks" on public.ai_chunks;
create policy "Admins read all ai_chunks" on public.ai_chunks
  for select to authenticated using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );
