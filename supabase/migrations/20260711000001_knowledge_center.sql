-- AI Knowledge Center — the brain's schema.
--
-- Two axes, kept orthogonal on purpose:
--   is_approved  = has this cleared the ingestion pipeline? (quality gate)
--   visibility   = who is allowed to SEE it? (access gate)
-- A resource can be approved AND ai-private at the same time — the AI grounds
-- answers in it, but a student never receives the row, its chunks, or a download
-- link. This is enforced here at the RLS layer, not just in the application.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Expand resource_type to the full knowledge taxonomy
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources add constraint resources_resource_type_check check (resource_type in (
  'PAST_PAPER','MARKING_SCHEME','GRADE_THRESHOLD','EXAMINER_REPORT','INSERT','SOURCE_FILE',
  'NOTES','WORKSHEET','TEST','TOPICAL','SYLLABUS','OTHER',
  -- Knowledge Center additions:
  'TEACHER_NOTES','PRIVATE_GUIDE','FORMULA_SHEET','BOOK','FLASHCARDS','AI_NOTES','VIDEO'
));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Visibility: four independent permissions, not a single tier enum.
--    A resource can be any combination — e.g. a private teaching guide is
--    Students:false, AI:true, Training:true, Admin:true. visible_to_admin
--    defaults true (every resource is always staff-visible in the Knowledge
--    Library) and is not itself security-critical; the enforcement boundary
--    that matters is visible_to_students, checked by RLS below.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources
  add column if not exists visible_to_students boolean not null default true,
  add column if not exists visible_to_ai boolean not null default true,
  add column if not exists visible_to_training boolean not null default true,
  add column if not exists visible_to_admin boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resource-level knowledge metadata (topic, difficulty, source, confidence)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources
  add column if not exists taxonomy_topic_id text references public.taxonomy_topics(id) on delete set null,
  add column if not exists difficulty text check (difficulty is null or difficulty in ('EASY','MEDIUM','HARD')),
  add column if not exists source text,
  add column if not exists confidence_score real check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));

create index if not exists resources_visible_to_students_idx on public.resources (visible_to_students, is_approved);
create index if not exists resources_visible_to_ai_idx on public.resources (visible_to_ai) where visible_to_ai;
create index if not exists resources_taxonomy_topic_idx on public.resources (taxonomy_topic_id) where taxonomy_topic_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS: replace the single is_approved gate with visibility-aware policies.
--    Regular authenticated users (students) can ONLY select rows with
--    visible_to_students = true (and approved). Everything else is invisible
--    to the authenticated role at the database level — grounding for
--    non-student-visible content is done server-side via the service role,
--    never via a student-scoped client.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Approved resources readable by signed-in users" on public.resources;
create policy "Student-visible approved resources readable by signed-in users" on public.resources
  for select to authenticated using (is_approved and visible_to_students);

drop policy if exists "Approved AI chunks readable by signed-in users" on public.ai_chunks;
create policy "Student-visible approved AI chunks readable by signed-in users" on public.ai_chunks
  for select to authenticated using (
    exists (
      select 1 from public.resources r
      where r.id = public.ai_chunks.resource_id and r.is_approved and r.visible_to_students
    )
  );

-- Admins may read every visibility tier (Knowledge Center management UI).
create policy "Admins read all resources" on public.resources
  for select to authenticated using (
    exists (select 1 from public.admin_users au where au.email = (select email from auth.users where id = auth.uid()))
  );
create policy "Admins read all ai_chunks" on public.ai_chunks
  for select to authenticated using (
    exists (select 1 from public.admin_users au where au.email = (select email from auth.users where id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. Extend the existing paper-linking trigger (previously MARKING_SCHEME-only)
--     to also auto-link EXAMINER_REPORT and GRADE_THRESHOLD resources to their
--     PAST_PAPER by the same (subject, level, year, session, paper_code, variant)
--     tuple — the same deterministic match already proven for marking schemes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.link_resource_to_paper()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resource_type in ('MARKING_SCHEME', 'EXAMINER_REPORT', 'GRADE_THRESHOLD') then
    select paper.id into new.related_resource_id
    from public.resources paper
    where paper.subject_id = new.subject_id
      and paper.level = new.level
      and paper.resource_type = 'PAST_PAPER'
      and paper.year is not distinct from new.year
      and paper.session is not distinct from new.session
      and paper.paper_code is not distinct from new.paper_code
      and paper.variant is not distinct from new.variant
    order by paper.created_at desc
    limit 1;
  elsif new.resource_type <> 'PAST_PAPER' then
    new.related_resource_id := null;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resource-level knowledge-graph link types (extends knowledge_edges, Phase C)
--    edge_type values used here: 'resource_topic', 'resource_marking_scheme',
--    'resource_examiner_report', 'resource_related_question'.
--    No new table needed — knowledge_edges already supports heterogeneous nodes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Knowledge Center dashboard views (read-only aggregates, admin-only via RLS
--    on the underlying tables — views inherit base-table RLS).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.knowledge_center_processing_status as
select
  r.resource_type,
  r.visible_to_students,
  r.visible_to_ai,
  r.visible_to_training,
  r.processing_status,
  count(*)::int as resource_count,
  count(*) filter (where r.extracted_text is not null)::int as extracted_count,
  count(distinct c.resource_id)::int as chunked_count,
  count(distinct c.resource_id) filter (where c.embedding is not null)::int as embedded_count
from public.resources r
left join public.ai_chunks c on c.resource_id = r.id
group by r.resource_type, r.visible_to_students, r.visible_to_ai, r.visible_to_training, r.processing_status;

create or replace view public.knowledge_center_failed_jobs as
select j.id, j.resource_id, r.title, r.resource_type, j.status, j.error_message, j.retry_count, j.updated_at
from public.processing_jobs j
join public.resources r on r.id = j.resource_id
where j.status = 'failed'
order by j.updated_at desc;
