-- Phase 1 (F1): measure the legacy Gen-2 retrieval path before removing it.
-- These two counters let production data answer "does the legacy retrieval path
-- ever actually contribute a cited source?" — turning removal from a guess into
-- an evidence-backed decision. Once legacy_sources_cited stays ~0 across a real
-- traffic window, the legacy path (and its Gen-2 tables) can be deleted safely.

alter table public.ai_retrieval_telemetry
  add column if not exists legacy_sources_returned integer not null default 0,
  add column if not exists legacy_sources_cited integer not null default 0;

-- Fast filter for "did legacy ever win a citation" dashboards.
create index if not exists ai_retrieval_telemetry_legacy_cited_idx
  on public.ai_retrieval_telemetry (subject_code, created_at desc)
  where legacy_sources_cited > 0;
