-- Phase F: Model Registry + eval gate.
-- Every model version Parhai trains is registered with its eval metrics and a
-- status. A candidate is promoted to 'active' only if it beats the incumbent
-- (enforced in app logic), and the previous active is 'archived' for rollback —
-- so a bad model can never silently replace a good one.
create table if not exists public.model_registry (
  id           bigserial primary key,
  model_key    text not null,          -- e.g. 'topic-classifier'
  version      text not null,
  status       text not null default 'candidate'
    check (status in ('candidate', 'active', 'archived', 'rejected')),
  metrics      jsonb not null default '{}'::jsonb,
  artifact     text,                    -- serialized model (portable across deploys)
  train_size   integer,
  notes        text,
  created_at   timestamptz not null default now(),
  activated_at timestamptz,
  unique (model_key, version)
);

create index if not exists model_registry_key_status_idx on public.model_registry (model_key, status);
create index if not exists model_registry_key_created_idx on public.model_registry (model_key, created_at desc);

alter table public.model_registry enable row level security;
-- Admin/service-role only: proprietary model artifacts.
