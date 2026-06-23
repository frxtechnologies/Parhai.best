-- Delete all database-side representations of a resource in one transaction.
-- Storage is intentionally handled first by the API, because Postgres cannot
-- include an object-storage operation in its transaction.
create or replace function public.delete_resource_records(p_resource_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.resources%rowtype;
  indexed_count integer;
  chunk_count integer;
  job_count integer;
begin
  if current_user <> 'service_role' and not exists (
    select 1 from public.admin_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  ) then
    raise exception 'Administrator access is required';
  end if;

  select * into target
  from public.resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'Resource not found';
  end if;

  select count(*) into indexed_count from public.question_index where resource_id = p_resource_id;
  select count(*) into chunk_count from public.ai_chunks where resource_id = p_resource_id;
  select count(*) into job_count from public.processing_jobs where resource_id = p_resource_id;

  -- Imported legacy content is also searched by the transitional RAG path.
  -- Remove its legacy record so deletion takes effect in both retrieval systems.
  if target.legacy_source = 'papers' and target.legacy_source_id is not null then
    update public.resources
    set legacy_source = null,
        legacy_source_id = null,
        updated_at = now()
    where related_resource_id = p_resource_id
      and legacy_source = 'marking_schemes';

    delete from public.papers where id = target.legacy_source_id;
  elsif target.legacy_source = 'marking_schemes' and target.legacy_source_id is not null then
    delete from public.marking_schemes where id = target.legacy_source_id;
  end if;

  delete from public.resources where id = p_resource_id;
  if not found then raise exception 'Resource could not be deleted'; end if;

  return jsonb_build_object(
    'resourceId', p_resource_id,
    'indexedQuestionsDeleted', indexed_count,
    'chunksDeleted', chunk_count,
    'processingJobsDeleted', job_count
  );
end;
$$;

revoke all on function public.delete_resource_records(bigint) from public, anon;
grant execute on function public.delete_resource_records(bigint) to authenticated;
