alter table public.question_index
  add column if not exists question_type_confidence numeric(4,3)
    check (question_type_confidence is null or question_type_confidence between 0 and 1),
  add column if not exists question_type_needs_review boolean not null default true,
  add column if not exists question_type_reason text,
  add column if not exists question_type_metadata jsonb not null default '{}'::jsonb,
  add column if not exists topic_source text not null default 'unknown'
    check (topic_source in ('admin_verified','ai_tagged','inferred_from_text','imported','unknown'));

update public.question_index
set question_type = case
      when question_type in ('calculation-based','calculation') then 'calculation'
      when question_type in ('graph-based','graph') then 'graph'
      when question_type in ('diagram-based','diagram') then 'diagram'
      when question_type in ('definition-based','definition') then 'definition'
      when question_type in ('explanation-based','explanation') then 'explanation'
      when question_type in ('data/table-based','data_table') then 'data_table'
      when question_type in ('practical/experimental','practical') then 'practical'
      when question_type in ('theory-based','theory') then 'theory'
      when question_type = 'mixed' then 'mixed'
      else 'unknown'
    end,
    question_type_needs_review = question_type is null or question_type not in (
      'calculation-based','calculation','graph-based','graph','diagram-based','diagram',
      'definition-based','definition','explanation-based','explanation',
      'data/table-based','data_table','practical/experimental','practical',
      'theory-based','theory','mixed'
    ),
    question_type_confidence = case when question_type is null then 0.25 else coalesce(question_type_confidence,0.75) end,
    question_type_reason = coalesce(question_type_reason,'Normalized from the existing deterministic classifier.'),
    question_type_metadata = coalesce(question_type_metadata,'{}'::jsonb),
    topic_source = case
      when tagging_method ilike '%manual%' then 'admin_verified'
      when tagging_method ilike '%ai%' then 'ai_tagged'
      when tagging_method is not null then 'inferred_from_text'
      else 'unknown'
    end;

alter table public.question_index drop constraint if exists question_index_question_type_check;
alter table public.question_index add constraint question_index_question_type_check
  check (question_type in ('calculation','theory','diagram','graph','definition','explanation','data_table','practical','mixed','unknown'));

create index if not exists question_index_strict_retrieval_idx
  on public.question_index(subject_id,paper_code,year,question_type)
  where student_verified=true and needs_review=false;
