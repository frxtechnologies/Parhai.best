alter table public.resources
  add column if not exists file_url text,
  add column if not exists file_path text;

update public.resources
set
  file_url = coalesce(file_url, storage_path),
  file_path = coalesce(file_path, storage_path)
where file_url is null or file_path is null;

alter table public.resources
  alter column file_url set not null,
  alter column file_path set not null;

alter table public.resources
  drop constraint if exists resources_resource_type_check;

alter table public.resources
  add constraint resources_resource_type_check
  check (resource_type in ('PAST_PAPER', 'MARKING_SCHEME', 'NOTES', 'SYLLABUS', 'WORKSHEET', 'OTHER'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'resources'
  ) then
    alter publication supabase_realtime add table public.resources;
  end if;
end $$;
