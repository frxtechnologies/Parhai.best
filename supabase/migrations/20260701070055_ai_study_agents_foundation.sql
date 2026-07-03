create table if not exists public.paper_analyses (
  id bigserial primary key,
  resource_id bigint not null references public.resources(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  paper_code text,
  analysis_json jsonb not null,
  indexed_count integer not null default 0,
  verified_count integer not null default 0,
  linked_marking_scheme_count integer not null default 0,
  total_marks integer not null default 0,
  completeness_status text not null check (completeness_status in ('complete','partial','insufficient')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(resource_id)
);

create table if not exists public.repeated_topic_stats (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level text not null,
  syllabus_code text not null,
  topic text not null,
  subtopic text,
  year_range_start integer not null,
  year_range_end integer not null,
  paper_filter text,
  variant_filter integer,
  question_count integer not null default 0,
  total_marks integer not null default 0,
  years_appeared integer[] not null default '{}',
  sessions_appeared text[] not null default '{}',
  difficulty_breakdown_json jsonb not null default '{}',
  prediction_score numeric(5,2) not null default 0,
  prediction_label text not null check (prediction_label in ('High chance','Medium chance','Low chance')),
  trend_label text not null check (trend_label in ('increasing','stable','decreasing')),
  source_question_ids bigint[] not null default '{}',
  generated_at timestamptz not null default now(),
  unique(subject_id,topic,subtopic,year_range_start,year_range_end,paper_filter,variant_filter)
);

create table if not exists public.revision_plans (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  level text not null,
  syllabus_code text not null,
  current_grade text,
  target_grade text not null,
  exam_date date not null,
  hours_per_day numeric(4,2) not null check (hours_per_day > 0 and hours_per_day <= 12),
  plan_length_days integer not null check (plan_length_days in (7,14,30,90)),
  weak_topics text[] not null default '{}',
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paper_analyses enable row level security;
alter table public.repeated_topic_stats enable row level security;
alter table public.revision_plans enable row level security;

create policy "Signed in users read paper analyses" on public.paper_analyses
  for select to authenticated using (true);
create policy "Signed in users read repeated topic stats" on public.repeated_topic_stats
  for select to authenticated using (true);
create policy "Students read own revision plans" on public.revision_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students create own revision plans" on public.revision_plans
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students update own revision plans" on public.revision_plans
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Students delete own revision plans" on public.revision_plans
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.paper_analyses, public.repeated_topic_stats to authenticated;
grant select, insert, update, delete on public.revision_plans to authenticated;
grant usage, select on sequence public.paper_analyses_id_seq to authenticated;
grant usage, select on sequence public.repeated_topic_stats_id_seq to authenticated;
grant usage, select on sequence public.revision_plans_id_seq to authenticated;
