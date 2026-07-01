# Parhai Exam Intelligence Engine Report

## Shared engine

Added `backend/src/services/exam-engine.ts` as the database-first source for:

- paper lookup
- paginated verified-question search
- subject-aware topic search
- complete paper question loading
- question/source metadata
- marking-scheme lookup
- question and marking-scheme preview metadata
- paper and year-range topic counts
- year trend data
- repeated-question patterns
- weak-topic and student progress memory
- deterministic difficulty inference

## No-AI operation

Paper lookup, question search, pagination, source metadata, topic analysis,
trend data, repeated-pattern analysis, and progress-memory reads do not call an
AI provider. Existing AI Tutor provider failure continues to return verified
database sources.

## Intent routing

Added deterministic intent types:

- `paper_lookup`
- `question_search`
- `paper_analysis`
- `topic_trend`
- `teacher_explanation`

AI Tutor now resolves paper-only lookup, paper analysis, and trend questions
through the exam engine before provider invocation.

## API endpoints

- `GET /api/exam-engine/papers`
- `GET /api/exam-engine/questions`
- `GET /api/exam-engine/questions/:questionId`
- `GET /api/exam-engine/paper-analysis`
- `GET /api/exam-engine/topic-trend`
- `GET /api/exam-engine/memory`
- `POST /api/exam-engine/activity`

Question results default to 10 rows and expose `total`, `offset`, `limit`, and
`hasMore`.

## Student memory

Migration `20260630181746_exam_intelligence_student_memory.sql` adds:

- `student_learning_profile`
- `student_topic_progress`
- `student_question_activity`
- `student_mistake_history`
- `difficulty_reason` and `difficulty_confidence`

Every memory table has RLS and owner-only CRUD policies using `auth.uid()`.
No service-role credential is exposed to clients.

## Live database verification

- Maths 4024, 2023 Paper 1 lookup: 8 matching paper-related resources.
- Physics 5054 Light search: 73 verified matches; first 10 returned with
  `hasMore=true`.
- Physics 2023 May/June Paper 1 Variant 2 analysis returned deterministic
  topic/subtopic/difficulty distributions.
- Electricity trend returned chart-ready year/question/mark objects.

## Tests

- Typecheck passed.
- 37 tests passed.
- New tests cover intent routing, topic aggregation, marks, difficulty, and
  deterministic analytics behavior.

## Migration status and remaining risks

The remote migration history still contains timestamp drift from earlier
renamed migrations. The new memory migration is intentionally not force-pushed
until that history is reconciled; forcing it could replay unrelated schema
changes. Core read-only exam intelligence works against the current schema.
Memory-write endpoints require the new migration to be applied after safe
history reconciliation.

Other data limitations:

- missing marks produce correct question counts but undercount topic marks
- malformed source-page metadata still relies on PDF fallback
- marking-scheme coverage depends on successful scheme extraction/linking
- repeated-pattern detection currently uses normalized text; embeddings can be
  added later without replacing deterministic matching
