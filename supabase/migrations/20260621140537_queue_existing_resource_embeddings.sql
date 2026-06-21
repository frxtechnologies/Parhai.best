update public.resources r
set
  status = 'uploaded',
  processing_status = 'pending',
  processing_error = 'Embedding backfill required. Process this resource again.',
  updated_at = now()
where r.processing_status = 'processed'
  and exists (
    select 1 from public.ai_chunks c
    where c.resource_id = r.id and c.embedding is null
  );
