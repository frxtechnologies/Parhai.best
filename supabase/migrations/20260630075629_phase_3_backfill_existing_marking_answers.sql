insert into public.marking_scheme_answers
  (resource_id,question_number,question_part,raw_answer_text,clean_answer_text,confidence)
select distinct on (m.id,q.question_number,q.question_part)
  m.id,
  substring(q.question_number from '^\d+'),
  q.question_part,
  q.answer_text,
  q.answer_text,
  case when q.marking_scheme_link_status='linked' then 0.90 else 0.70 end
from public.question_index q
join public.resources m on m.related_resource_id=q.resource_id
  and m.resource_type='MARKING_SCHEME'
where nullif(btrim(q.answer_text),'') is not null
  and substring(q.question_number from '^\d+') is not null
order by m.id,q.question_number,q.question_part,m.updated_at desc
on conflict (resource_id,question_number,question_part) do nothing;

update public.question_index q
set marking_scheme_answer_id=a.id
from public.resources m
join public.marking_scheme_answers a on a.resource_id=m.id
where m.related_resource_id=q.resource_id
  and a.question_number=substring(q.question_number from '^\d+')
  and a.question_part is not distinct from q.question_part
  and q.marking_scheme_answer_id is null;
