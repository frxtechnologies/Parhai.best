-- ============================================================================
-- PARHAI — Full schema bundle (paste-once into Supabase SQL Editor)
-- Project: izzywbkohqzbnhnvqzaa
-- Regenerated 2026-07-14: every `create policy` is now preceded by a matching
-- `drop policy if exists`, so a partial or repeated run never errors on
-- "policy already exists". Applies migrations 20260709000001..20260713000001
-- in order. Fully idempotent — safe to re-run in full even after a partial
-- application (this bundle's prior version was NOT idempotent for policies;
-- that bug is fixed here).
-- ============================================================================


-- ===== 20260709000001_taxonomy_topics.sql =====
-- Physics 0625 taxonomy system
-- Uses a new table `taxonomy_topics` to avoid collision with the existing
-- `topics` table (which has a bigserial PK and belongs to the legacy system).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. taxonomy_topics
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.taxonomy_topics (
  id           text primary key,              -- e.g. "phys.motion.kinematics" — never changes
  subject_code text not null,                 -- "0625" (IGCSE) or "5054" (O Level) when added
  parent_id    text references public.taxonomy_topics(id) on delete restrict,
  name         text not null,
  level        integer not null check (level in (1, 2)),
  keywords     text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists taxonomy_topics_subject_code_idx on public.taxonomy_topics (subject_code);
create index if not exists taxonomy_topics_parent_id_idx    on public.taxonomy_topics (parent_id);

alter table public.taxonomy_topics enable row level security;

-- Admin can manage; anon/authenticated can only read
drop policy if exists "taxonomy_topics_read" on public.taxonomy_topics;
create policy "taxonomy_topics_read" on public.taxonomy_topics
  for select using (true);

drop policy if exists "taxonomy_topics_admin_write" on public.taxonomy_topics;
create policy "taxonomy_topics_admin_write" on public.taxonomy_topics
  for all using (
    exists (
      select 1 from public.admin_users au
      where au.email = (select email from auth.users where id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add taxonomy columns to question_index
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.question_index
  add column if not exists taxonomy_topic_id text references public.taxonomy_topics(id) on delete set null,
  add column if not exists taxonomy_confidence float;

create index if not exists question_index_taxonomy_topic_id_idx
  on public.question_index (taxonomy_topic_id)
  where taxonomy_topic_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed Cambridge IGCSE Physics 0625 taxonomy
-- ─────────────────────────────────────────────────────────────────────────────

-- Level 1: topic sections
insert into public.taxonomy_topics (id, subject_code, parent_id, level, name, keywords) values
  ('phys.motion',      '0625', null, 1, 'Motion, Forces and Energy',  array['motion','forces','energy','mechanics','work','power','momentum','pressure']),
  ('phys.thermal',     '0625', null, 1, 'Thermal Physics',             array['thermal','heat','temperature','kinetic','particle','conduction','convection','radiation','latent','specific heat']),
  ('phys.waves',       '0625', null, 1, 'Waves, Light and Sound',      array['wave','light','sound','reflection','refraction','diffraction','electromagnetic','lens','optics']),
  ('phys.electricity', '0625', null, 1, 'Electricity and Magnetism',   array['electricity','electric','circuit','current','voltage','resistance','magnet','magnetic','motor','generator','transformer']),
  ('phys.atomic',      '0625', null, 1, 'Atomic Physics',              array['atom','nuclear','radioactivity','radiation','proton','neutron','electron','isotope','half-life','decay'])
on conflict (id) do nothing;

-- Level 2: subtopics
insert into public.taxonomy_topics (id, subject_code, parent_id, level, name, keywords) values
  ('phys.motion.measurement', '0625', 'phys.motion', 2, 'Physical Quantities and Measurement',
    array['measurement','scalar','vector','SI units','significant figures','systematic error','random error','precision','accuracy','micrometer','vernier','stopwatch']),
  ('phys.motion.kinematics',  '0625', 'phys.motion', 2, 'Motion (Speed, Velocity and Acceleration)',
    array['speed','velocity','acceleration','distance','displacement','time','deceleration','uniform acceleration','distance-time graph','velocity-time graph','free fall','terminal velocity','equations of motion']),
  ('phys.motion.mass_weight', '0625', 'phys.motion', 2, 'Mass and Weight',
    array['mass','weight','gravitational field strength','g','inertia','newton','balance','spring balance','gravitational force']),
  ('phys.motion.density',     '0625', 'phys.motion', 2, 'Density',
    array['density','mass','volume','float','sink','Archimedes','upthrust','displacement method']),
  ('phys.motion.forces',      '0625', 'phys.motion', 2, 'Forces',
    array['force','resultant','Newton''s laws','friction','weight','normal reaction','free body diagram','equilibrium','turning effect','moment','torque','pivot','principle of moments','centre of gravity','stability']),
  ('phys.motion.momentum',    '0625', 'phys.motion', 2, 'Momentum',
    array['momentum','conservation of momentum','impulse','collision','explosion','Newton''s second law','elastic','inelastic']),
  ('phys.motion.energy',      '0625', 'phys.motion', 2, 'Energy, Work and Power',
    array['energy','work done','power','kinetic energy','potential energy','gravitational potential energy','conservation of energy','efficiency','renewable','non-renewable','joule','watt']),
  ('phys.motion.pressure',    '0625', 'phys.motion', 2, 'Pressure',
    array['pressure','pascal','force per unit area','hydraulic','atmospheric pressure','fluid pressure','manometer','barometer','depth']),

  ('phys.thermal.kinetic_model', '0625', 'phys.thermal', 2, 'Kinetic Particle Model of Matter',
    array['kinetic theory','particle model','solid','liquid','gas','states of matter','Brownian motion','diffusion','evaporation','boiling','melting','gas pressure','Boyle''s law','pressure law']),
  ('phys.thermal.properties',    '0625', 'phys.thermal', 2, 'Thermal Properties and Temperature',
    array['specific heat capacity','specific latent heat','latent heat of fusion','latent heat of vaporisation','thermal capacity','thermometer','temperature','Celsius','Kelvin','thermocouple','melting point','boiling point','heating curve','cooling curve']),
  ('phys.thermal.transfer',      '0625', 'phys.thermal', 2, 'Transfer of Thermal Energy',
    array['conduction','convection','radiation','thermal radiation','infrared','insulation','vacuum flask','conductor','insulator','convection current','black body','emitter','absorber']),

  ('phys.waves.general',     '0625', 'phys.waves', 2, 'General Wave Properties',
    array['wave','transverse','longitudinal','amplitude','wavelength','frequency','period','wave speed','crest','trough','compression','rarefaction','diffraction','interference','ripple tank']),
  ('phys.waves.light',       '0625', 'phys.waves', 2, 'Light',
    array['light','reflection','refraction','total internal reflection','critical angle','Snell''s law','refractive index','lens','converging lens','diverging lens','focal length','real image','virtual image','ray diagram','plane mirror','prism','optical fibre']),
  ('phys.waves.em_spectrum', '0625', 'phys.waves', 2, 'Electromagnetic Spectrum',
    array['electromagnetic spectrum','radio waves','microwaves','infrared','visible light','ultraviolet','X-rays','gamma rays','speed of light']),
  ('phys.waves.sound',       '0625', 'phys.waves', 2, 'Sound',
    array['sound','longitudinal wave','frequency','pitch','amplitude','loudness','echo','speed of sound','ultrasound','hearing range','oscilloscope']),

  ('phys.electricity.magnetism',     '0625', 'phys.electricity', 2, 'Simple Phenomena of Magnetism',
    array['magnet','magnetic field','field lines','north pole','south pole','attraction','repulsion','magnetisation','demagnetisation','electromagnet','solenoid','induced magnetism','hard','soft iron','steel']),
  ('phys.electricity.quantities',    '0625', 'phys.electricity', 2, 'Electrical Quantities',
    array['current','charge','potential difference','voltage','resistance','Ohm''s law','coulomb','ampere','volt','ohm','I-V characteristic','ohmic','thermistor','LDR','diode','filament lamp']),
  ('phys.electricity.circuits',      '0625', 'phys.electricity', 2, 'Electric Circuits',
    array['circuit','series','parallel','resistor','ammeter','voltmeter','switch','cell','battery','EMF','internal resistance','logic gate','AND','OR','NOT','NAND','NOR','truth table','relay','transistor','combined resistance']),
  ('phys.electricity.safety',        '0625', 'phys.electricity', 2, 'Electrical Safety',
    array['fuse','circuit breaker','earth wire','live wire','neutral wire','plug','three-pin plug','earthing','double insulation','mains electricity','hazard','overload','short circuit']),
  ('phys.electricity.electromagnetic','0625', 'phys.electricity', 2, 'Electromagnetic Effects',
    array['electromagnetic induction','Fleming''s left-hand rule','motor effect','force on current','generator','dynamo','AC','DC','alternating current','direct current','transformer','step-up','step-down','turn ratio','Faraday''s law','Lenz''s law']),

  ('phys.atomic.nuclear_atom',  '0625', 'phys.atomic', 2, 'The Nuclear Atom',
    array['atom','nucleus','proton','neutron','electron','proton number','nucleon number','atomic number','mass number','isotope','nuclide notation','shell','Rutherford','structure of atom']),
  ('phys.atomic.radioactivity', '0625', 'phys.atomic', 2, 'Radioactivity',
    array['radioactivity','alpha particle','beta particle','gamma ray','ionising radiation','half-life','decay','nuclear equation','penetrating power','Geiger-Müller tube','count rate','background radiation','safety precautions','radioactive dating','nuclear fission','nuclear fusion','chain reaction'])
on conflict (id) do nothing;


-- ===== 20260709000002_intelligence_feedback_foundation.sql =====
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


-- ===== 20260709000003_phase0_retire_dead_rag_tables.sql =====
-- Phase 0 cleanup (F16/F30): retire the dead Gen-1 RAG tables.
--
-- These are vector(1536) tables from the first RAG design. The live embedding
-- model emits 768-dim vectors into public.ai_chunks (HNSW indexed), so these
-- tables can NEVER match a live query. No backend or frontend code references
-- them, and match_paper_chunks has zero callers.
--
-- SAFETY: every table is dropped ONLY IF EMPTY. If any table still holds rows,
-- it is left untouched and a NOTICE is logged — this migration cannot destroy
-- data and is safe to re-run.

-- 1) Drop the dead RPC (all overloads), regardless of exact signature.
do $$
declare
  r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 'match_paper_chunks' loop
    execute 'drop function if exists ' || r.sig::text;
    raise notice 'Dropped dead function %', r.sig::text;
  end loop;
end $$;

-- 2) Drop child chunk tables first (FKs), then the parent — each only if empty.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['public.paper_chunks', 'public.note_chunks', 'public.past_papers'] loop
    if to_regclass(t) is null then
      continue;
    end if;
    execute format('select count(*) from %s', t) into n;
    if n = 0 then
      execute format('drop table %s cascade', t);
      raise notice 'Dropped empty dead table %', t;
    else
      raise notice 'KEPT % — still has % row(s); not dropping to avoid data loss', t, n;
    end if;
  end loop;
end $$;


-- ===== 20260709000004_phase1_legacy_retrieval_measurement.sql =====
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


-- ===== 20260709000005_phase2_question_embeddings.sql =====
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


-- ===== 20260709000006_mark_scheme_points.sql =====
-- F5: structured mark-scheme points.
-- Stores the discrete marking criteria parsed from a scheme's answer text so the
-- Paper Checker can award marks against each point instead of a text blob.
alter table public.question_index
  add column if not exists marking_points jsonb;


-- ===== 20260709000007_interaction_ledger.sql =====
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


-- ===== 20260709000008_ledger_verification.sql =====
-- Phase B: verification audit for the Interaction Ledger.
-- Records WHO promoted a training candidate and WHEN, so gold promotion is
-- auditable. verification_status / quality_score already exist (Phase A).
alter table public.ai_interaction_ledger
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;


-- ===== 20260709000009_knowledge_graph.sql =====
-- Phase C: Knowledge Graph.
-- A generic edge store materializing relationships that were previously implicit
-- or required an API call. The first materialized edge type is 'related_question'
-- (nearest neighbours via the F18 question embeddings), turning "show me similar
-- questions" and "frequently tested concepts" into cheap graph lookups.
--
-- Text src_id/dst_id let one table hold heterogeneous nodes (question ids as text,
-- taxonomy topic ids) without per-relationship tables.
create table if not exists public.knowledge_edges (
  id          bigserial primary key,
  subject_id  bigint references public.subjects(id) on delete cascade,
  edge_type   text not null,        -- 'related_question' | 'has_topic' | ...
  src_type    text not null,        -- 'question' | 'topic'
  src_id      text not null,
  dst_type    text not null,
  dst_id      text not null,
  weight      real,                 -- similarity for related_question
  created_at  timestamptz not null default now(),
  unique (edge_type, src_id, dst_id)
);

create index if not exists knowledge_edges_src_idx on public.knowledge_edges (edge_type, src_id);
create index if not exists knowledge_edges_subject_type_idx on public.knowledge_edges (subject_id, edge_type);

alter table public.knowledge_edges enable row level security;

drop policy if exists "knowledge_edges_read" on public.knowledge_edges;
create policy "knowledge_edges_read" on public.knowledge_edges
  for select using (true);
drop policy if exists "knowledge_edges_admin_write" on public.knowledge_edges;
create policy "knowledge_edges_admin_write" on public.knowledge_edges
  for all using (
    exists (select 1 from public.admin_users au
            where au.email = (select email from auth.users where id = auth.uid()))
  );


-- ===== 20260709000010_training_examples.sql =====
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


-- ===== 20260709000011_model_registry.sql =====
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


-- ===== 20260711000001_knowledge_center.sql =====
-- AI Knowledge Center — the brain's schema.
--
-- Two axes, kept orthogonal on purpose:
--   is_approved  = has this cleared the ingestion pipeline? (quality gate)
--   visibility   = who is allowed to SEE it? (access gate)
-- A resource can be approved AND ai-private at the same time — the AI grounds
-- answers in it, but a student never receives the row, its chunks, or a download
-- link. This is enforced here at the RLS layer, not just in the application.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Expand resource_type to the full knowledge taxonomy
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources add constraint resources_resource_type_check check (resource_type in (
  'PAST_PAPER','MARKING_SCHEME','GRADE_THRESHOLD','EXAMINER_REPORT','INSERT','SOURCE_FILE',
  'NOTES','WORKSHEET','TEST','TOPICAL','SYLLABUS','OTHER',
  -- Knowledge Center additions:
  'TEACHER_NOTES','PRIVATE_GUIDE','FORMULA_SHEET','BOOK','FLASHCARDS','AI_NOTES','VIDEO'
));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Visibility: four independent permissions, not a single tier enum.
--    A resource can be any combination — e.g. a private teaching guide is
--    Students:false, AI:true, Training:true, Admin:true. visible_to_admin
--    defaults true (every resource is always staff-visible in the Knowledge
--    Library) and is not itself security-critical; the enforcement boundary
--    that matters is visible_to_students, checked by RLS below.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources
  add column if not exists visible_to_students boolean not null default true,
  add column if not exists visible_to_ai boolean not null default true,
  add column if not exists visible_to_training boolean not null default true,
  add column if not exists visible_to_admin boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resource-level knowledge metadata (topic, difficulty, source, confidence)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources
  add column if not exists taxonomy_topic_id text references public.taxonomy_topics(id) on delete set null,
  add column if not exists difficulty text check (difficulty is null or difficulty in ('EASY','MEDIUM','HARD')),
  add column if not exists source text,
  add column if not exists confidence_score real check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));

create index if not exists resources_visible_to_students_idx on public.resources (visible_to_students, is_approved);
create index if not exists resources_visible_to_ai_idx on public.resources (visible_to_ai) where visible_to_ai;
create index if not exists resources_taxonomy_topic_idx on public.resources (taxonomy_topic_id) where taxonomy_topic_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS: replace the single is_approved gate with visibility-aware policies.
--    Regular authenticated users (students) can ONLY select rows with
--    visible_to_students = true (and approved). Everything else is invisible
--    to the authenticated role at the database level — grounding for
--    non-student-visible content is done server-side via the service role,
--    never via a student-scoped client.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Approved resources readable by signed-in users" on public.resources;
drop policy if exists "Student-visible approved resources readable by signed-in users" on public.resources;
create policy "Student-visible approved resources readable by signed-in users" on public.resources
  for select to authenticated using (is_approved and visible_to_students);

drop policy if exists "Approved AI chunks readable by signed-in users" on public.ai_chunks;
drop policy if exists "Student-visible approved AI chunks readable by signed-in users" on public.ai_chunks;
create policy "Student-visible approved AI chunks readable by signed-in users" on public.ai_chunks
  for select to authenticated using (
    exists (
      select 1 from public.resources r
      where r.id = public.ai_chunks.resource_id and r.is_approved and r.visible_to_students
    )
  );

-- Admins may read every visibility tier (Knowledge Center management UI).
drop policy if exists "Admins read all resources" on public.resources;
create policy "Admins read all resources" on public.resources
  for select to authenticated using (
    exists (select 1 from public.admin_users au where au.email = (select email from auth.users where id = auth.uid()))
  );
drop policy if exists "Admins read all ai_chunks" on public.ai_chunks;
create policy "Admins read all ai_chunks" on public.ai_chunks
  for select to authenticated using (
    exists (select 1 from public.admin_users au where au.email = (select email from auth.users where id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. Extend the existing paper-linking trigger (previously MARKING_SCHEME-only)
--     to also auto-link EXAMINER_REPORT and GRADE_THRESHOLD resources to their
--     PAST_PAPER by the same (subject, level, year, session, paper_code, variant)
--     tuple — the same deterministic match already proven for marking schemes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.link_resource_to_paper()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resource_type in ('MARKING_SCHEME', 'EXAMINER_REPORT', 'GRADE_THRESHOLD') then
    select paper.id into new.related_resource_id
    from public.resources paper
    where paper.subject_id = new.subject_id
      and paper.level = new.level
      and paper.resource_type = 'PAST_PAPER'
      and paper.year is not distinct from new.year
      and paper.session is not distinct from new.session
      and paper.paper_code is not distinct from new.paper_code
      and paper.variant is not distinct from new.variant
    order by paper.created_at desc
    limit 1;
  elsif new.resource_type <> 'PAST_PAPER' then
    new.related_resource_id := null;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Resource-level knowledge-graph link types (extends knowledge_edges, Phase C)
--    edge_type values used here: 'resource_topic', 'resource_marking_scheme',
--    'resource_examiner_report', 'resource_related_question'.
--    No new table needed — knowledge_edges already supports heterogeneous nodes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Knowledge Center dashboard views (read-only aggregates, admin-only via RLS
--    on the underlying tables — views inherit base-table RLS).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.knowledge_center_processing_status as
select
  r.resource_type,
  r.visible_to_students,
  r.visible_to_ai,
  r.visible_to_training,
  r.processing_status,
  count(*)::int as resource_count,
  count(*) filter (where r.extracted_text is not null)::int as extracted_count,
  count(distinct c.resource_id)::int as chunked_count,
  count(distinct c.resource_id) filter (where c.embedding is not null)::int as embedded_count
from public.resources r
left join public.ai_chunks c on c.resource_id = r.id
group by r.resource_type, r.visible_to_students, r.visible_to_ai, r.visible_to_training, r.processing_status;

create or replace view public.knowledge_center_failed_jobs as
select j.id, j.resource_id, r.title, r.resource_type, j.status, j.error_message, j.retry_count, j.updated_at
from public.processing_jobs j
join public.resources r on r.id = j.resource_id
where j.status = 'failed'
order by j.updated_at desc;


-- ===== 20260713000001_knowledge_library.sql =====
-- Knowledge Library redesign — collections hierarchy + granular processing stages.
--
-- SAFETY: 475 real resources and 761 real processing_jobs rows already exist in
-- production. Every change here is additive (new nullable columns / new tables);
-- nothing existing is renamed, dropped, or made non-null without a default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New resource_type values needed by the full Knowledge Library taxonomy.
--    (PAST_PAPER/MARKING_SCHEME/GRADE_THRESHOLD/EXAMINER_REPORT already exist
--    and are in real use — untouched.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources add constraint resources_resource_type_check check (resource_type in (
  'PAST_PAPER','MARKING_SCHEME','GRADE_THRESHOLD','EXAMINER_REPORT','INSERT','SOURCE_FILE',
  'NOTES','WORKSHEET','TEST','TOPICAL','SYLLABUS','OTHER',
  'TEACHER_NOTES','PRIVATE_GUIDE','FORMULA_SHEET','BOOK','FLASHCARDS','AI_NOTES','VIDEO',
  -- Knowledge Library additions:
  'SPECIMEN_PAPER','LESSON_PLAN','SLIDES'
));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Collections — the fixed Knowledge Library hierarchy. Every resource_type
--    auto-maps to exactly one collection (resource_type_collection_map), so
--    filing is automatic; admins may still move a resource via collection_id.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.knowledge_collections (
  id          bigserial primary key,
  key         text not null unique,
  parent_key  text references public.knowledge_collections(key) on delete cascade,
  name        text not null,
  icon        text,
  sort_order  integer not null default 0,
  is_system   boolean not null default true
);

insert into public.knowledge_collections (key, parent_key, name, icon, sort_order) values
  ('cambridge',        null,        'Cambridge Resources',  'graduation-cap', 1),
  ('cambridge.papers',       'cambridge', 'Past Papers',           'file-text',      1),
  ('cambridge.schemes',      'cambridge', 'Mark Schemes',          'check-square',   2),
  ('cambridge.reports',      'cambridge', 'Examiner Reports',      'message-square', 3),
  ('cambridge.thresholds',   'cambridge', 'Grade Thresholds',      'bar-chart',      4),
  ('cambridge.specimen',     'cambridge', 'Specimen Papers',       'file-plus',      5),

  ('teacher',           null,        'Teacher Resources',    'user-check',     2),
  ('teacher.notes',          'teacher',   'Teacher Notes',         'sticky-note',    1),
  ('teacher.guides',         'teacher',   'Private Teaching Guides','lock',          2),
  ('teacher.lessons',        'teacher',   'Lesson Plans',          'calendar',       3),
  ('teacher.formulas',       'teacher',   'Formula Sheets',        'sigma',          4),
  ('teacher.books',          'teacher',   'Books',                 'book',           5),
  ('teacher.slides',         'teacher',   'Slides',                'presentation',   6),

  ('student',           null,        'Student Resources',    'users',          3),
  ('student.notes',          'student',   'Notes',                 'file-text',      1),
  ('student.flashcards',     'student',   'Flashcards',            'layers',         2),
  ('student.worksheets',     'student',   'Worksheets',            'edit-3',         3),
  ('student.tests',          'student',   'Practice Tests',        'clipboard-check',4),

  ('videos',            null,        'Videos',                'video',          4),
  ('other',             null,        'Other',                 'folder',         5)
on conflict (key) do nothing;

create table if not exists public.resource_type_collection_map (
  resource_type   text primary key,
  collection_key  text not null references public.knowledge_collections(key) on delete restrict
);

insert into public.resource_type_collection_map (resource_type, collection_key) values
  ('PAST_PAPER',      'cambridge.papers'),
  ('MARKING_SCHEME',  'cambridge.schemes'),
  ('EXAMINER_REPORT', 'cambridge.reports'),
  ('GRADE_THRESHOLD', 'cambridge.thresholds'),
  ('SPECIMEN_PAPER',  'cambridge.specimen'),
  ('INSERT',          'cambridge.papers'),
  ('TOPICAL',         'cambridge.papers'),
  ('SYLLABUS',        'cambridge'),

  ('TEACHER_NOTES',   'teacher.notes'),
  ('PRIVATE_GUIDE',   'teacher.guides'),
  ('LESSON_PLAN',     'teacher.lessons'),
  ('FORMULA_SHEET',   'teacher.formulas'),
  ('BOOK',            'teacher.books'),
  ('SLIDES',          'teacher.slides'),

  ('NOTES',           'student.notes'),
  ('AI_NOTES',        'student.notes'),
  ('FLASHCARDS',      'student.flashcards'),
  ('WORKSHEET',       'student.worksheets'),
  ('TEST',            'student.tests'),

  ('VIDEO',           'videos'),
  ('SOURCE_FILE',     'other'),
  ('OTHER',           'other')
on conflict (resource_type) do nothing;

alter table public.resources
  add column if not exists collection_id bigint references public.knowledge_collections(id) on delete set null;

-- Auto-assign collection on insert/type-change unless the admin already set one explicitly.
create or replace function public.assign_resource_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection_id is null then
    select kc.id into new.collection_id
    from public.resource_type_collection_map map
    join public.knowledge_collections kc on kc.key = map.collection_key
    where map.resource_type = new.resource_type;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_resource_collection_before_write on public.resources;
create trigger assign_resource_collection_before_write
before insert or update of resource_type on public.resources
for each row execute function public.assign_resource_collection();

-- Backfill collection_id for the 475 resources already in production.
update public.resources r
set collection_id = kc.id
from public.resource_type_collection_map map
join public.knowledge_collections kc on kc.key = map.collection_key
where map.resource_type = r.resource_type and r.collection_id is null;

create index if not exists resources_collection_idx on public.resources (collection_id);

alter table public.knowledge_collections enable row level security;
alter table public.resource_type_collection_map enable row level security;
drop policy if exists "knowledge_collections_read" on public.knowledge_collections;
create policy "knowledge_collections_read" on public.knowledge_collections for select using (true);
drop policy if exists "resource_type_collection_map_read" on public.resource_type_collection_map;
create policy "resource_type_collection_map_read" on public.resource_type_collection_map for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Granular processing pipeline stages. Additive: existing 761 rows keep
--    stage = null (meaning "processed under the old coarse-status pipeline");
--    new runs populate it at every real step so the UI can show live progress.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.processing_jobs
  add column if not exists stage text
    check (stage is null or stage in (
      'reading_pdf','ocr','extracting_questions','finding_metadata',
      'matching_mark_scheme','topic_classification','embedding',
      'knowledge_graph','training_dataset','completed'
    )),
  add column if not exists stage_detail jsonb not null default '{}'::jsonb;

create index if not exists processing_jobs_stage_idx on public.processing_jobs (stage) where stage is not null;


-- ===== 20260714000001_topic_method_local_api.sql =====
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


-- ===== 20260714000002_fix_admin_policy_auth_users_bug.sql =====
-- Fix a real bug: 4 admin-check RLS policies added this session queried
-- auth.users directly ("select email from auth.users where id = auth.uid()"),
-- but the `authenticated` role has no SELECT grant on auth.users. Because
-- Postgres must evaluate EVERY permissive policy on a table to decide access,
-- one policy hitting "permission denied for table users" (42501) fails the
-- WHOLE query — even though a separate, correct policy would have
-- independently allowed the read. This broke every student-facing query
-- against resources/ai_chunks (surfaced as the dashboard's "Connect Supabase"
-- fallback, itself a second bug — see dashboard.tsx's describeError fix).
--
-- The established, working pattern already used elsewhere in this codebase
-- since the very first migration is auth.jwt() ->> 'email' — it reads the
-- email claim directly from the request JWT, no table access needed at all.

drop policy if exists "taxonomy_topics_admin_write" on public.taxonomy_topics;
create policy "taxonomy_topics_admin_write" on public.taxonomy_topics
  for all using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "knowledge_edges_admin_write" on public.knowledge_edges;
create policy "knowledge_edges_admin_write" on public.knowledge_edges
  for all using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "Admins read all resources" on public.resources;
create policy "Admins read all resources" on public.resources
  for select to authenticated using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "Admins read all ai_chunks" on public.ai_chunks;
create policy "Admins read all ai_chunks" on public.ai_chunks
  for select to authenticated using (
    exists (select 1 from public.admin_users au where lower(au.email) = lower(auth.jwt() ->> 'email'))
  );

