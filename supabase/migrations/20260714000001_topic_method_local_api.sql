-- Distinguish "local model" from "API teacher" in topic-resolution telemetry.
--
-- Before this, classifyQueryTopicId only returned a topic id, so every
-- successful classification (whether the Parhai-owned local Naive Bayes model
-- or the Gemini API teacher answered) was indistinguishably logged as "ai" —
-- silently making the platform's own "API dependency" / "local model usage"
-- metric unmeasurable. Widen the constraint to carry that distinction.
alter table public.ai_retrieval_telemetry
  drop constraint if exists ai_retrieval_telemetry_topic_method_check;
alter table public.ai_retrieval_telemetry
  add constraint ai_retrieval_telemetry_topic_method_check
    check (topic_method in ('local', 'api', 'keyword', 'none', 'ai'));
-- 'ai' is kept as a valid legacy value (rows written before this migration),
-- never written going forward.
