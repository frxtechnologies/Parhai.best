# AI Tutor Behavior Upgrade Report

## Intent routing

AI Tutor now routes these intents before provider invocation:

- paper lookup
- question search
- topic count
- paper topic analysis
- topic trend analysis
- repeated questions
- marking-scheme explanation
- question explanation
- study plan
- progress feedback
- practice-set generation
- general teacher answer

Paper-only, question-search, count, analysis, trend, repeated-pattern, and
progress requests use the shared database-first exam engine.

## Paper-only behavior

Paper lookup returns only matching uploaded paper resources and paper cards.
It does not create worksheets or add generic teacher explanations. Suggested
actions are limited to analyzing and practising that paper.

## Question search and load more

- Default page size: 10.
- Responses include total, limit, offset, and `hasMore`.
- The tutor stores the active topic/filter/pagination context in the assistant
  message.
- “Show more” requests the next offset for the same topic without calling an
  AI model.
- “Only hard ones” and “Only easy ones” reuse the last active topic.
- Ordering now includes a stable question-ID tie-breaker, preventing overlap
  between pages.

Live Physics Light verification:

- total: 73 verified questions
- page 1: 10
- page 2: 10
- overlap: 0

## No-AI fallback

Paper search, question search, pagination, counts, analytics, source cards,
marking-scheme data, and repeated-pattern data are returned directly from
Supabase. Provider configuration and rate limits do not block these actions.

## Marking schemes

Added:

`GET /api/exam-engine/questions/:questionId/marking-scheme`

It returns only an exact linked/partial official marking-scheme answer.
Question `1227` was verified with linked official answer data. Missing links
return an honest 404 instead of invented marking points.

## Memory and progress

Session context stores only active academic search state. Persistent learning
memory reads owner-scoped weak-topic/activity tables. If the pending memory
migration is not applied, the tutor reports that progress memory is
unavailable while keeping exam search operational.

## Tests

- Typecheck passed.
- 37 tests passed.
- Added intent-matrix, deterministic aggregation, difficulty, and pagination
  behavior tests.
- Production build passed.

## Remaining issues

- Persistent learning memory requires safe reconciliation and application of
  migration `20260630181746_exam_intelligence_student_memory.sql`.
- Some uploaded questions lack marks, so mark totals can be lower than true
  totals.
- Marking-scheme screenshots need page/bbox metadata in
  `marking_scheme_answers`; exact answer text and source resources already
  work.
