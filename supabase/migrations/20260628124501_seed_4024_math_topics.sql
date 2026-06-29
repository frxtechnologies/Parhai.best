insert into public.topic_maps(subject_code,topic,subtopic,keywords,status,source) values
('4024','Geometry','Circles',array['circle','circles','radius','diameter','arc','sector','circumference'],'approved','manual'),
('4024','Geometry','Circle Theorems',array['circle theorem','circle theorems','cyclic quadrilateral','tangent','chord','alternate segment','angle at the centre'],'approved','manual'),
('4024','Geometry','Mensuration',array['area','perimeter','volume','surface area','cylinder','cone','sphere'],'approved','manual'),
('4024','Algebra','Expressions and Equations',array['algebra','equation','expression','factorise','factorize','expand','simultaneous equation'],'approved','manual'),
('4024','Trigonometry','Trigonometry',array['trigonometry','sine','cosine','tangent ratio','bearing','angle of elevation'],'approved','manual')
on conflict(subject_code,topic,subtopic) do update set keywords=excluded.keywords,status='approved',source='manual',updated_at=now();

alter table public.question_index drop constraint if exists question_index_screenshot_status_check;
alter table public.question_index add constraint question_index_screenshot_status_check
check (screenshot_status in ('pending','generated','failed','failed_page_match','not_generated','full_page_fallback'));

update public.question_index qi
set topic='Geometry',
    subtopic=case when qi.question_text ~* '(cyclic quadrilateral|circle theorem|tangent|chord|alternate segment|angle at the centre)' then 'Circle Theorems' else 'Circles' end,
    tagging_method='keyword',tagging_note='4024 circle keyword backfill',confidence=0.92,
    topic_classified=true,needs_review=false,updated_at=now()
where qi.subject_id=(select id from public.subjects where code='4024' limit 1)
  and qi.question_text ~* '\m(circle|circles|cyclic|tangent|chord|radius|diameter|arc|sector)\M';

update public.question_index qi set topic='Graphs and Functions',
subtopic=case when qi.question_text ~* '(coordinate|gradient|intercept|equation of (a|the) line)' then 'Coordinate Geometry' else 'Graphs' end,
confidence=0.90,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='4024 graph-first rules'
where qi.subject_id=(select id from public.subjects where code='4024' limit 1)
and qi.question_text ~* '\m(graph|grid|plot|curve|gradient|intercept|function)\M|f\s*\(|y\s*=';

update public.question_index qi set topic='Geometry',subtopic='Circle Theorems',
confidence=0.90,needs_review=false,topic_classified=true,tagging_method='keyword',tagging_note='4024 strong circle-theorem rules'
where qi.subject_id=(select id from public.subjects where code='4024' limit 1)
and qi.question_text ~* '(cyclic quadrilateral|circle theorem|angle at (the )?(centre|center|circumference)|alternate segment|tangent.*(circle|chord)|chord.*(circle|tangent))'
and qi.question_text !~* '\m(graph|grid|plot|curve|gradient|intercept|function)\M|f\s*\(|y\s*=';

update public.question_index qi set topic='Geometry',subtopic='Circles',
confidence=0.68,needs_review=true,topic_classified=false,tagging_method='keyword',tagging_note='Topic needs review'
where qi.subject_id=(select id from public.subjects where code='4024' limit 1)
and qi.question_text ~* '\m(circle|radius|diameter|arc|sector|circumference)\M'
and qi.question_text !~* '(cyclic quadrilateral|circle theorem|angle at (the )?(centre|center|circumference)|alternate segment|tangent.*(circle|chord)|chord.*(circle|tangent))'
and qi.question_text !~* '\m(graph|grid|plot|curve|gradient|intercept|function)\M|f\s*\(|y\s*=';

update public.question_index qi set topic='Unclassified',subtopic=null,confidence=0,
needs_review=true,topic_classified=false,tagging_method='keyword',tagging_note='Instruction/front-page extraction; reprocess question splitting'
where qi.subject_id=(select id from public.subjects where code='4024' limit 1)
and qi.question_text ~* '(instructions|you must answer on the question paper|answer all questions)';
