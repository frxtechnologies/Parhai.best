alter table public.subjects
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.resources (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  title text not null,
  resource_type text not null check (resource_type in ('PAST_PAPER', 'MARKING_SCHEME', 'NOTES', 'SYLLABUS', 'WORKSHEET')),
  year integer check (year is null or year between 1990 and 2100),
  session text check (session is null or session in ('MAY_JUNE', 'OCT_NOV', 'FEB_MAR')),
  paper_code text,
  variant integer check (variant is null or variant between 1 and 99),
  bucket text not null default 'resources',
  storage_path text not null unique,
  original_filename text not null,
  file_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  extracted_text text,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed')),
  processing_error text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chunks (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(content) > 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (resource_id, chunk_index)
);

create index if not exists resources_subject_type_year_idx on public.resources(subject_id, resource_type, year desc);
create index if not exists resources_processing_idx on public.resources(processing_status, created_at desc);
create index if not exists ai_chunks_subject_resource_idx on public.ai_chunks(subject_id, resource_id, chunk_index);
create index if not exists ai_chunks_search_idx on public.ai_chunks using gin(to_tsvector('english', content));

alter table public.resources enable row level security;
alter table public.ai_chunks enable row level security;

create policy "Resources readable by signed-in users" on public.resources
  for select to authenticated using (true);
create policy "Resources manageable by admin users" on public.resources
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "AI chunks readable by signed-in users" on public.ai_chunks
  for select to authenticated using (true);
create policy "AI chunks manageable by admin users" on public.ai_chunks
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Subjects manageable by admin users" on public.subjects
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', false, 52428800, array['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Resource files readable by signed-in users" on storage.objects
  for select to authenticated using (bucket_id = 'resources');
create policy "Resource files manageable by admin users" on storage.objects
  for all to authenticated
  using (bucket_id = 'resources' and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (bucket_id = 'resources' and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

grant select on public.resources, public.ai_chunks to authenticated;
grant insert, update, delete on public.resources, public.ai_chunks to authenticated;
grant usage, select on sequence public.resources_id_seq, public.ai_chunks_id_seq to authenticated;
