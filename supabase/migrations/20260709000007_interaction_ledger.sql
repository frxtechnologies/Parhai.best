-- Phase A: the Interaction Ledger — Parhai's data flywheel.
--
-- Distinct from ai_retrieval_telemetry (which stores dashboard METRICS), this
-- stores the full (input → grounded evidence → output) tuple for EVERY answered
-- query, tagged with model provenance. These rows are the raw material that later
-- becomes verified training data — the asset that makes commercial APIs optional.
-- The reasoning backend (Gemini today) is treated as a temporary teacher whose
-- outputs Parhai keeps and learns from.

create table if not exists public.ai_interaction_ledger (
  id                     bigserial primary key,
  created_at             timestamptz not null default now(),
  user_id                uuid references auth.users(id) on delete set null,
  subject_id             bigint references public.subjects(id) on delete set null,
  subject_code           text,
  mode                   text,                                   -- rag | hybrid | teacher

  -- Provenance: which teacher produced this output (so training data is attributable
  -- and filterable by teacher quality, and so a future local model can replace it).
  model_provider         text,
  model_name             text,

  -- The training triple.
  query_text             text not null,
  resolved_topic_id      text references public.taxonomy_topics(id) on delete set null,
  retrieval_strategy     text,
  evidence               jsonb not null default '[]'::jsonb,     -- grounding used (compact)
  answer_text            text,
  citations              jsonb not null default '[]'::jsonb,     -- which evidence was cited

  answer_length          text,
  latency_ms             integer,

  -- Gold-promotion (Phase B) and dataset-export (Phase D) lifecycle.
  verification_status    text not null default 'unverified'
    check (verification_status in ('unverified','student_positive','student_negative','teacher_verified','rejected')),
  quality_score          real,
  training_export_status text not null default 'pending'
    check (training_export_status in ('pending','exported','excluded'))
);

create index if not exists ai_interaction_ledger_subject_created_idx
  on public.ai_interaction_ledger (subject_code, created_at desc);
create index if not exists ai_interaction_ledger_verification_idx
  on public.ai_interaction_ledger (verification_status, created_at desc);
create index if not exists ai_interaction_ledger_topic_idx
  on public.ai_interaction_ledger (resolved_topic_id) where resolved_topic_id is not null;
create index if not exists ai_interaction_ledger_export_idx
  on public.ai_interaction_ledger (training_export_status) where training_export_status = 'pending';

alter table public.ai_interaction_ledger enable row level security;

-- Users insert and may update the verification of their OWN rows (student feedback
-- loop). Reading the corpus is admin-only via the service role (bypasses RLS).
drop policy if exists "ledger_insert_own" on public.ai_interaction_ledger;
create policy "ledger_insert_own" on public.ai_interaction_ledger
  for insert with check (auth.uid() = user_id);
drop policy if exists "ledger_update_own" on public.ai_interaction_ledger;
create policy "ledger_update_own" on public.ai_interaction_ledger
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link explicit feedback to its ledger row.
alter table public.ai_answer_feedback
  add column if not exists ledger_id bigint references public.ai_interaction_ledger(id) on delete set null;
