alter table public.question_index
  add column if not exists question_part text,
  add column if not exists text_quality_score numeric(4,3) check (text_quality_score is null or text_quality_score between 0 and 1),
  add column if not exists marking_scheme_link_status text not null default 'unlinked' check (marking_scheme_link_status in ('linked','partial','unlinked','needs_review')),
  add column if not exists student_verified boolean not null default false;

alter table public.question_index drop constraint if exists question_index_text_quality_status_check;
update public.question_index set text_quality_status=case text_quality_status when 'verified' then 'good' when 'rejected' then 'failed' else text_quality_status end;
alter table public.question_index add constraint question_index_text_quality_status_check check (text_quality_status in ('good','acceptable','needs_review','failed'));

update public.question_index set
  question_part=nullif(substring(question_number from '(\(.+\))$'),''),
  text_quality_score=case when clean_question_text is null or length(btrim(clean_question_text))<20 then 0.20 when lower(clean_question_text) ~ '(answer all questions|write your name|blank page|do not write in this margin)' then 0.10 when length(clean_question_text)>=50 then 0.95 else 0.75 end,
  text_quality_status=case when clean_question_text is null or length(btrim(clean_question_text))<20 then 'needs_review' when lower(clean_question_text) ~ '(answer all questions|write your name|blank page|do not write in this margin)' then 'failed' when length(clean_question_text)>=50 then 'good' else 'acceptable' end,
  marking_scheme_link_status=case when answer_text is not null and btrim(answer_text)<>'' then 'linked' else 'unlinked' end;

update public.question_index q set topic='Light',subtopic=case when lower(q.clean_question_text) ~ 'total internal reflection|critical angle' then 'Total Internal Reflection' when lower(q.clean_question_text) ~ 'refractive index|refract' then 'Refraction' when lower(q.clean_question_text) ~ 'lens|image formation' then 'Lenses and Image Formation' else 'Light' end,confidence=0.90,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='Phase 1 strict Physics Light evidence'
from public.subjects s where q.subject_id=s.id and s.code='5054' and (q.needs_review or coalesce(q.confidence,0)<0.85) and lower(coalesce(q.clean_question_text,'')) ~ 'refraction|refractive index|total internal reflection|critical angle|ray diagram|lens|image formation|dispersion';

update public.question_index q set topic='Energy',subtopic=case when lower(q.clean_question_text) ~ 'kinetic energy' then 'Kinetic Energy' when lower(q.clean_question_text) ~ 'gravitational potential energy' then 'Gravitational Potential Energy' when lower(q.clean_question_text) ~ 'efficien' then 'Efficiency' when lower(q.clean_question_text) ~ 'power' then 'Power' else 'Work, Energy and Power' end,confidence=0.90,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='Phase 1 strict Physics Energy evidence'
from public.subjects s where q.subject_id=s.id and s.code='5054' and (q.needs_review or coalesce(q.confidence,0)<0.85) and lower(coalesce(q.clean_question_text,'')) ~ 'kinetic energy|gravitational potential energy|work done|efficien|energy transfer|conservation of energy|power';

update public.question_index q set topic='Graphs and Functions',subtopic=case when lower(q.clean_question_text) ~ 'gradient|intercept|equation of (a|the) line' then 'Coordinate Geometry' else 'Graphs' end,confidence=0.92,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='Phase 1 Maths graph-first evidence'
from public.subjects s where q.subject_id=s.id and s.code='4024' and (q.needs_review or coalesce(q.confidence,0)<0.85 or q.topic='Geometry') and lower(coalesce(q.clean_question_text,'')) ~ 'graph|curve|coordinate axes|plot|gradient|intercept|equation of (a|the) line|function';

update public.question_index q set topic='Geometry',subtopic='Circle Theorems',confidence=0.92,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='Phase 1 strong Maths circle-theorem evidence'
from public.subjects s where q.subject_id=s.id and s.code='4024' and (q.needs_review or coalesce(q.confidence,0)<0.85) and lower(coalesce(q.clean_question_text,'')) ~ 'circle theorem|cyclic quadrilateral|alternate segment|angle at (the )?(centre|center|circumference)|tangent.*(circle|chord)|chord.*(circle|tangent)' and lower(coalesce(q.clean_question_text,'')) !~ 'graph|curve|coordinate axes|plot|gradient|intercept';

update public.question_index set needs_review=true,topic_classified=false,tagging_note=coalesce(tagging_note,'') || case when coalesce(tagging_note,'')='' then '' else '; ' end || 'Phase 1 data-quality review'
where text_quality_status in ('needs_review','failed') or clean_question_text is null or topic is null or lower(coalesce(topic,''))='unclassified' or coalesce(confidence,0)<0.60;

update public.question_index set student_verified=clean_question_text is not null and length(btrim(clean_question_text))>=20 and text_quality_status in ('good','acceptable') and topic is not null and lower(topic)<>'unclassified' and coalesce(confidence,0)>=0.60 and not needs_review and resource_id is not null and year is not null and session is not null and paper_code is not null and variant is not null and question_number is not null;

create index if not exists question_index_student_verified_idx on public.question_index(subject_id,topic,subtopic,confidence desc,year desc) where student_verified;
