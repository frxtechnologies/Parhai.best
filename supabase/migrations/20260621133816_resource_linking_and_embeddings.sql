alter table public.resources
  add column if not exists level text,
  add column if not exists status text not null default 'uploaded',
  add column if not exists related_resource_id bigint references public.resources(id) on delete set null;

update public.resources r
set level = s.level
from public.subjects s
where s.id = r.subject_id and r.level is null;

update public.resources
set status = case processing_status
  when 'processing' then 'processing'
  when 'processed' then 'processed'
  when 'failed' then 'failed'
  else 'uploaded'
end;

alter table public.resources
  alter column level set not null,
  drop constraint if exists resources_level_check,
  add constraint resources_level_check check (level in ('O_LEVEL', 'A_LEVEL')),
  drop constraint if exists resources_status_check,
  add constraint resources_status_check check (status in ('uploaded', 'processing', 'processed', 'failed')),
  drop constraint if exists resources_resource_type_check,
  add constraint resources_resource_type_check check (resource_type in (
    'PAST_PAPER', 'MARKING_SCHEME', 'NOTES', 'WORKSHEET', 'TEST', 'TOPICAL', 'SYLLABUS', 'OTHER'
  ));

create index if not exists resources_paper_lookup_idx
  on public.resources(subject_id, level, year, session, paper_code, variant, resource_type);
create index if not exists resources_related_resource_idx
  on public.resources(related_resource_id) where related_resource_id is not null;

create or replace function public.link_resource_to_paper()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resource_type = 'MARKING_SCHEME' then
    select paper.id into new.related_resource_id
    from public.resources paper
    where paper.subject_id = new.subject_id
      and paper.level = new.level
      and paper.resource_type = 'PAST_PAPER'
      and paper.year is not distinct from new.year
      and paper.session is not distinct from new.session
      and paper.paper_code is not distinct from new.paper_code
      and paper.variant is not distinct from new.variant
    order by paper.created_at desc
    limit 1;
  elsif new.resource_type <> 'PAST_PAPER' then
    new.related_resource_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_resource_to_paper() from public, anon, authenticated;

drop trigger if exists link_resource_to_paper_before_write on public.resources;
create trigger link_resource_to_paper_before_write
before insert or update of subject_id, level, resource_type, year, session, paper_code, variant
on public.resources
for each row execute function public.link_resource_to_paper();

create or replace function public.link_schemes_after_paper_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resource_type = 'PAST_PAPER' then
    update public.resources scheme
    set related_resource_id = new.id
    where scheme.resource_type = 'MARKING_SCHEME'
      and scheme.subject_id = new.subject_id
      and scheme.level = new.level
      and scheme.year is not distinct from new.year
      and scheme.session is not distinct from new.session
      and scheme.paper_code is not distinct from new.paper_code
      and scheme.variant is not distinct from new.variant;
  end if;
  return new;
end;
$$;

revoke all on function public.link_schemes_after_paper_write() from public, anon, authenticated;
drop trigger if exists link_schemes_after_paper_write on public.resources;
create trigger link_schemes_after_paper_write
after insert or update of subject_id, level, resource_type, year, session, paper_code, variant
on public.resources
for each row execute function public.link_schemes_after_paper_write();

update public.resources scheme
set related_resource_id = paper.id
from public.resources paper
where scheme.resource_type = 'MARKING_SCHEME'
  and paper.resource_type = 'PAST_PAPER'
  and paper.subject_id = scheme.subject_id
  and paper.level = scheme.level
  and paper.year is not distinct from scheme.year
  and paper.session is not distinct from scheme.session
  and paper.paper_code is not distinct from scheme.paper_code
  and paper.variant is not distinct from scheme.variant;

alter table public.ai_chunks
  add column if not exists embedding extensions.vector(768),
  add column if not exists embedding_model text;

create index if not exists ai_chunks_embedding_hnsw_idx
  on public.ai_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_ai_chunks(
  query_embedding extensions.vector(768),
  match_subject_id bigint,
  match_count integer default 12,
  match_threshold double precision default 0.25
)
returns table (
  id bigint,
  resource_id bigint,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.resource_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.ai_chunks c
  where c.subject_id = match_subject_id
    and c.embedding is not null
    and 1 - (c.embedding OPERATOR(extensions.<=>) query_embedding) >= match_threshold
  order by c.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

grant execute on function public.match_ai_chunks(extensions.vector, bigint, integer, double precision) to authenticated;
