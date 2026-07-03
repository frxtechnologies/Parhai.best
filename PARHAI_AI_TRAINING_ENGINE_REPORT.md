# Parhai AI Training Engine

## Outcome

Parhai now has a backend-first resource intelligence foundation. Uploaded resources can enter the existing processing-job queue, be extracted and classified by resource type, produce indexed questions or typed RAG chunks, create embeddings where a provider is configured, relink marking schemes, refresh study-agent analytics, and enter an administrator review loop.

Core search, filtering, counts, paper analysis, repeated-topic statistics, revision planning, source cards, and Paper Checker context remain database-first. They do not require an AI provider.

## Resource pipeline

The queue worker claims uploaded/failed jobs and calls the resource processor. Jobs record safe stage names and percentage progress. Selective retry supports topic tagging, marking-scheme linking, and embeddings without reprocessing unrelated data.

Question papers create cleaned `question_index` data with metadata, type, marks, difficulty, topic confidence, verification state, page references, and preview state. Marking schemes are split into answer rows and linked deterministically. Notes and other non-question resources create typed `resource_chunks`. AI calls remain backend-only and provider-flexible.

## Database changes

- Processing-job progress, safe logs, retry modes, and manual-review state.
- Typed `resource_chunks` with optional vector embeddings.
- `topic_tagging_audits` for predicted and corrected tags.
- `fine_tuning_examples` for candidates, approval, rejection, provenance, and later JSONL export.
- Richer question verification, extraction confidence, formula usage, and command words.
- Richer marking-scheme metadata and link verification.
- `student_performance_events` with owner-scoped RLS.
- Existing owner-scoped learning profile, topic progress, question activity, and mistake history are reused rather than duplicated.
- Study-agent cache tables for paper analysis, repeated topics, and revision plans.

Migration files:

- `20260701070055_ai_study_agents_foundation.sql`
- `20260701071254_self_training_resource_pipeline.sql`
- `20260702090000_complete_ai_training_engine.sql`

The new migrations are additive and do not delete resources, questions, submissions, users, or official Cambridge files. They still need to be applied after the existing remote/local migration-history drift is reconciled.

## Paper Checker learning loop

After a Paper Checker report is successfully marked, safe per-question summaries are written to `student_performance_events`. Topic attempts, correct answers, mastery, last subject, and last studied time are updated. The original solved PDF remains temporary and follows the existing retention/deletion flow.

Learning-memory failure is non-fatal: it is logged server-side and cannot invalidate a completed marking report.

## Admin review and future training data

Administrators can review questions, correct tags, retry selected processing stages, and create audit records. High-quality corrected examples can be stored as candidates. New administrator-only endpoints list, approve/reject, and export only approved examples as JSONL.

No custom model is trained and no fine-tuning API is called.

## Grounded student prompts

Deterministic intent templates cover question search, marking schemes, paper analysis, repeated topics, revision plans, worksheets, explanations, answer marking, and weak-topic retrieval. The system prompt forbids invented official answers, marks, examiner comments, papers, thresholds, and statistics.

## Security

- Service-role and provider keys remain backend-only.
- No secret values were printed or added to frontend environment files.
- New student performance rows use `auth.uid() = user_id` RLS for all operations.
- Fine-tuning examples and tagging audits remain administrator-only.
- Student solved papers are not converted into permanent training examples automatically.
- Export contains only explicitly approved structured examples.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 43 tests total (37 backend and 6 frontend).
- `npm run build`: passed for frontend and backend.
- Build warning: the main frontend bundle remains larger than 500 kB; this is an existing performance concern, not a build failure.

## Remaining limitations

- Handwritten OCR quality depends on a configured vision/OCR provider; manual review remains the honest fallback.
- PDF diagrams, equations, and complex tables may still need administrator verification.
- Embeddings require a configured embedding provider and vector dimensions compatible with the database.
- Migration history must be reconciled before these additive migrations are pushed normally.
- Repeated-topic predictions describe historical patterns only and cannot guarantee future exam content.
- Fine-tuning dataset export is ready, but model fine-tuning is intentionally not implemented.
