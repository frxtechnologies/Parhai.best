alter table public.question_index
  drop constraint if exists question_index_topic_classified_check,
  alter column topic drop not null,
  add column if not exists raw_extracted_text text,
  add column if not exists clean_question_text text,
  add column if not exists display_question_text text,
  add column if not exists total_marks integer check (total_marks is null or total_marks >= 0),
  add column if not exists topic_classified boolean not null default false;

update public.question_index
set raw_extracted_text = coalesce(raw_extracted_text, question_text),
    clean_question_text = coalesce(clean_question_text, question_text),
    display_question_text = coalesce(display_question_text, question_text),
    total_marks = coalesce(total_marks, marks),
    topic_classified = coalesce(confidence, 0) >= 0.85 and lower(coalesce(topic,'')) <> 'unclassified';

alter table public.resources
  add column if not exists extracted_text_length integer not null default 0,
  add column if not exists detected_question_count integer not null default 0,
  add column if not exists saved_question_count integer not null default 0,
  add column if not exists topic_tagging_status text,
  add column if not exists marking_scheme_link_status text;

update public.topic_maps
set keywords = array_remove(keywords, 'energy'), updated_at = now()
where subject_code = '5054' and topic = 'Electricity';

update public.resources r
set status = 'failed',
    processing_status = 'failed',
    processing_error = 'Stability audit: question paper was marked processed with 0 indexed questions. Reprocess or review extraction.',
    topic_tagging_status = 'extraction_failed',
    updated_at = now()
where r.resource_type in ('PAST_PAPER','WORKSHEET','TEST','TOPICAL')
  and r.processing_status = 'processed'
  and not exists (select 1 from public.question_index qi where qi.resource_id = r.id);
