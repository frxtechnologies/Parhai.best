# Parhai Bulk Import Intelligence Upgrade

## Root cause

Bulk Import previously ran hashing, detection, Storage upload, database insertion, and processing initiation inside one browser-owned workflow. Detection used a fan-out request for every selected file, while confirmation performed another long sequential loop. A browser refresh, timeout, schema mismatch, or individual Storage/database error could leave the batch with poor recovery information.

The immediate runtime failure shown in the administrator UI had a narrower cause: the backend inserted batch status `uploading`, while the live `admin_import_batches_status_check` still allowed only the legacy status set. The additive Bulk Import migration had not been applied to the linked database.

A later batch-35 audit confirmed detection itself was successful: 248 files were ready, 9 needed review, and 1 was unsupported. Nothing had entered the platform because all 258 rows still had `import_status = pending`. The only approval button was below a very long table, so the required review-to-import transition was effectively hidden. The live `processing_jobs` table also lacked the queue progress columns required by the new importer.

The architecture is now persistent and per-file:

1. Create an import batch.
2. Upload each PDF independently to permanent Cambridge resource storage.
3. Persist an `import_batch_files` row and run lightweight filename/first-pages detection.
4. Let the administrator review and correct metadata.
5. Create resource rows and queued processing jobs without waiting for extraction.
6. Let the bounded background worker run heavy extraction, tagging, linking, embeddings, and analytics.

One failed upload, detection, resource insert, or processing job does not roll back other files.

## Implementation

### Multi-signal metadata detector

The backend now inspects the filename and extracted text from the first three PDF pages. It detects syllabus code, subject, year, session, resource type, paper number, and variant independently and records evidence and confidence for each field.

Supported canonical examples include:

- `4024_s23_qp_12.pdf`
- `4024_s23_ms_12.pdf`
- `5054_w22_qp_22.pdf`
- `9709_m23_qp_12.pdf`
- `0625_s21_ms_42.pdf`
- `9702_w20_gt.pdf`
- `5054_s23_er.pdf`

Friendly names such as `Physics O Level 2022 Oct Nov Paper 2 Mark Scheme.pdf` are combined with PDF header evidence. Missing fields remain empty and require review; they are not guessed.

The detector is Cambridge International O Level and AS/A Level focused for Pakistani students. It recognizes common Pakistan-relevant O Level and AS/A Level syllabus codes, while the `subjects` table remains the authoritative mapping. IGCSE is not inferred or used as the default.

### Confidence and conflicts

Every field receives a confidence percentage. Overall confidence is labelled high, medium, or low. Conflicting filename/PDF values produce `Conflict` status and prevent automatic readiness until an administrator edits the metadata.

Useful warnings now identify the missing or conflicting field rather than showing a generic failure.

### Duplicate detection

Duplicates are checked before import using:

- SHA-256 file hash.
- Subject, year, session, resource type, paper number, and variant.

The existing resource ID is shown where available. Storage uploads still use `upsert: false`, so no file is silently overwritten.

### Question-paper and marking-scheme pairing

The review table identifies matching question paper/marking scheme pairs within the selected batch using syllabus code, year, session, paper, and variant. Existing database triggers continue linking approved resources after insertion. Resource processing is then requested through the existing backend pipeline.

### Review UI

The administrator review table now shows:

- Editable metadata.
- Overall and per-field confidence.
- Ready, Needs Review, Conflict, or Duplicate state.
- Pairing status.
- Cambridge O Level or AS/A Level.
- Admin-configured component name, with neutral `Component N` fallback.
- Filename and PDF evidence.
- Matched values and extracted PDF snippet.
- Normalized Cambridge paper code.
- Independent upload, detection, import, and processing states.
- Per-file retry for failed or timed-out detection.
- Selected-file import rather than all-or-nothing confirmation.
- Live batch totals for uploaded, ready, review, conflict, duplicate, failed, imported, and processing.
- A sticky top action now states that upload alone does not create platform resources and offers `Import N ready files`.
- `Select all ready` avoids manually selecting hundreds of rows.

### Database

Migration `20260702181135_bulk_import_intelligence.sql` adds:

- Detection metadata, status, warnings, normalized paper code, and duplicate reference to resources.
- Batch ready/conflict counts.
- Admin-only `import_batch_files` audit rows with RLS.
- Admin-editable `cambridge_component_mappings` with allowed variants and active-year ranges.
- Persistent upload/import/processing states, error step/message, retry count, processing job ID, file size/type/hash, and batch progress counters.

Migration `20260702185508_repair_bulk_import_status_constraints.sql` safely drops and recreates the batch and per-file checks. It preserves all rows and allows:

- Batch: uploading, detecting, ready_for_review, importing, processing, completed, completed_with_errors, failed, cancelled.
- Upload: queued, uploading, uploaded, upload_failed, cancelled.
- Detection: queued, detecting, ready, needs_review, conflict, duplicate, unsupported, detection_failed, detection_timed_out, cancelled.
- Import: pending, importing, imported, import_failed, skipped, cancelled.
- Processing: pending, queued, processing, completed, failed, needs_review, cancelled.

Both Bulk Import migrations were applied directly to the linked database and recorded as applied in migration history. A rolled-back live insert verified that `uploading` is now accepted.

Migration `20260702191748_repair_processing_job_queue_columns.sql` adds the missing queue progress fields and compatible processing-job statuses. It was applied to the linked database and recorded in migration history.

## Reliability and timeouts

- Frontend upload concurrency is capped at three.
- Detection reads no more than three pages and defaults to a 20-second timeout.
- Canonical Cambridge filenames can complete without PDF parsing.
- Timed-out or unreadable files remain stored and enter manual review.
- Resource confirmation creates `uploaded` processing jobs and returns immediately.
- Resource creation uses five bounded workers, avoiding a slow 248-file sequential request.
- A resource is recorded on the batch file before job creation; if queue creation fails, the resource remains saved and processing can be retried without duplicating it.
- The queue worker safely claims jobs before processing and supports configurable concurrency (default two).
- Retrying import checks `final_resource_id`, preventing accidental duplicate resource creation.

Environment controls:

- `BULK_UPLOAD_MAX_CONCURRENCY=3`
- `BULK_DETECTION_MAX_CONCURRENCY=3`
- `BULK_DETECTION_TIMEOUT_SECONDS=20`
- `BULK_DETECTION_PAGE_LIMIT=3`
- `RESOURCE_PROCESSING_MAX_CONCURRENCY=2`

The migration is additive and does not remove or overwrite existing resources.

## Files changed

- `backend/src/services/metadata-detector.ts`
- `backend/src/services/metadata-detector.test.ts`
- `backend/src/routes/ingestion.ts`
- `backend/src/routes/bulk-import.ts`
- `backend/src/services/bulk-import-status.ts`
- `backend/src/services/bulk-import-status.test.ts`
- `backend/src/routes/index.ts`
- `backend/src/services/resource-queue-worker.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/admin/bulk-auto-import.tsx`
- `supabase/migrations/20260702181135_bulk_import_intelligence.sql`

## Verification

- Typecheck passed.
- 50 tests passed: 44 backend and 6 frontend.
- Frontend and backend production builds passed.
- Canonical, friendly, incomplete, and conflicting metadata cases are covered by tests.

## Remaining limitations

- Scanned/image-only PDF headers require OCR; without OCR the detector honestly falls back to filename signals.
- Unknown syllabus codes require an administrator to map them to an existing subject.
- Variant cannot be inferred safely when neither filename nor PDF header contains it.
- Replacing duplicates is intentionally not automatic; the existing resource deletion/version workflow must be used explicitly.
- The additive migration should be pushed only after the known Supabase migration-history drift is reconciled.
- Resuming from a different browser session is supported by the batch-status API; a dedicated historical-batches picker can still improve admin convenience.
