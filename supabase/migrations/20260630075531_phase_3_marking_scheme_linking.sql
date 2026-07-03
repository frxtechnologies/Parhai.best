create table if not exists public.marking_scheme_answers (
  id bigserial primary key,
  resource_id bigint not null references public.resources(id) on delete cascade,
  question_number text not null,
  question_part text,
  raw_answer_text text,
  clean_answer_text text not null,
  marking_points text[] not null default '{}',
  marks integer check (marks is null or marks >= 0),
  source_page integer check (source_page is null or source_page > 0),
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(resource_id, question_number, question_part)
);

alter table public.marking_scheme_answers enable row level security;
create policy "Marking scheme answers readable by signed-in users"
  on public.marking_scheme_answers for select to authenticated using (true);
create policy "Admins manage marking scheme answers"
  on public.marking_scheme_answers for all to authenticated
  using (exists (select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')))
  with check (exists (select 1 from public.admin_users a where lower(a.email)=lower(auth.jwt()->>'email')));
grant select on public.marking_scheme_answers to authenticated;

alter table public.question_index
  add column if not exists marking_scheme_answer_id bigint references public.marking_scheme_answers(id) on delete set null,
  add column if not exists marking_scheme_link_confidence numeric(4,3) check (marking_scheme_link_confidence is null or marking_scheme_link_confidence between 0 and 1);

create index if not exists marking_scheme_answers_lookup_idx
  on public.marking_scheme_answers(resource_id,question_number,question_part);
create index if not exists question_index_marking_scheme_answer_idx
  on public.question_index(marking_scheme_answer_id) where marking_scheme_answer_id is not null;

-- Preserve existing links while making their provenance state explicit.
update public.question_index
set marking_scheme_link_confidence=case marking_scheme_link_status when 'linked' then 0.90 when 'partial' then 0.70 else null end
where answer_text is not null and marking_scheme_link_confidence is null;
