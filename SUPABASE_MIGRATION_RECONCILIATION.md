# Supabase Migration Reconciliation

## Outcome

The linked database and the repository now use the same migration-version
history. The reconciliation did not reset the database, replay schema SQL, or
delete application data.

## Drift found

The linked project contained 15 historical migration versions that were not
present in the repository. The repository also contained 20 early migration
versions whose schema was already present remotely under different historical
version IDs. Ten recent versions already matched.

The remote schema was inspected through the Postgres catalog because Docker was
not available for `supabase db dump`. The inspection confirmed the working
tables, RLS state, foreign keys, screenshot schema, topic-map schema, resource
pipeline fields, and current `question_index` constraints. In particular:

- `question_index` includes clean/raw/display text, marks, tagging metadata,
  `source_page`, `bbox`, screenshot paths, and screenshot status.
- `question_images`, `resources`, `processing_jobs`, `resource_links`, and
  `topic_maps` exist with their expected relationships.
- The screenshot status constraint includes `failed_page_match`.
- Existing rows remained intact.

## Reconciliation method

1. Added no-op bridge files for the 15 remote-only historical versions. These
   files preserve history; they intentionally contain no DDL.
2. Marked the local-only versions as `applied` in
   `supabase_migrations.schema_migrations` using
   `supabase migration repair --status applied`.
3. Did not use `db reset`, destructive DDL, data imports, or migration replay.
4. Did not create a baseline migration. The existing local migration chain is
   complete, so a second schema baseline would make clean-environment replay
   less reliable.

## Verification

Run these commands before a future schema change:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
```

Both Local and Remote columns should be populated for every historical
version. New migrations should always be created with:

```powershell
supabase migration new descriptive_name
```

Then review and push the single new migration normally.

## OCR-only PDF limitation

OCR-only or scanned PDFs may need stronger page detection because they do not
provide reliable embedded text positions. Normal text PDFs remain the priority.
Any future OCR fallback must be isolated behind a fallback path so it cannot
change or break normal text-PDF extraction, indexing, source-page detection, or
screenshot generation.

## Safety notes

- Never run `supabase db reset` against the linked project.
- Never repair a new migration as applied unless its effects are first verified
  in the actual schema.
- Keep the bridge files. Removing them recreates remote-only history drift.
- Migration-history repair changes bookkeeping only; it does not apply the SQL
  inside a migration file.
