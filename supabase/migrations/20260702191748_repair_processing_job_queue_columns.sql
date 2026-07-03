alter table public.processing_jobs
  add column if not exists progress_percent integer not null default 10 check(progress_percent between 0 and 100),
  add column if not exists current_step text not null default 'uploaded',
  add column if not exists safe_logs jsonb not null default '[]'::jsonb,
  add column if not exists processing_mode text not null default 'full'
    check(processing_mode in ('full','topic_tags','marking_scheme_links','embeddings'));

alter table public.processing_jobs drop constraint if exists processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check check(status in (
  'uploaded','extracting','indexing','completed','failed',
  'extracting_text','rendering_pages','detecting_metadata','splitting_questions',
  'tagging_topics','linking_marking_scheme','creating_embeddings','updating_analytics',
  'needs_manual_review'
));
