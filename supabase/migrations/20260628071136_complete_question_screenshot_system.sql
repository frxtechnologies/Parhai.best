alter table public.question_index
  add column if not exists screenshot_status text not null default 'pending';

alter table public.question_index
  drop constraint if exists question_index_screenshot_status_check;
alter table public.question_index
  add constraint question_index_screenshot_status_check
  check (screenshot_status in ('pending', 'generated', 'failed', 'not_generated', 'full_page_fallback'));

update public.question_index
set screenshot_status = case
  when question_screenshot_url is not null then
    case when crop_status = 'needs_review' then 'full_page_fallback' else 'generated' end
  else 'not_generated'
end;

create index if not exists question_index_screenshot_status_idx
  on public.question_index(screenshot_status, resource_id);

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
        screenshot_status = case when new.needs_review then 'full_page_fallback' else 'generated' end,
        crop_status = case when new.needs_review then 'needs_review' else 'pending' end,
        updated_at = now()
    where id = new.question_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_primary_question_image() from public, anon, authenticated;

-- Public buckets serve known object URLs without a SELECT policy. Removing the
-- legacy broad policy prevents clients from listing every screenshot object.
drop policy if exists "Question screenshots publicly readable" on storage.objects;
