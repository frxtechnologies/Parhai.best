alter table public.question_index
  add column if not exists text_quality_status text not null default 'needs_review'
    check (text_quality_status in ('verified', 'needs_review', 'rejected'));

update public.question_index
set text_quality_status = case
  when clean_question_text is null or length(btrim(clean_question_text)) < 20 then 'needs_review'
  when lower(clean_question_text) ~ '(answer all questions|write your name|blank page|do not write in this margin)' then 'rejected'
  else 'verified'
end;

create index if not exists question_index_verified_retrieval_idx
  on public.question_index(subject_id, topic, subtopic, confidence desc)
  where needs_review = false and text_quality_status = 'verified';
