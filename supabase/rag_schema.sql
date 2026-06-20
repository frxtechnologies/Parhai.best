-- Parhai RAG and AI assistant schema.
-- Requires pgvector for semantic search.

create extension if not exists vector with schema extensions;

create table if not exists public.past_papers (
  id bigserial primary key,
  level public.study_level not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  subject_name text not null,
  subject_code text not null,
  year integer not null,
  session public.paper_session not null,
  paper_number integer not null,
  variant integer,
  type public.paper_type not null,
  file_url text,
  marking_scheme_url text,
  topic_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.paper_chunks (
  id bigserial primary key,
  paper_id bigint not null references public.past_papers(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level public.study_level not null,
  year integer not null,
  session public.paper_session not null,
  paper_number integer not null,
  variant integer,
  chunk_text text not null,
  chunk_index integer not null,
  page_number integer,
  topic_tags text[] not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists public.note_chunks (
  id bigserial primary key,
  note_id bigint not null references public.notes(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level public.study_level not null,
  chunk_text text not null,
  chunk_index integer not null,
  topic_tags text[] not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete set null,
  level public.study_level,
  message text not null,
  ai_response text not null,
  sources_used jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  subject_id bigint references public.subjects(id) on delete cascade,
  level public.study_level,
  title text not null,
  topic text,
  questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id bigserial primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]',
  score numeric,
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level public.study_level not null,
  papers_completed integer not null default 0,
  questions_attempted integer not null default 0,
  questions_correct integer not null default 0,
  notes_read integer not null default 0,
  hours_studied numeric not null default 0,
  weak_topics text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id)
);

create index if not exists paper_chunks_embedding_idx
  on public.paper_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists note_chunks_embedding_idx
  on public.note_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_paper_chunks(
  query_embedding vector(1536),
  match_count integer default 6,
  filter_level public.study_level default null,
  filter_subject_id bigint default null,
  filter_paper_id bigint default null
)
returns table (
  id bigint,
  paper_id bigint,
  subject_id bigint,
  level public.study_level,
  year integer,
  session public.paper_session,
  paper_number integer,
  variant integer,
  chunk_text text,
  page_number integer,
  topic_tags text[],
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    pc.id,
    pc.paper_id,
    pc.subject_id,
    pc.level,
    pc.year,
    pc.session,
    pc.paper_number,
    pc.variant,
    pc.chunk_text,
    pc.page_number,
    pc.topic_tags,
    1 - (pc.embedding <=> query_embedding) as similarity
  from public.paper_chunks pc
  where pc.embedding is not null
    and (filter_level is null or pc.level = filter_level)
    and (filter_subject_id is null or pc.subject_id = filter_subject_id)
    and (filter_paper_id is null or pc.paper_id = filter_paper_id)
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.past_papers enable row level security;
alter table public.paper_chunks enable row level security;
alter table public.note_chunks enable row level security;
alter table public.ai_chat_history enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.student_progress enable row level security;

create policy "Past papers readable by signed-in users" on public.past_papers
  for select to authenticated using (true);

create policy "Paper chunks readable by signed-in users" on public.paper_chunks
  for select to authenticated using (true);

create policy "Note chunks readable by signed-in users" on public.note_chunks
  for select to authenticated using (true);

create policy "AI chat readable by owner" on public.ai_chat_history
  for select to authenticated using (auth.uid() = user_id);

create policy "AI chat insertable by owner" on public.ai_chat_history
  for insert to authenticated with check (auth.uid() = user_id);

create policy "AI chat deletable by owner" on public.ai_chat_history
  for delete to authenticated using (auth.uid() = user_id);

create policy "Quizzes readable by owner" on public.quizzes
  for select to authenticated using (user_id is null or auth.uid() = user_id);

create policy "Quiz attempts readable by owner" on public.quiz_attempts
  for select to authenticated using (auth.uid() = user_id);

create policy "Quiz attempts insertable by owner" on public.quiz_attempts
  for insert to authenticated with check (auth.uid() = user_id);

create policy "Progress readable by owner" on public.student_progress
  for select to authenticated using (auth.uid() = user_id);

create policy "Progress writable by owner" on public.student_progress
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Past papers manageable by admin users" on public.past_papers
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Paper chunks manageable by admin users" on public.paper_chunks
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Note chunks manageable by admin users" on public.note_chunks
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));
