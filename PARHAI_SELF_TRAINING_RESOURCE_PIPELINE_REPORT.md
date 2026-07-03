# Parhai Self-Training Resource Pipeline

## What “self-training” means

Parhai does not retrain or fine-tune a model on every upload. It now automatically converts approved resources into structured database records and vector-searchable evidence. AI Tutor, Paper Analyzer, and Repeated Topics consume those records without code changes.

## Files changed

- `backend/src/index.ts`
- `backend/src/routes/resources.ts`
- `backend/src/services/resource-job.ts`
- `backend/src/services/resource-processor.ts`
- `backend/src/services/resource-deletion.ts`
- `backend/src/services/resource-queue-worker.ts`
- `backend/src/services/selective-reprocessing.ts`
- `backend/src/services/marking-scheme-linking.test.ts`
- `frontend/src/components/admin/bulk-auto-import.tsx`
- `frontend/src/lib/cambridge-filename.ts`
- `frontend/src/pages/admin-processing.tsx`
- `.env.example`
- `backend/.env.example`
- `supabase/migrations/20260701071254_self_training_resource_pipeline.sql`

## Migration

The migration adds:

- typed `resource_chunks`
- `topic_tagging_audits`
- candidate-only `fine_tuning_examples`
- `question_type` and `review_status` on `question_index`
- progress, current step, safe logs, and selective mode on `processing_jobs`
- expanded pipeline states and indexes
- RLS and explicit Data API grants

The migration is ready locally. It was not force-pushed because the repository still has known Supabase migration timestamp drift.

## Automatic processing

The backend starts an autonomous queue worker when:

`AUTO_PROCESS_RESOURCES=true`

Default polling interval:

`RESOURCE_QUEUE_INTERVAL_MS=15000`

Database upload triggers already create an `uploaded` processing job. The worker claims uploaded jobs and runs the existing server-side processor. Single and bulk upload screens also request immediate processing, so the worker acts as a reliable fallback when the browser closes or the immediate request is interrupted.

Pipeline stages:

1. extracting text
2. detecting metadata
3. creating embeddings
4. splitting questions
5. tagging topics
6. linking marking schemes
7. updating analytics
8. completed or needs manual review

Progress is persisted from the initial uploaded state through metadata validation,
text extraction, embeddings, question splitting, tagging, page rendering,
marking-scheme linking, analytics refresh, and final review.

Jobs expose progress percentage, current step, retry count, safe error text, and admin-only diagnostics.

## Resource behavior

- Question papers, worksheets, tests, and topical resources create `question_index` rows, question types, topics, difficulty, review status, previews, and embeddings.
- Marking schemes create answer sections, deterministic question links, marking points, and embeddings.
- Notes create typed, topic-tagged note chunks and embeddings.
- Syllabi create topic-tagged syllabus chunks and embeddings. They do not overwrite approved topic maps.
- Examiner reports create topic-tagged examiner-insight chunks and embeddings.
- Grade thresholds create typed searchable threshold chunks and embeddings.

Typed chunks store resource/subject/level/board/year/session/paper/variant,
question number, type, topic, subtopic, marks, difficulty, extracted text,
embedding, source page, and stable source reference where applicable.

Scanned PDFs still fail honestly with an OCR-required message when no OCR provider is configured.

## Embeddings and RAG

The existing `ai_chunks` vector pipeline remains the source of truth. Embeddings are generated backend-side through the configured provider with keyword-safe fallback behavior. Typed `resource_chunks` reference the corresponding `ai_chunks` row.

AI Tutor already retrieves from `ai_chunks` with subject and metadata filters, vector similarity, and keyword fallback. A completed upload is therefore available automatically.

No provider key or service-role key is sent to the browser.

## Marking-scheme linking

Links are deterministic:

- subject/resource pairing
- year
- session
- paper
- variant
- question number
- exact part where available

Exact question rows are linked directly. Question-level answers may link subparts as partial matches. Unmatched answers remain available for admin review.

## Analytics updates

Paper Analyzer and Repeated Topics calculate from `question_index`. On successful processing, cached paper and repeated-topic analysis rows are invalidated so the next request uses the newly indexed data.

## Admin review and selective repair

Admin Processing now shows progress and provides:

- full Retry
- Retag topics
- Relink marking scheme
- Rebuild embeddings
- Review questions
- Generate screenshots

The backend also supports question review status:

- verified
- needs_review
- rejected

Only verified/student-safe questions are preferred by student retrieval.

Manual review writes an immutable audit event with the acting administrator,
resource/question IDs, old and new tags, confidence, review outcome, and whether
the change was a manual correction.

## Fine-tuning preparation

`fine_tuning_examples` stores candidate, approved, or rejected examples for future use. No fine-tuning API is called and no model is trained. Only approved examples should be exportable in a later admin workflow.

An admin-verified manual correction is the only flow that currently creates an
approved topic-tagging example. Ordinary model output is never silently promoted.

## Security

- Processing is backend-only.
- Service-role and AI keys remain server-side.
- Resource chunks are student-readable only when their resource is approved.
- Tagging audits and training examples are admin-only.
- No secrets are included in logs.
- New exposed tables include explicit grants and RLS.
- Resource deletion cascades typed chunks, question rows, audits, embeddings, and
  paper-analysis caches, then invalidates repeated-topic caches for the subject.

## Tests

- Typecheck: passed.
- Tests: 41 passed (35 backend, 6 frontend).
- Frontend and backend production build: passed.
- Git diff validation: passed.

## Remaining limitations

- Apply the migration only after reconciling existing Supabase migration history.
- OCR fallback remains provider-dependent; normal selectable-text PDFs are prioritized.
- Syllabus topic structures are suggestions/chunks only and never overwrite approved maps automatically.
- Examiner-report linking is topic-level rather than exact-question semantic linking.
- Grade-threshold extraction is searchable typed text; structured grade-boundary rows can be added later.
- Fine-tuning export and OpenAI fine-tuning calls are intentionally not implemented.
