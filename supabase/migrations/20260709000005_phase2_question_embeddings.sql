-- Phase 2 (F18): topic-filtered semantic search over the CLEAN question corpus.
--
-- Until now only ai_chunks (arbitrary document slices) were embedded, so semantic
-- search could not reach question_index — the verified, topic-tagged questions —
-- and could not be filtered by topic. This embeds question_index directly and adds
-- a match_questions RPC that filters by taxonomy topic BEFORE vector ranking.

alter table public.question_index
  add column if not exists embedding extensions.vector(768),
  add column if not exists embedding_model text;

create index if not exists question_index_embedding_hnsw_idx
  on public.question_index using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Topic-first semantic retrieval. The Phase-0 eligibility gate (usable text, not
-- topic certainty) is baked in so this RPC can never resurface rejected garbage.
create or replace function public.match_questions(
  query_embedding        extensions.vector(768),
  match_subject_id       bigint,
  match_count            integer default 12,
  match_threshold        double precision default 0.15,
  match_taxonomy_topic_id text default null,   -- exact subtopic filter, e.g. 'phys.motion.forces'
  match_taxonomy_prefix   text default null     -- parent-section filter, e.g. 'phys.motion.%'
)
returns table (
  id bigint,
  resource_id bigint,
  question_number text,
  topic text,
  subtopic text,
  taxonomy_topic_id text,
  difficulty text,
  marks integer,
  total_marks integer,
  clean_question_text text,
  display_question_text text,
  answer_text text,
  confidence double precision,
  needs_review boolean,
  year integer,
  session text,
  paper_code text,
  variant integer,
  source_file text,
  similarity double precision
)
language sql
stable
set search_path = ''
as $$
  select
    q.id,
    q.resource_id,
    q.question_number,
    q.topic,
    q.subtopic,
    q.taxonomy_topic_id,
    q.difficulty,
    q.marks,
    q.total_marks,
    q.clean_question_text,
    q.display_question_text,
    q.answer_text,
    q.confidence,
    q.needs_review,
    q.year,
    q.session,
    q.paper_code,
    q.variant,
    q.source_file,
    1 - (q.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.question_index q
  where q.subject_id = match_subject_id
    and q.embedding is not null
    and q.clean_question_text is not null
    and q.text_quality_status in ('good', 'acceptable')
    and (match_taxonomy_topic_id is null or q.taxonomy_topic_id = match_taxonomy_topic_id)
    and (match_taxonomy_prefix is null or q.taxonomy_topic_id like match_taxonomy_prefix)
    and 1 - (q.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by q.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

grant execute on function public.match_questions(extensions.vector, bigint, integer, double precision, text, text) to authenticated;
