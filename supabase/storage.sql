-- Storage setup for past paper PDFs and marking schemes.

insert into storage.buckets (id, name, public)
values ('papers', 'papers', false)
on conflict (id) do update set public = excluded.public;

create policy "Papers bucket readable by signed-in users"
on storage.objects for select to authenticated
using (bucket_id = 'papers');

create policy "Papers bucket manageable by admin users"
on storage.objects for all to authenticated
using (
  bucket_id = 'papers'
  and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
)
with check (
  bucket_id = 'papers'
  and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
);
