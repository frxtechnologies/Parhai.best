# Parhai Marking Scheme Screenshots and Analytics Fix

## Root cause

The 2016 Physics Paper 1 marking-scheme resource existed and was correctly paired with resource `153`, but its answer table had never been backfilled into `marking_scheme_answers`. Its Cambridge multiple-choice key is a two-column table (`1 D 21 C`). The generic numbered-question parser captured only the first column, Q1–Q20, leaving Q23, Q34, Q38 and the other second-column answers unlinked.

The marking-scheme preview renderer also failed when a precise crop could not be found instead of safely returning the matching full page. Paper analysis only returned a minimal topic list and did not distinguish all indexed rows from student-verified rows.

## Marking-scheme repair

- Added deterministic parsing for Cambridge two-column multiple-choice keys.
- Matching remains database-first using subject, year, session, paper, variant, question number, and part.
- An exact canonical question-number match is stored as `linked`.
- A question-level answer inherited by subparts remains `partial`.
- The UI also understands future `linked_exact` and `linked_partial` statuses.
- Reprocessed only `5054_s16_ms_11.pdf` (resource `147`).
- Extracted 40 official answer keys and linked all 40 indexed questions.
- Q23, Q34, and Q38 now have exact `marking_scheme_answer_id` values and status `linked`.

## Marking-scheme previews

- Preview generation uses the exact `marking_scheme_answer_id`.
- It renders the linked scheme PDF server-side.
- It crops around the exact answer when text positioning is found.
- If an exact crop is unavailable, it finds the page containing that question number and returns a full-page fallback.
- Students can open the marking-scheme PDF through the authenticated signed URL.
- Q23, Q34, and Q38 previews rendered from page 2 at 10,827, 11,931, and 8,541 bytes respectively.

## Student/admin visibility

- `Generate screenshot` is now rendered only when `adminDebug` is enabled.
- Admin diagnostics remain inside the existing admin-only conditional.
- Students see friendly preview/PDF fallbacks and no internal IDs or crop errors.
- Marking-scheme labels are now:
  - Marking scheme available
  - Partial marking scheme match
  - Marking scheme preview pending
  - Marking scheme not linked yet

## Paper analytics

Exact paper metadata is used. The database calculates:

- total indexed and verified questions
- total and verified marks
- marking-scheme linked/missing coverage
- screenshot coverage
- complete/partial indexing status
- topic question/mark counts and percentage
- subtopic counts
- difficulty question/mark counts
- topic marking-scheme coverage
- high-value topic ranking
- rules-based revision priorities
- verified question rows for grouped presentation

A dedicated analytics card now renders overview metrics, topic/subtopic distribution, difficulty distribution, marking-scheme coverage, and revision priorities without requiring an AI provider.

## Exact test result

Physics 5054 · May/June 2016 · Paper 1 Variant 1:

- Indexed questions: 40
- Student-verified questions: 15
- Total marks: 40
- Verified-topic marks: 15
- Marking schemes linked: 40
- Marking schemes missing: 0
- Existing question screenshots: 6
- Topics represented in verified data: 8
- Completeness: partial, because 25 indexed rows are not student-verified

No numbers were invented. Topic and difficulty analytics intentionally use only student-verified rows.

## Files changed

- `backend/src/services/resource-processor.ts`
- `backend/src/services/marking-scheme-preview.ts`
- `backend/src/services/exam-engine.ts`
- `backend/src/services/cambridge-context.ts`
- `backend/src/routes/ai-assistant.ts`
- `backend/src/services/marking-scheme-linking.test.ts`
- `frontend/src/api/types.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `frontend/src/components/ai-tutor/paper-analysis-card.tsx`
- `supabase/migrations/20260630192935_marking_scheme_exact_links_and_preview_metadata.sql`

## Verification

- Typecheck: passed.
- Tests: 39 passed (33 backend, 6 frontend).
- Production build: passed.
- Live Supabase exact-link verification: passed.
- Live marking-scheme preview rendering for Q23/Q34/Q38: passed.
- Live paper analytics verification: passed.

## Remaining risks

- Supabase migration history still has timestamp drift for several June 30 migrations. The additive preview-metadata migration was created locally but was not force-pushed. Runtime code remains compatible with the existing live schema.
- Only 15 of this paper's 40 questions are currently student-verified for topic/difficulty analytics. The remaining 25 should be reviewed rather than silently included.
- Older non-MCQ schemes may still need targeted reprocessing to populate answer rows; no bulk reprocessing was performed.
