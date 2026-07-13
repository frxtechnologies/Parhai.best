-- Phase C: Knowledge Graph.
-- A generic edge store materializing relationships that were previously implicit
-- or required an API call. The first materialized edge type is 'related_question'
-- (nearest neighbours via the F18 question embeddings), turning "show me similar
-- questions" and "frequently tested concepts" into cheap graph lookups.
--
-- Text src_id/dst_id let one table hold heterogeneous nodes (question ids as text,
-- taxonomy topic ids) without per-relationship tables.
create table if not exists public.knowledge_edges (
  id          bigserial primary key,
  subject_id  bigint references public.subjects(id) on delete cascade,
  edge_type   text not null,        -- 'related_question' | 'has_topic' | ...
  src_type    text not null,        -- 'question' | 'topic'
  src_id      text not null,
  dst_type    text not null,
  dst_id      text not null,
  weight      real,                 -- similarity for related_question
  created_at  timestamptz not null default now(),
  unique (edge_type, src_id, dst_id)
);

create index if not exists knowledge_edges_src_idx on public.knowledge_edges (edge_type, src_id);
create index if not exists knowledge_edges_subject_type_idx on public.knowledge_edges (subject_id, edge_type);

alter table public.knowledge_edges enable row level security;

drop policy if exists "knowledge_edges_read" on public.knowledge_edges;
create policy "knowledge_edges_read" on public.knowledge_edges
  for select using (true);
drop policy if exists "knowledge_edges_admin_write" on public.knowledge_edges;
create policy "knowledge_edges_admin_write" on public.knowledge_edges
  for all using (
    exists (select 1 from public.admin_users au
            where au.email = (select email from auth.users where id = auth.uid()))
  );
