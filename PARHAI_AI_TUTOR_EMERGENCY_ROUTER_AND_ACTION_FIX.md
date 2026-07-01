# Parhai AI Tutor Emergency Router and Action Fix

## Root causes

- The API loaded `subjectId` from the open UI workspace before parsing the user's message. An explicit Maths request made from Physics therefore stayed scoped to Physics.
- Paper, explain, and pagination buttons sent English sentences back into the chat router. The router then had to guess the target again and could select another paper or question.
- Paper resources were rendered through the question source-card path, which exposed question-only controls and `Q—`.

## Fixes

- Added deterministic aliases: Maths/Math/Mathematics/Mathematics Syllabus D/4024 resolve to `4024`; Physics/Phy/5054 resolve to `5054`.
- Explicit subject text and structured-action metadata now override the open subject workspace.
- Cambridge filenames such as `4024_s23_qp_12` now provide year, session, paper, and variant filters.
- Added typed structured actions for exact paper analysis, exact paper questions, exact question explanation, exact marking-scheme lookup, and database pagination.
- Added a dedicated `PaperCard`; it has no screenshot placeholder, question number, or question-only actions.
- Paper PDF access uses the authenticated signed-view endpoint.
- Load More reuses stored search filters and offset instead of asking AI again.
- Exact question actions load by `question_id`; paper analysis loads by the complete paper key.
- Student cards continue to receive admin diagnostics only when the existing admin check is true.
- Added development-only routing diagnostics for the exact query `Give me 2023 Maths Paper 1`. Diagnostics are server logs, never student UI.

## Files changed for this fix

- `backend/src/services/exam-engine.ts`
- `backend/src/services/exam-engine.test.ts`
- `backend/src/routes/ai-assistant.ts`
- `frontend/src/api/types.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `frontend/src/components/ai-tutor/paper-card.tsx`
- `frontend/src/pages/subject-ai.tsx`

## Verification

- Typecheck: passed.
- Automated tests: 38 passed (32 backend, 6 frontend).
- Production build: passed.
- Alias and intent unit tests cover Maths/Physics paper lookup separation.
- Structured action types compile end-to-end across frontend and backend.

## Remaining issues

- A live authenticated Supabase browser pass is still required to confirm the exact available paper counts in the current database.
- Paper lookup currently returns approved question-paper resources. Related MS/GT/ER grouping can only show resources actually linked in the database.
- Exact question explanation deliberately returns verified source data and a no-AI message; provider-generated teaching prose can be restored later only after the exact-question context path is retained.
