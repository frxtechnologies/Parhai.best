-- Phase 0 cleanup (F16/F30): retire the dead Gen-1 RAG tables.
--
-- These are vector(1536) tables from the first RAG design. The live embedding
-- model emits 768-dim vectors into public.ai_chunks (HNSW indexed), so these
-- tables can NEVER match a live query. No backend or frontend code references
-- them, and match_paper_chunks has zero callers.
--
-- SAFETY: every table is dropped ONLY IF EMPTY. If any table still holds rows,
-- it is left untouched and a NOTICE is logged — this migration cannot destroy
-- data and is safe to re-run.

-- 1) Drop the dead RPC (all overloads), regardless of exact signature.
do $$
declare
  r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 'match_paper_chunks' loop
    execute 'drop function if exists ' || r.sig::text;
    raise notice 'Dropped dead function %', r.sig::text;
  end loop;
end $$;

-- 2) Drop child chunk tables first (FKs), then the parent — each only if empty.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['public.paper_chunks', 'public.note_chunks', 'public.past_papers'] loop
    if to_regclass(t) is null then
      continue;
    end if;
    execute format('select count(*) from %s', t) into n;
    if n = 0 then
      execute format('drop table %s cascade', t);
      raise notice 'Dropped empty dead table %', t;
    else
      raise notice 'KEPT % — still has % row(s); not dropping to avoid data loss', t, n;
    end if;
  end loop;
end $$;
