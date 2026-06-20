alter table public.papers
  add column if not exists source_type text not null default 'QUESTION_PAPER'
    check (source_type in ('QUESTION_PAPER','MARK_SCHEME','EXAMINER_REPORT')),
  add column if not exists original_filename text,
  add column if not exists file_type text not null default 'application/pdf',
  add column if not exists file_size_bytes bigint,
  add column if not exists processing_error text;

alter table public.marking_schemes
  add column if not exists original_filename text,
  add column if not exists file_type text not null default 'application/pdf',
  add column if not exists file_size_bytes bigint,
  add column if not exists processing_error text;

alter table public.questions
  add column if not exists subtopic text,
  add column if not exists extracted_text text,
  add column if not exists ai_summary text;

create table if not exists public.uploads (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete set null,
  paper_id bigint references public.papers(id) on delete set null,
  source_type text not null check (source_type in ('QUESTION_PAPER','MARK_SCHEME','EXAMINER_REPORT','NOTE')),
  bucket text not null,
  storage_path text not null,
  original_filename text not null,
  file_type text not null default 'application/pdf',
  file_size_bytes bigint,
  status text not null default 'uploaded' check (status in ('uploading','uploaded','processing','processed','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.uploads enable row level security;
create policy "Uploads readable by owner or admin" on public.uploads for select to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));
create policy "Uploads manageable by admin" on public.uploads for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (exists (select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));

create index if not exists papers_subject_year_source_idx on public.papers(subject_id, year, source_type);
create index if not exists questions_paper_topic_idx on public.questions(paper_id, topic);
create index if not exists questions_year_idx on public.questions(year);
create index if not exists uploads_status_created_idx on public.uploads(status, created_at desc);

insert into storage.buckets (id,name,public) values ('examiner-reports','examiner-reports',false)
on conflict (id) do update set public=false;
create policy "Examiner reports readable by signed-in users" on storage.objects for select to authenticated
  using (bucket_id='examiner-reports');
create policy "Examiner reports manageable by admin users" on storage.objects for all to authenticated
  using (bucket_id='examiner-reports' and exists (select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (bucket_id='examiner-reports' and exists (select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));

grant select,insert,update,delete on public.uploads to authenticated;
grant usage,select on all sequences in schema public to authenticated;
