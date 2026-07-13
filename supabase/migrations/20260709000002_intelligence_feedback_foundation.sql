-- Parhai Intelligence: measurement & feedback foundation.
-- Purpose: make retrieval quality observable so hallucinations can be measured
-- and reduced. Nothing here changes student-facing behaviour — it only records
-- how each query was resolved and captures explicit feedback + an offline eval set.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ai_retrieval_telemetry — one row per RAG query, recording HOW it retrieved
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_retrieval_telemetry (
  id                 bigserial primary key,
  user_id            uuid references auth.users(id) on delete set null,
  subject_id         bigint references public.subjects(id) on delete set null,
  subject_code       text,
  query_text         text not null,
  mode               text,                                  -- rag | hybrid | teacher
  resolved_topic_id  text references public.taxonomy_topics(id) on delete set null,
  topic_method       text check (topic_method in ('ai','keyword','none')),
  retrieval_strategy text,                                  -- taxonomy_exact | taxonomy_parent | topic_ilike | keyword_ilike | semantic_only
  sources_returned   integer not null default 0,
  question_sources   integer not null default 0,
  top_similarity     real,
  answer_length      text,
  provider_ok        boolean not null default true,
  latency_ms         integer,
  created_at         timestamptz not null default now()
);

create index if not exists ai_retrieval_telemetry_subject_created_idx
  on public.ai_retrieval_telemetry (subject_code, created_at desc);
create index if not exists ai_retrieval_telemetry_topic_idx
  on public.ai_retrieval_telemetry (resolved_topic_id) where resolved_topic_id is not null;
create index if not exists ai_retrieval_telemetry_strategy_idx
  on public.ai_retrieval_telemetry (retrieval_strategy, created_at desc);

alter table public.ai_retrieval_telemetry enable row level security;

-- Authenticated users may insert their OWN telemetry rows (the API uses the
-- user-scoped client). Reading is admin-only (via service role, which bypasses RLS).
drop policy if exists "telemetry_insert_own" on public.ai_retrieval_telemetry;
create policy "telemetry_insert_own" on public.ai_retrieval_telemetry
  for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ai_answer_feedback — explicit student signal on a specific answer
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_answer_feedback (
  id           bigserial primary key,
  telemetry_id bigint references public.ai_retrieval_telemetry(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  subject_id   bigint references public.subjects(id) on delete set null,
  rating       smallint not null check (rating in (-1, 1)),   -- thumbs down / up
  reason       text check (reason in ('helpful','wrong_topic','hallucinated','no_sources','incomplete','other')),
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists ai_answer_feedback_subject_idx
  on public.ai_answer_feedback (subject_id, created_at desc);
create index if not exists ai_answer_feedback_rating_idx
  on public.ai_answer_feedback (rating, created_at desc);

alter table public.ai_answer_feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.ai_answer_feedback;
create policy "feedback_insert_own" on public.ai_answer_feedback
  for insert with check (auth.uid() = user_id);
drop policy if exists "feedback_read_own" on public.ai_answer_feedback;
create policy "feedback_read_own" on public.ai_answer_feedback
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. retrieval_eval_case — golden set for offline retrieval evaluation
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retrieval_eval_case (
  id                bigserial primary key,
  subject_code      text not null,
  query_text        text not null,
  expected_topic_id text references public.taxonomy_topics(id) on delete cascade,
  expected_source   text,                                    -- optional: a known-correct source ref
  notes             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists retrieval_eval_case_subject_idx
  on public.retrieval_eval_case (subject_code) where active;

alter table public.retrieval_eval_case enable row level security;
-- Admin-only: no permissive policies → only the service role can read/write.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. retrieval_eval_run — aggregate results of one eval pass
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retrieval_eval_run (
  id             bigserial primary key,
  run_label      text,
  subject_code   text not null,
  total_cases    integer not null,
  topic_accuracy real,                                       -- % resolved topic == expected
  hit_at_3       real,                                        -- reserved for full-retrieval eval
  hit_at_5       real,
  mrr            real,
  config         jsonb not null default '{}'::jsonb,         -- threshold/model snapshot
  created_at     timestamptz not null default now()
);

create index if not exists retrieval_eval_run_subject_idx
  on public.retrieval_eval_run (subject_code, created_at desc);

alter table public.retrieval_eval_run enable row level security;
-- Admin-only via service role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed a small physics 0625 golden set (query → expected taxonomy topic)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.retrieval_eval_case (subject_code, query_text, expected_topic_id, notes) values
  ('0625', 'Show me velocity-time graph questions about acceleration',        'phys.motion.kinematics',           'kinematics graphs'),
  ('0625', 'Explain the principle of moments and turning effect of forces',   'phys.motion.forces',               'moments'),
  ('0625', 'Questions on conservation of momentum in collisions',             'phys.motion.momentum',             'momentum'),
  ('0625', 'How do I calculate efficiency and work done?',                    'phys.motion.energy',               'energy/work/power'),
  ('0625', 'Pressure in liquids and hydraulic systems',                       'phys.motion.pressure',             'pressure'),
  ('0625', 'Specific heat capacity calculation questions',                    'phys.thermal.properties',          'thermal properties'),
  ('0625', 'Explain conduction convection and radiation',                     'phys.thermal.transfer',            'heat transfer'),
  ('0625', 'Brownian motion and the kinetic particle model',                  'phys.thermal.kinetic_model',       'kinetic model'),
  ('0625', 'Refraction and total internal reflection critical angle',         'phys.waves.light',                 'light'),
  ('0625', 'Electromagnetic spectrum order of wavelengths',                    'phys.waves.em_spectrum',          'EM spectrum'),
  ('0625', 'Ultrasound and speed of sound echo questions',                    'phys.waves.sound',                 'sound'),
  ('0625', 'Ohm''s law current voltage resistance calculations',              'phys.electricity.quantities',      'electrical quantities'),
  ('0625', 'Series and parallel circuit resistor questions',                  'phys.electricity.circuits',        'circuits'),
  ('0625', 'How does a transformer and electromagnetic induction work?',      'phys.electricity.electromagnetic', 'EM effects'),
  ('0625', 'Fuse earth wire and three-pin plug safety',                       'phys.electricity.safety',          'electrical safety'),
  ('0625', 'Alpha beta gamma radiation penetrating power and half-life',      'phys.atomic.radioactivity',        'radioactivity'),
  ('0625', 'Proton number nucleon number and isotopes of an atom',            'phys.atomic.nuclear_atom',         'nuclear atom')
on conflict do nothing;
