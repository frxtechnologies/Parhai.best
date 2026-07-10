-- Phase B: verification audit for the Interaction Ledger.
-- Records WHO promoted a training candidate and WHEN, so gold promotion is
-- auditable. verification_status / quality_score already exist (Phase A).
alter table public.ai_interaction_ledger
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;
