update public.question_index q
set topic = case
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(lens|mirror|refraction|reflection|light|optic)' then 'Light'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(current|voltage|resistance|circuit|charge|electric)' then 'Electricity'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(wave|frequency|wavelength|oscillation|sound)' then 'Waves'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(speed|velocity|acceleration|distance|motion|kinematic)' then 'Motion'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(force|moment|pressure|mass|weight|momentum)' then 'Forces'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(energy|power|work|efficiency)' then 'Energy'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(thermal|heat|temperature|gas)' then 'Thermal Physics'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(magnet|induction|transformer)' then 'Magnetism'
  when lower(s.name) like '%physics%' and lower(q.question_text) ~ '(atomic|radioactive|radiation|nucleus)' then 'Atomic Physics'
  when lower(s.name) like '%physics%' then 'General Physics'
  when lower(s.name) like '%chem%' then 'General Chemistry'
  when lower(s.name) like '%bio%' then 'General Biology'
  when lower(s.name) like '%math%' then 'General Mathematics'
  else 'General ' || s.name
end,
updated_at = now()
from public.subjects s
where s.id = q.subject_id
  and (q.topic is null or btrim(q.topic) = '' or lower(q.topic) = 'unclassified');

update public.questions q
set topic = case
  when lower(s.name) like '%physics%' and lower(coalesce(q.question_text, q.question, q.extracted_text, '')) ~ '(lens|mirror|refraction|reflection|light|optic)' then 'Light'
  when lower(s.name) like '%physics%' and lower(coalesce(q.question_text, q.question, q.extracted_text, '')) ~ '(current|voltage|resistance|circuit|charge|electric)' then 'Electricity'
  when lower(s.name) like '%physics%' and lower(coalesce(q.question_text, q.question, q.extracted_text, '')) ~ '(wave|frequency|wavelength|oscillation|sound)' then 'Waves'
  when lower(s.name) like '%physics%' and lower(coalesce(q.question_text, q.question, q.extracted_text, '')) ~ '(speed|velocity|acceleration|distance|motion|kinematic)' then 'Motion'
  when lower(s.name) like '%physics%' then 'General Physics'
  when lower(s.name) like '%chem%' then 'General Chemistry'
  when lower(s.name) like '%bio%' then 'General Biology'
  when lower(s.name) like '%math%' then 'General Mathematics'
  else 'General ' || s.name
end
from public.subjects s
where s.id = q.subject_id
  and (q.topic is null or btrim(q.topic) = '' or lower(q.topic) = 'unclassified');

alter table public.question_index
  drop constraint if exists question_index_topic_classified_check,
  add constraint question_index_topic_classified_check check (btrim(topic) <> '' and lower(topic) <> 'unclassified');

alter table public.questions
  drop constraint if exists questions_topic_classified_check,
  add constraint questions_topic_classified_check check (btrim(topic) <> '' and lower(topic) <> 'unclassified');

create index if not exists question_index_subject_topic_lower_idx on public.question_index(subject_id, lower(topic));
create index if not exists questions_subject_topic_lower_idx on public.questions(subject_id, lower(topic));
