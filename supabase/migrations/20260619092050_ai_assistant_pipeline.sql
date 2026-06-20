-- First production RAG slice: O-Level Physics (5054), 2024, Paper 1.
-- The schema is reusable, while the API initially enforces this single test scope.

create extension if not exists vector with schema extensions;

alter table public.papers
  add column if not exists level public.study_level,
  add column if not exists subject_code text,
  add column if not exists storage_path text,
  add column if not exists ingestion_status text not null default 'pending',
  add column if not exists raw_text text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.questions
  add column if not exists paper_id bigint references public.papers(id) on delete cascade,
  add column if not exists question_number text,
  add column if not exists source_page integer,
  add column if not exists extracted_metadata jsonb not null default '{}';

create unique index if not exists questions_paper_number_idx
  on public.questions (paper_id, question_number)
  where paper_id is not null and question_number is not null;

create table if not exists public.marking_schemes (
  id bigserial primary key,
  paper_id bigint not null unique references public.papers(id) on delete cascade,
  storage_path text not null,
  raw_text text,
  ingestion_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topics (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create table if not exists public.question_topics (
  question_id bigint not null references public.questions(id) on delete cascade,
  topic_id bigint not null references public.topics(id) on delete cascade,
  confidence numeric(4, 3),
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  primary key (question_id, topic_id)
);

create table if not exists public.document_chunks (
  id bigserial primary key,
  source_type text not null check (source_type in ('question', 'marking_scheme', 'note')),
  paper_id bigint references public.papers(id) on delete cascade,
  question_id bigint references public.questions(id) on delete cascade,
  marking_scheme_id bigint references public.marking_schemes(id) on delete cascade,
  note_id bigint references public.notes(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level public.study_level not null,
  year integer,
  session public.paper_session,
  paper_number integer,
  question_number text,
  content text not null,
  metadata jsonb not null default '{}',
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  check (num_nonnulls(question_id, marking_scheme_id, note_id) = 1)
);

create index if not exists document_chunks_filter_idx
  on public.document_chunks (subject_id, level, year, paper_number);

create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists document_chunks_search_idx
  on public.document_chunks using gin (to_tsvector('english', content));

create table if not exists public.chat_messages (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  paper_id bigint references public.papers(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_subject_idx
  on public.chat_messages (user_id, subject_id, created_at);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  filter_subject_id bigint,
  filter_level public.study_level,
  filter_year integer default null,
  filter_paper_id bigint default null,
  match_count integer default 8
)
returns table (
  id bigint,
  source_type text,
  paper_id bigint,
  question_id bigint,
  question_number text,
  year integer,
  session public.paper_session,
  paper_number integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    dc.id, dc.source_type, dc.paper_id, dc.question_id,
    dc.question_number, dc.year, dc.session, dc.paper_number,
    dc.content, dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and dc.subject_id = filter_subject_id
    and dc.level = filter_level
    and (filter_year is null or dc.year = filter_year)
    and (filter_paper_id is null or dc.paper_id = filter_paper_id)
  order by dc.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

create or replace function public.search_document_chunks(
  query_text text,
  filter_subject_id bigint,
  filter_level public.study_level,
  filter_year integer default null,
  filter_paper_id bigint default null,
  match_count integer default 8
)
returns table (
  id bigint,
  source_type text,
  paper_id bigint,
  question_id bigint,
  question_number text,
  year integer,
  session public.paper_session,
  paper_number integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    dc.id, dc.source_type, dc.paper_id, dc.question_id,
    dc.question_number, dc.year, dc.session, dc.paper_number,
    dc.content, dc.metadata,
    ts_rank_cd(to_tsvector('english', dc.content), websearch_to_tsquery('english', query_text))::double precision
  from public.document_chunks dc
  where dc.subject_id = filter_subject_id
    and dc.level = filter_level
    and (filter_year is null or dc.year = filter_year)
    and (filter_paper_id is null or dc.paper_id = filter_paper_id)
    and to_tsvector('english', dc.content) @@ websearch_to_tsquery('english', query_text)
  order by 11 desc
  limit greatest(1, least(match_count, 20));
$$;

alter table public.marking_schemes enable row level security;
alter table public.topics enable row level security;
alter table public.question_topics enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_messages enable row level security;

create policy "Marking schemes readable by signed-in users" on public.marking_schemes
  for select to authenticated using (true);
create policy "Topics readable by signed-in users" on public.topics
  for select to authenticated using (true);
create policy "Question topics readable by signed-in users" on public.question_topics
  for select to authenticated using (true);
create policy "Document chunks readable by signed-in users" on public.document_chunks
  for select to authenticated using (true);
create policy "Chat messages readable by owner" on public.chat_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "Chat messages insertable by owner" on public.chat_messages
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Chat messages deletable by owner" on public.chat_messages
  for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values
  ('papers', 'papers', false),
  ('marking-schemes', 'marking-schemes', false),
  ('notes', 'notes', false)
on conflict (id) do update set public = false;

create policy "Marking scheme files readable by signed-in users"
  on storage.objects for select to authenticated
  using (bucket_id = 'marking-schemes');
create policy "Note files readable by signed-in users"
  on storage.objects for select to authenticated
  using (bucket_id = 'notes');

create policy "Marking scheme files manageable by admin users"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'marking-schemes'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  )
  with check (
    bucket_id = 'marking-schemes'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  );

create policy "Note files manageable by admin users"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'notes'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  )
  with check (
    bucket_id = 'notes'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  );

grant select on public.marking_schemes, public.topics, public.question_topics, public.document_chunks to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant execute on function public.match_document_chunks(extensions.vector, bigint, public.study_level, integer, bigint, integer) to authenticated, service_role;
grant execute on function public.search_document_chunks(text, bigint, public.study_level, integer, bigint, integer) to authenticated, service_role;
