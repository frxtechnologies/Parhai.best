drop policy if exists "Chat sources cleanable by admin users" on public.chat_messages;
create policy "Chat sources cleanable by admin users" on public.chat_messages
  for update to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

drop policy if exists "AI chat sources cleanable by admin users" on public.ai_chat_logs;
create policy "AI chat sources cleanable by admin users" on public.ai_chat_logs
  for update to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

grant update(sources) on public.chat_messages to authenticated;
grant update(sources_used) on public.ai_chat_logs to authenticated;

create or replace function public.delete_resource_records(p_resource_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  indexed_ids bigint[] := '{}'::bigint[];
  chunk_ids bigint[] := '{}'::bigint[];
  legacy_question_ids bigint[] := '{}'::bigint[];
  indexed_count integer := 0;
  chunk_count integer := 0;
  job_count integer := 0;
  legacy_question_count integer := 0;
  legacy_document_chunk_count integer := 0;
  chat_rows_updated integer := 0;
  audit_rows_updated integer := 0;
  affected integer := 0;
begin
  if current_user <> 'service_role' and not exists (
    select 1 from public.admin_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  ) then
    raise exception 'Administrator access is required';
  end if;

  select * into target from public.resources where id = p_resource_id for update;
  if not found then raise exception 'Resource not found'; end if;

  select coalesce(array_agg(id), '{}'::bigint[]), count(*) into indexed_ids, indexed_count
    from public.question_index where resource_id = p_resource_id;
  select coalesce(array_agg(id), '{}'::bigint[]), count(*) into chunk_ids, chunk_count
    from public.ai_chunks where resource_id = p_resource_id;
  select count(*) into job_count from public.processing_jobs where resource_id = p_resource_id;

  if target.legacy_source = 'papers' and target.legacy_source_id is not null then
    select coalesce(array_agg(id), '{}'::bigint[]), count(*) into legacy_question_ids, legacy_question_count
      from public.questions where paper_id = target.legacy_source_id;
    select count(*) into legacy_document_chunk_count from public.document_chunks where paper_id = target.legacy_source_id;
  end if;

  update public.chat_messages cm
  set sources = (
    select coalesce(jsonb_agg(e.item order by e.position), '[]'::jsonb)
    from jsonb_array_elements(cm.sources) with ordinality as e(item, position)
    where not coalesce((
      (case when e.item->>'resourceId' ~ '^\d+$' then (e.item->>'resourceId')::bigint end = p_resource_id)
      or (target.legacy_source = 'papers' and case when e.item->>'paperId' ~ '^\d+$' then (e.item->>'paperId')::bigint end = target.legacy_source_id)
      or (e.item->>'sourceType' = 'resource' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(chunk_ids))
      or (e.item->>'sourceType' = 'question' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(indexed_ids || legacy_question_ids))
      or (e.item->>'sourceType' = 'paper' and target.legacy_source = 'papers' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = target.legacy_source_id)
    ), false)
  )
  where jsonb_typeof(cm.sources) = 'array'
    and exists (
      select 1 from jsonb_array_elements(cm.sources) e(item)
      where (case when e.item->>'resourceId' ~ '^\d+$' then (e.item->>'resourceId')::bigint end = p_resource_id)
        or (target.legacy_source = 'papers' and case when e.item->>'paperId' ~ '^\d+$' then (e.item->>'paperId')::bigint end = target.legacy_source_id)
        or (e.item->>'sourceType' = 'resource' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(chunk_ids))
        or (e.item->>'sourceType' = 'question' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(indexed_ids || legacy_question_ids))
        or (e.item->>'sourceType' = 'paper' and target.legacy_source = 'papers' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = target.legacy_source_id)
    );
  get diagnostics chat_rows_updated = row_count;

  update public.ai_chat_logs logs
  set sources_used = (
    select coalesce(jsonb_agg(e.item order by e.position), '[]'::jsonb)
    from jsonb_array_elements(logs.sources_used) with ordinality as e(item, position)
    where not coalesce((
      (case when e.item->>'resourceId' ~ '^\d+$' then (e.item->>'resourceId')::bigint end = p_resource_id)
      or (target.legacy_source = 'papers' and case when e.item->>'paperId' ~ '^\d+$' then (e.item->>'paperId')::bigint end = target.legacy_source_id)
      or (e.item->>'sourceType' = 'resource' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(chunk_ids))
      or (e.item->>'sourceType' = 'question' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(indexed_ids || legacy_question_ids))
      or (e.item->>'sourceType' = 'paper' and target.legacy_source = 'papers' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = target.legacy_source_id)
    ), false)
  )
  where jsonb_typeof(logs.sources_used) = 'array'
    and exists (
      select 1 from jsonb_array_elements(logs.sources_used) e(item)
      where (case when e.item->>'resourceId' ~ '^\d+$' then (e.item->>'resourceId')::bigint end = p_resource_id)
        or (target.legacy_source = 'papers' and case when e.item->>'paperId' ~ '^\d+$' then (e.item->>'paperId')::bigint end = target.legacy_source_id)
        or (e.item->>'sourceType' = 'resource' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(chunk_ids))
        or (e.item->>'sourceType' = 'question' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = any(indexed_ids || legacy_question_ids))
        or (e.item->>'sourceType' = 'paper' and target.legacy_source = 'papers' and case when e.item->>'chunkId' ~ '^\d+$' then (e.item->>'chunkId')::bigint end = target.legacy_source_id)
    );
  get diagnostics audit_rows_updated = row_count;

  if target.legacy_source = 'papers' and target.legacy_source_id is not null then
    update public.resources set legacy_source = null, legacy_source_id = null, updated_at = now()
      where related_resource_id = p_resource_id and legacy_source = 'marking_schemes';
    delete from public.papers where id = target.legacy_source_id;
  elsif target.legacy_source = 'marking_schemes' and target.legacy_source_id is not null then
    delete from public.marking_schemes where id = target.legacy_source_id;
  elsif target.legacy_source = 'notes' and target.legacy_source_id is not null then
    delete from public.notes where id = target.legacy_source_id;
  elsif target.legacy_source = 'past_papers' and target.legacy_source_id is not null then
    delete from public.past_papers where id = target.legacy_source_id;
  end if;

  delete from public.resources where id = p_resource_id;
  if not found then raise exception 'Resource could not be deleted'; end if;

  select count(*) into affected from public.question_index where resource_id = p_resource_id;
  if affected <> 0 then raise exception 'Post-delete audit failed: question_index rows remain'; end if;
  select count(*) into affected from public.ai_chunks where resource_id = p_resource_id;
  if affected <> 0 then raise exception 'Post-delete audit failed: ai_chunks rows remain'; end if;
  select count(*) into affected from public.processing_jobs where resource_id = p_resource_id;
  if affected <> 0 then raise exception 'Post-delete audit failed: processing_jobs rows remain'; end if;
  if target.legacy_source = 'papers' and target.legacy_source_id is not null then
    select count(*) into affected from public.questions where paper_id = target.legacy_source_id;
    if affected <> 0 then raise exception 'Post-delete audit failed: legacy questions remain'; end if;
  end if;

  return jsonb_build_object(
    'resourceId', p_resource_id,
    'indexedQuestionsDeleted', indexed_count,
    'chunksDeleted', chunk_count,
    'processingJobsDeleted', job_count,
    'legacyQuestionsDeleted', legacy_question_count,
    'legacyDocumentChunksDeleted', legacy_document_chunk_count,
    'chatMessagesCleaned', chat_rows_updated,
    'chatAuditRowsCleaned', audit_rows_updated
  );
end;
$$;

revoke all on function public.delete_resource_records(bigint) from public, anon;
grant execute on function public.delete_resource_records(bigint) to authenticated;
