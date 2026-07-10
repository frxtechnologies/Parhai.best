-- Phase D: the training dataset.
-- Instruction-tuning examples assembled from (a) the verified gold Interaction
-- Ledger and (b) the structured question corpus + marking points. This is the
-- asset a future Parhai model fine-tunes / distills on. Versioned + deduped so
-- each build is reproducible and never trains on duplicates.
create table if not exists public.training_examples (
  id             bigserial primary key,
  dataset_version text not null,
  source         text not null,          -- 'question_corpus' | 'gold_ledger'
  subject_code   text,
  topic_id       text,
  difficulty     text,
  marks          integer,
  instruction    text not null,
  input          text,
  output         text not null,
  metadata       jsonb not null default '{}'::jsonb,
  content_hash   text not null,
  created_at     timestamptz not null default now(),
  unique (dataset_version, content_hash)
);

create index if not exists training_examples_version_idx on public.training_examples (dataset_version);
create index if not exists training_examples_subject_source_idx on public.training_examples (subject_code, source);

alter table public.training_examples enable row level security;
-- Admin/service-role only: this is proprietary training data.
