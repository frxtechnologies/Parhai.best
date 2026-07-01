create table public.paper_check_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id bigint not null references public.resources(id) on delete restrict,
  subject_code text not null,
  year integer not null,
  session text not null,
  paper_number integer not null,
  variant integer not null,
  status text not null default 'processing' check (status in ('processing','completed','needs_review','failed')),
  total_awarded_marks numeric(8,2) not null default 0,
  total_possible_marks numeric(8,2) not null default 0,
  percentage numeric(5,2) not null default 0 check (percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_check_answers (
  id bigserial primary key,
  submission_id uuid not null references public.paper_check_submissions(id) on delete cascade,
  question_id bigint not null references public.question_index(id) on delete restrict,
  question_number text not null,
  question_part text,
  student_answer text not null default '',
  awarded_marks numeric(6,2),
  max_marks numeric(6,2) not null default 0,
  feedback text not null,
  examiner_tip text,
  missing_points jsonb not null default '[]',
  correct_points jsonb not null default '[]',
  mistake_type text,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  marking_status text not null check (marking_status in ('official_scheme','unavailable','needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id,question_id)
);

alter table public.paper_check_submissions enable row level security;
alter table public.paper_check_answers enable row level security;

create policy "Students read own paper checks" on public.paper_check_submissions
  for select to authenticated using ((select auth.uid())=user_id);
create policy "Admins read all paper checks" on public.paper_check_submissions
  for select to authenticated using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
create policy "Students read own paper check answers" on public.paper_check_answers
  for select to authenticated using (exists(select 1 from public.paper_check_submissions s where s.id=submission_id and s.user_id=(select auth.uid())));
create policy "Admins read all paper check answers" on public.paper_check_answers
  for select to authenticated using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));

grant select on public.paper_check_submissions,public.paper_check_answers to authenticated;
create index paper_check_submissions_owner_idx on public.paper_check_submissions(user_id,created_at desc);
create index paper_check_answers_submission_idx on public.paper_check_answers(submission_id,question_number);
