create table if not exists public.subject_code_map (
  subject_code text primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_code ~ '^[0-9]{4}$')
);

create table if not exists public.admin_import_batches (
  id bigserial primary key,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'previewed' check (status in ('previewed','importing','completed','completed_with_errors','failed')),
  total_files integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  failed_count integer not null default 0,
  needs_review_count integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.resources
  add column if not exists file_hash text,
  add column if not exists import_batch_id bigint references public.admin_import_batches(id) on delete set null,
  add column if not exists paper_number integer,
  add column if not exists detection_confidence integer,
  add column if not exists import_warning text;

alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources add constraint resources_resource_type_check check (resource_type in (
  'PAST_PAPER','MARKING_SCHEME','GRADE_THRESHOLD','EXAMINER_REPORT','INSERT','SOURCE_FILE',
  'NOTES','WORKSHEET','TEST','TOPICAL','SYLLABUS','OTHER'
));

create unique index if not exists resources_file_hash_unique_idx
  on public.resources(file_hash) where file_hash is not null;
create unique index if not exists resources_bulk_exam_key_unique_idx
  on public.resources(subject_id, year, session, resource_type, coalesce(paper_number, 0), coalesce(variant, 0))
  where import_batch_id is not null;
create index if not exists resources_import_batch_idx on public.resources(import_batch_id);

create table if not exists public.resource_links (
  id bigserial primary key,
  source_resource_id bigint not null references public.resources(id) on delete cascade,
  target_resource_id bigint not null references public.resources(id) on delete cascade,
  link_type text not null check (link_type in ('MARKING_SCHEME','GRADE_THRESHOLD')),
  created_at timestamptz not null default now(),
  unique(source_resource_id, target_resource_id, link_type),
  check (source_resource_id <> target_resource_id)
);

create or replace function public.link_bulk_exam_resources()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resource_type = 'MARKING_SCHEME' then
    insert into public.resource_links(source_resource_id, target_resource_id, link_type)
    select new.id, paper.id, 'MARKING_SCHEME'
    from public.resources paper
    where paper.resource_type = 'PAST_PAPER'
      and paper.subject_id = new.subject_id
      and paper.year is not distinct from new.year
      and paper.session is not distinct from new.session
      and paper.paper_number is not distinct from new.paper_number
      and paper.variant is not distinct from new.variant
    on conflict do nothing;
  elsif new.resource_type = 'PAST_PAPER' then
    insert into public.resource_links(source_resource_id, target_resource_id, link_type)
    select scheme.id, new.id, 'MARKING_SCHEME'
    from public.resources scheme
    where scheme.resource_type = 'MARKING_SCHEME'
      and scheme.subject_id = new.subject_id
      and scheme.year is not distinct from new.year
      and scheme.session is not distinct from new.session
      and scheme.paper_number is not distinct from new.paper_number
      and scheme.variant is not distinct from new.variant
    on conflict do nothing;

    insert into public.resource_links(source_resource_id, target_resource_id, link_type)
    select threshold.id, new.id, 'GRADE_THRESHOLD'
    from public.resources threshold
    where threshold.resource_type = 'GRADE_THRESHOLD'
      and threshold.subject_id = new.subject_id
      and threshold.year is not distinct from new.year
      and threshold.session is not distinct from new.session
    on conflict do nothing;
  elsif new.resource_type = 'GRADE_THRESHOLD' then
    insert into public.resource_links(source_resource_id, target_resource_id, link_type)
    select new.id, paper.id, 'GRADE_THRESHOLD'
    from public.resources paper
    where paper.resource_type = 'PAST_PAPER'
      and paper.subject_id = new.subject_id
      and paper.year is not distinct from new.year
      and paper.session is not distinct from new.session
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.link_bulk_exam_resources() from public, anon, authenticated;
drop trigger if exists link_bulk_exam_resources_after_write on public.resources;
create trigger link_bulk_exam_resources_after_write
after insert or update of subject_id, resource_type, year, session, paper_number, variant
on public.resources for each row execute function public.link_bulk_exam_resources();

insert into public.subject_code_map(subject_code, subject_id)
select lpad(code, 4, '0'), id from public.subjects where code ~ '^[0-9]{1,4}$'
on conflict (subject_code) do update set subject_id = excluded.subject_id, updated_at = now();

alter table public.subject_code_map enable row level security;
alter table public.admin_import_batches enable row level security;
alter table public.resource_links enable row level security;

create policy "Subject code map readable by signed-in users" on public.subject_code_map
  for select to authenticated using (true);
create policy "Subject code map manageable by admins" on public.subject_code_map
  for all to authenticated
  using (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));
create policy "Import batches manageable by admins" on public.admin_import_batches
  for all to authenticated
  using (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));
create policy "Resource links readable by signed-in users" on public.resource_links
  for select to authenticated using (true);
create policy "Resource links manageable by admins" on public.resource_links
  for all to authenticated
  using (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));

grant select,insert,update,delete on public.subject_code_map, public.admin_import_batches, public.resource_links to authenticated;
grant usage,select on sequence public.admin_import_batches_id_seq, public.resource_links_id_seq to authenticated;
