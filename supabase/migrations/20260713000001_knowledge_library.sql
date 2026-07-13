-- Knowledge Library redesign — collections hierarchy + granular processing stages.
--
-- SAFETY: 475 real resources and 761 real processing_jobs rows already exist in
-- production. Every change here is additive (new nullable columns / new tables);
-- nothing existing is renamed, dropped, or made non-null without a default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New resource_type values needed by the full Knowledge Library taxonomy.
--    (PAST_PAPER/MARKING_SCHEME/GRADE_THRESHOLD/EXAMINER_REPORT already exist
--    and are in real use — untouched.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources add constraint resources_resource_type_check check (resource_type in (
  'PAST_PAPER','MARKING_SCHEME','GRADE_THRESHOLD','EXAMINER_REPORT','INSERT','SOURCE_FILE',
  'NOTES','WORKSHEET','TEST','TOPICAL','SYLLABUS','OTHER',
  'TEACHER_NOTES','PRIVATE_GUIDE','FORMULA_SHEET','BOOK','FLASHCARDS','AI_NOTES','VIDEO',
  -- Knowledge Library additions:
  'SPECIMEN_PAPER','LESSON_PLAN','SLIDES'
));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Collections — the fixed Knowledge Library hierarchy. Every resource_type
--    auto-maps to exactly one collection (resource_type_collection_map), so
--    filing is automatic; admins may still move a resource via collection_id.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.knowledge_collections (
  id          bigserial primary key,
  key         text not null unique,
  parent_key  text references public.knowledge_collections(key) on delete cascade,
  name        text not null,
  icon        text,
  sort_order  integer not null default 0,
  is_system   boolean not null default true
);

insert into public.knowledge_collections (key, parent_key, name, icon, sort_order) values
  ('cambridge',        null,        'Cambridge Resources',  'graduation-cap', 1),
  ('cambridge.papers',       'cambridge', 'Past Papers',           'file-text',      1),
  ('cambridge.schemes',      'cambridge', 'Mark Schemes',          'check-square',   2),
  ('cambridge.reports',      'cambridge', 'Examiner Reports',      'message-square', 3),
  ('cambridge.thresholds',   'cambridge', 'Grade Thresholds',      'bar-chart',      4),
  ('cambridge.specimen',     'cambridge', 'Specimen Papers',       'file-plus',      5),

  ('teacher',           null,        'Teacher Resources',    'user-check',     2),
  ('teacher.notes',          'teacher',   'Teacher Notes',         'sticky-note',    1),
  ('teacher.guides',         'teacher',   'Private Teaching Guides','lock',          2),
  ('teacher.lessons',        'teacher',   'Lesson Plans',          'calendar',       3),
  ('teacher.formulas',       'teacher',   'Formula Sheets',        'sigma',          4),
  ('teacher.books',          'teacher',   'Books',                 'book',           5),
  ('teacher.slides',         'teacher',   'Slides',                'presentation',   6),

  ('student',           null,        'Student Resources',    'users',          3),
  ('student.notes',          'student',   'Notes',                 'file-text',      1),
  ('student.flashcards',     'student',   'Flashcards',            'layers',         2),
  ('student.worksheets',     'student',   'Worksheets',            'edit-3',         3),
  ('student.tests',          'student',   'Practice Tests',        'clipboard-check',4),

  ('videos',            null,        'Videos',                'video',          4),
  ('other',             null,        'Other',                 'folder',         5)
on conflict (key) do nothing;

create table if not exists public.resource_type_collection_map (
  resource_type   text primary key,
  collection_key  text not null references public.knowledge_collections(key) on delete restrict
);

insert into public.resource_type_collection_map (resource_type, collection_key) values
  ('PAST_PAPER',      'cambridge.papers'),
  ('MARKING_SCHEME',  'cambridge.schemes'),
  ('EXAMINER_REPORT', 'cambridge.reports'),
  ('GRADE_THRESHOLD', 'cambridge.thresholds'),
  ('SPECIMEN_PAPER',  'cambridge.specimen'),
  ('INSERT',          'cambridge.papers'),
  ('TOPICAL',         'cambridge.papers'),
  ('SYLLABUS',        'cambridge'),

  ('TEACHER_NOTES',   'teacher.notes'),
  ('PRIVATE_GUIDE',   'teacher.guides'),
  ('LESSON_PLAN',     'teacher.lessons'),
  ('FORMULA_SHEET',   'teacher.formulas'),
  ('BOOK',            'teacher.books'),
  ('SLIDES',          'teacher.slides'),

  ('NOTES',           'student.notes'),
  ('AI_NOTES',        'student.notes'),
  ('FLASHCARDS',      'student.flashcards'),
  ('WORKSHEET',       'student.worksheets'),
  ('TEST',            'student.tests'),

  ('VIDEO',           'videos'),
  ('SOURCE_FILE',     'other'),
  ('OTHER',           'other')
on conflict (resource_type) do nothing;

alter table public.resources
  add column if not exists collection_id bigint references public.knowledge_collections(id) on delete set null;

-- Auto-assign collection on insert/type-change unless the admin already set one explicitly.
create or replace function public.assign_resource_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection_id is null then
    select kc.id into new.collection_id
    from public.resource_type_collection_map map
    join public.knowledge_collections kc on kc.key = map.collection_key
    where map.resource_type = new.resource_type;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_resource_collection_before_write on public.resources;
create trigger assign_resource_collection_before_write
before insert or update of resource_type on public.resources
for each row execute function public.assign_resource_collection();

-- Backfill collection_id for the 475 resources already in production.
update public.resources r
set collection_id = kc.id
from public.resource_type_collection_map map
join public.knowledge_collections kc on kc.key = map.collection_key
where map.resource_type = r.resource_type and r.collection_id is null;

create index if not exists resources_collection_idx on public.resources (collection_id);

alter table public.knowledge_collections enable row level security;
alter table public.resource_type_collection_map enable row level security;
create policy "knowledge_collections_read" on public.knowledge_collections for select using (true);
create policy "resource_type_collection_map_read" on public.resource_type_collection_map for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Granular processing pipeline stages. Additive: existing 761 rows keep
--    stage = null (meaning "processed under the old coarse-status pipeline");
--    new runs populate it at every real step so the UI can show live progress.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.processing_jobs
  add column if not exists stage text
    check (stage is null or stage in (
      'reading_pdf','ocr','extracting_questions','finding_metadata',
      'matching_mark_scheme','topic_classification','embedding',
      'knowledge_graph','training_dataset','completed'
    )),
  add column if not exists stage_detail jsonb not null default '{}'::jsonb;

create index if not exists processing_jobs_stage_idx on public.processing_jobs (stage) where stage is not null;
