alter table public.processing_jobs
  add column if not exists progress_percent integer not null default 10 check (progress_percent between 0 and 100),
  add column if not exists current_step text default 'uploaded',
  add column if not exists safe_logs jsonb not null default '[]'::jsonb,
  add column if not exists processing_mode text not null default 'full'
    check (processing_mode in ('full','topic_tags','marking_scheme_links','embeddings'));

alter table public.question_index
  add column if not exists question_type text,
  add column if not exists review_status text not null default 'needs_review'
    check (review_status in ('verified','needs_review','rejected'));

alter table public.processing_jobs drop constraint if exists processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check check (status in (
  'uploaded','extracting','indexing','completed','failed',
  'extracting_text','rendering_pages','detecting_metadata','splitting_questions',
  'tagging_topics','linking_marking_scheme','creating_embeddings','updating_analytics',
  'needs_manual_review'
));

create table if not exists public.resource_chunks (
  id bigserial primary key,
  resource_id bigint not null references public.resources(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level text,
  board text,
  year integer,
  session text,
  paper_code text,
  variant integer,
  chunk_type text not null,
  question_number text,
  title text,
  content text not null,
  page_number integer,
  topic text,
  subtopic text,
  marks integer,
  difficulty text,
  extracted_text text,
  embedding extensions.vector(768),
  source_page integer,
  source_reference text,
  metadata_json jsonb not null default '{}',
  ai_chunk_id bigint references public.ai_chunks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists resource_chunks_resource_idx on public.resource_chunks(resource_id,chunk_type);

create table if not exists public.topic_tagging_audits (
  id bigserial primary key,
  source_type text not null,
  source_id bigint not null,
  resource_id bigint references public.resources(id) on delete cascade,
  question_id bigint references public.question_index(id) on delete cascade,
  triggered_by uuid references auth.users(id) on delete set null,
  old_topic text,
  old_subtopic text,
  new_topic text,
  new_subtopic text,
  predicted_topic text,
  predicted_subtopic text,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  needs_review boolean not null default true,
  review_status text not null default 'needs_review' check (review_status in ('verified','needs_review','rejected')),
  raw_model_output jsonb,
  manual_correction boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists topic_tagging_audits_source_idx on public.topic_tagging_audits(source_type,source_id);

create table if not exists public.fine_tuning_examples (
  id bigserial primary key,
  task_type text not null,
  subject_id bigint references public.subjects(id) on delete set null,
  input_json jsonb not null,
  ideal_output_json jsonb not null,
  quality_status text not null default 'candidate' check (quality_status in ('candidate','approved','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.resource_chunks enable row level security;
alter table public.topic_tagging_audits enable row level security;
alter table public.fine_tuning_examples enable row level security;

create policy "Approved resource chunks readable by students" on public.resource_chunks
  for select to authenticated using (
    exists(select 1 from public.resources r where r.id=resource_id and r.is_approved=true)
  );
create policy "Admins manage resource chunks" on public.resource_chunks for all to authenticated
  using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
create policy "Admins manage tagging audits" on public.topic_tagging_audits for all to authenticated
  using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
create policy "Admins manage training examples" on public.fine_tuning_examples for all to authenticated
  using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));

grant select on public.resource_chunks to authenticated;
grant select,insert,update,delete on public.resource_chunks,public.topic_tagging_audits,public.fine_tuning_examples to authenticated;
grant usage,select on sequence public.resource_chunks_id_seq,public.topic_tagging_audits_id_seq,public.fine_tuning_examples_id_seq to authenticated;
