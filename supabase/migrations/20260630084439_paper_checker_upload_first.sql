alter table public.paper_check_submissions
  add column uploaded_file_path text,
  add column upload_file_name text,
  add column extraction_status text not null default 'pending' check (extraction_status in ('pending','extracting','extracted','needs_manual_review','failed')),
  add column marking_status text not null default 'pending' check (marking_status in ('pending','marking','completed','needs_review','failed'));

create table public.paper_check_extracted_answers (
  id bigserial primary key,
  submission_id uuid not null references public.paper_check_submissions(id) on delete cascade,
  question_id bigint references public.question_index(id) on delete restrict,
  question_number text not null,
  question_part text,
  extracted_answer_text text not null default '',
  corrected_answer_text text,
  extraction_confidence numeric(4,3) not null default 0 check (extraction_confidence between 0 and 1),
  page_number integer,
  bbox jsonb,
  needs_student_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_check_marking_results (
  id bigserial primary key,
  submission_id uuid not null references public.paper_check_submissions(id) on delete cascade,
  extracted_answer_id bigint not null references public.paper_check_extracted_answers(id) on delete cascade,
  question_id bigint not null references public.question_index(id) on delete restrict,
  marking_scheme_answer_id bigint references public.marking_scheme_answers(id) on delete set null,
  awarded_marks numeric(6,2),
  max_marks numeric(6,2) not null,
  correct_points jsonb not null default '[]',
  missing_points jsonb not null default '[]',
  mistake_type text,
  feedback text not null,
  improvement_tip text,
  marking_confidence numeric(4,3) not null default 0 check (marking_confidence between 0 and 1),
  needs_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paper_check_extracted_answers enable row level security;
alter table public.paper_check_marking_results enable row level security;
create policy "Students read own extracted answers" on public.paper_check_extracted_answers for select to authenticated using (exists(select 1 from public.paper_check_submissions s where s.id=submission_id and s.user_id=(select auth.uid())));
create policy "Students read own marking results" on public.paper_check_marking_results for select to authenticated using (exists(select 1 from public.paper_check_submissions s where s.id=submission_id and s.user_id=(select auth.uid())));
create policy "Admins read extracted answers" on public.paper_check_extracted_answers for select to authenticated using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
create policy "Admins read marking results" on public.paper_check_marking_results for select to authenticated using (exists(select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
revoke all on public.paper_check_extracted_answers,public.paper_check_marking_results from anon,authenticated;
grant select on public.paper_check_extracted_answers,public.paper_check_marking_results to authenticated;
revoke all on sequence public.paper_check_extracted_answers_id_seq,public.paper_check_marking_results_id_seq from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('paper-checker-submissions','paper-checker-submissions',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
