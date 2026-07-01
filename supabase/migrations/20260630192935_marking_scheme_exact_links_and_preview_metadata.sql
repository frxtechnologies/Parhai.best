alter table public.marking_scheme_answers
  add column if not exists bbox jsonb,
  add column if not exists status text not null default 'extracted'
    check (status in ('extracted','needs_review','failed'));

alter table public.question_index
  drop constraint if exists question_index_marking_scheme_link_status_check;

alter table public.question_index
  add constraint question_index_marking_scheme_link_status_check
  check (marking_scheme_link_status in (
    'linked', 'partial', 'linked_exact', 'linked_partial',
    'unlinked', 'ms_resource_missing', 'ms_answer_missing', 'needs_review'
  ));

create index if not exists marking_scheme_answers_exact_lookup_idx
  on public.marking_scheme_answers(resource_id, question_number, question_part, status);
