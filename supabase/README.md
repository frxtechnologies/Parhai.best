# Supabase

This folder stores Parhai.com database and storage setup.

Live project used during setup:

```text
https://xwafnxbcplypbjqkxmej.supabase.co
```

## Files

- `migrations/` - ordered Supabase migration files.
- `schema.sql` - original baseline schema reference.
- `seed_subjects.sql` - O Level and A Level subject catalog.
- `rag_schema.sql` - RAG tables, pgvector indexes, chat history, quizzes, and progress tables.
- `storage.sql` - private `papers` Storage bucket and policies.

## Apply Migrations

Use the Supabase CLI from the repo root after linking your project:

```bash
supabase link --project-ref xwafnxbcplypbjqkxmej
supabase db push
```

Or run the SQL files in `supabase/migrations/` in order from the Supabase SQL editor.

## Security Notes

- RLS is enabled on public application tables.
- The `papers` Storage bucket is private.
- Service role keys belong only in n8n/server-side environments, never in the Vite frontend.
- Enable leaked password protection in the Supabase Auth dashboard before production launch.

