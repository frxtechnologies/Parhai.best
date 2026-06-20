alter table public.questions
  add column if not exists question_text text generated always as (question) stored;

create index if not exists questions_search_text_idx
  on public.questions using gin (
    to_tsvector('english', coalesce(question_text, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(subtopic, ''))
  );

grant select on public.questions to authenticated;
