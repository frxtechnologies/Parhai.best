-- Stable source identifiers make the one-time legacy import safe to retry.
alter table public.resources
  add column if not exists legacy_source text,
  add column if not exists legacy_source_id bigint;

alter table public.question_index
  add column if not exists legacy_source text,
  add column if not exists legacy_source_id bigint;

drop index if exists public.resources_legacy_source_id_idx;
create unique index resources_legacy_source_id_idx
  on public.resources(legacy_source, legacy_source_id);

drop index if exists public.question_index_legacy_source_id_idx;
create unique index question_index_legacy_source_id_idx
  on public.question_index(legacy_source, legacy_source_id);

create index if not exists processing_jobs_automatic_queue_idx
  on public.processing_jobs(status, created_at)
  where status in ('uploaded', 'failed');
