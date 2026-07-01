alter table public.question_index
  add column if not exists screenshot_error text,
  add column if not exists page_match_score numeric(5,4)
    check (page_match_score is null or page_match_score between 0 and 1.05),
  add column if not exists screenshot_fallback_used boolean not null default false;

update public.question_index
set
  screenshot_fallback_used = screenshot_status = 'full_page_fallback',
  screenshot_error = case
    when screenshot_status = 'failed_page_match' then 'page_match_failed'
    when screenshot_status = 'failed' then 'pdf_render_failed'
    else null
  end
where screenshot_error is null;
