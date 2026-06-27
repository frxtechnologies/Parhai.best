alter table public.question_index
  add column if not exists question_screenshot_url text,
  add column if not exists question_screenshot_path text,
  add column if not exists source_page integer check (source_page is null or source_page > 0),
  add column if not exists bbox jsonb,
  add column if not exists crop_status text not null default 'pending'
    check (crop_status in ('pending', 'correct', 'incorrect', 'needs_review'));

create table if not exists public.question_images (
  id bigserial primary key,
  question_id bigint not null references public.question_index(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  page_number integer not null check (page_number > 0),
  bbox jsonb not null,
  image_order integer not null default 1 check (image_order > 0),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, image_order)
);

create index if not exists question_images_question_order_idx
  on public.question_images(question_id, image_order);
create index if not exists question_images_resource_idx
  on public.question_images(resource_id);

alter table public.question_images enable row level security;

create policy "Approved question images readable by signed-in users"
  on public.question_images for select to authenticated
  using (
    exists (
      select 1 from public.resources r
      where r.id = question_images.resource_id and r.is_approved
    )
  );

create policy "Question images manageable by admin users"
  on public.question_images for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

grant select on public.question_images to authenticated;
grant insert, update, delete on public.question_images to authenticated;
grant usage, select on sequence public.question_images_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-screenshots', 'question-screenshots', true, 10485760, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Question screenshots publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'question-screenshots');

create policy "Question screenshots manageable by admins"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'question-screenshots'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  )
  with check (
    bucket_id = 'question-screenshots'
    and exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email'))
  );

create or replace function public.sync_primary_question_image()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_order = 1 then
    update public.question_index
    set question_screenshot_url = new.image_url,
        question_screenshot_path = new.image_path,
        source_page = new.page_number,
        bbox = new.bbox,
        crop_status = case when new.needs_review then 'needs_review' else 'pending' end,
        updated_at = now()
    where id = new.question_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_primary_question_image() from public, anon, authenticated;
drop trigger if exists sync_primary_question_image_after_write on public.question_images;
create trigger sync_primary_question_image_after_write
after insert or update on public.question_images
for each row execute function public.sync_primary_question_image();
