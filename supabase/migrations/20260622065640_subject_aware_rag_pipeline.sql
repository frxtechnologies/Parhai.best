alter table public.subjects
  add column if not exists board text not null default 'CAMBRIDGE';

alter table public.resources
  add column if not exists board text not null default 'CAMBRIDGE',
  add column if not exists is_approved boolean not null default true;

create or replace function public.sync_resource_subject_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select s.level::text, s.board into new.level, new.board
  from public.subjects s where s.id = new.subject_id;
  if not found then raise exception 'Subject % does not exist', new.subject_id; end if;
  return new;
end;
$$;
revoke all on function public.sync_resource_subject_scope() from public, anon, authenticated;
drop trigger if exists sync_resource_subject_scope_before_write on public.resources;
create trigger sync_resource_subject_scope_before_write
before insert or update of subject_id on public.resources
for each row execute function public.sync_resource_subject_scope();

create table if not exists public.question_index (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete cascade,
  year integer check (year is null or year between 1990 and 2100),
  session text,
  paper_code text,
  variant integer check (variant is null or variant between 1 and 99),
  question_number text not null,
  topic text not null default 'Unclassified',
  subtopic text,
  difficulty text not null default 'MEDIUM' check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  marks integer check (marks is null or marks >= 0),
  question_text text not null,
  answer_text text,
  source_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, question_number)
);

create table if not exists public.processing_jobs (
  id bigserial primary key,
  resource_id bigint not null references public.resources(id) on delete cascade,
  status text not null default 'uploaded' check (status in ('uploaded', 'extracting', 'indexing', 'completed', 'failed')),
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  user_question text not null,
  ai_answer text not null,
  sources_used jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists question_index_subject_year_topic_idx
  on public.question_index(subject_id, year desc, topic, question_number);
create index if not exists question_index_resource_idx on public.question_index(resource_id);
create index if not exists question_index_search_idx on public.question_index
  using gin(to_tsvector('english', coalesce(topic, '') || ' ' || coalesce(subtopic, '') || ' ' || question_text || ' ' || coalesce(answer_text, '')));
create index if not exists processing_jobs_resource_created_idx on public.processing_jobs(resource_id, created_at desc);
create index if not exists processing_jobs_status_idx on public.processing_jobs(status, updated_at);
create index if not exists ai_chat_logs_user_subject_idx on public.ai_chat_logs(user_id, subject_id, created_at desc);

alter table public.question_index enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.ai_chat_logs enable row level security;

create policy "Approved question index readable by signed-in users" on public.question_index
  for select to authenticated using (
    exists (
      select 1 from public.resources r
      where r.id = public.question_index.resource_id
        and r.subject_id = public.question_index.subject_id
        and r.is_approved
    )
  );
create policy "Question index manageable by admin users" on public.question_index
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Processing jobs readable by admin users" on public.processing_jobs
  for select to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));
create policy "Processing jobs manageable by admin users" on public.processing_jobs
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "AI chat logs readable by owner" on public.ai_chat_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "AI chat logs insertable by owner" on public.ai_chat_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

grant select on public.question_index to authenticated;
grant select, insert, update, delete on public.question_index, public.processing_jobs to authenticated;
grant select, insert on public.ai_chat_logs to authenticated;
grant usage, select on sequence public.question_index_id_seq, public.processing_jobs_id_seq, public.ai_chat_logs_id_seq to authenticated;

create or replace function public.create_resource_processing_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.processing_jobs(resource_id, status) values (new.id, 'uploaded');
  return new;
end;
$$;

revoke all on function public.create_resource_processing_job() from public, anon, authenticated;
drop trigger if exists create_resource_processing_job_after_insert on public.resources;
create trigger create_resource_processing_job_after_insert
after insert on public.resources
for each row execute function public.create_resource_processing_job();

insert into public.processing_jobs(resource_id, status, created_at, updated_at)
select r.id,
  case r.processing_status when 'processed' then 'completed' when 'failed' then 'failed' when 'processing' then 'indexing' else 'uploaded' end,
  r.created_at,
  coalesce(r.updated_at, r.created_at)
from public.resources r
where not exists (select 1 from public.processing_jobs j where j.resource_id = r.id);

drop policy if exists "Resources readable by signed-in users" on public.resources;
create policy "Approved resources readable by signed-in users" on public.resources
  for select to authenticated using (is_approved);

drop policy if exists "AI chunks readable by signed-in users" on public.ai_chunks;
create policy "Approved AI chunks readable by signed-in users" on public.ai_chunks
  for select to authenticated using (
    exists (
      select 1 from public.resources r
      where r.id = public.ai_chunks.resource_id and r.is_approved
    )
  );

create or replace function public.match_ai_chunks(
  query_embedding extensions.vector(768),
  match_subject_id bigint,
  match_count integer default 12,
  match_threshold double precision default 0.25
)
returns table (id bigint, resource_id bigint, chunk_index integer, content text, metadata jsonb, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select c.id, c.resource_id, c.chunk_index, c.content, c.metadata,
    1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.ai_chunks c
  join public.resources r on r.id = c.resource_id
  where c.subject_id = match_subject_id
    and r.subject_id = match_subject_id
    and r.is_approved
    and c.embedding is not null
    and 1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by c.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;
