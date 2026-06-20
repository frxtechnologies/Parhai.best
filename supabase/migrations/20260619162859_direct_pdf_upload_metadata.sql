alter table public.notes
  add column if not exists storage_path text,
  add column if not exists ingestion_status text not null default 'ready_without_processing';

create policy "Notes manageable by admin users"
  on public.notes for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

grant select, insert, update, delete on public.notes to authenticated;
grant usage, select on all sequences in schema public to authenticated;
