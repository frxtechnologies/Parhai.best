# Parhai Phase 2 Screenshot Repair Report

## Files changed

- `backend/src/services/question-screenshots.ts`
- `backend/src/services/question-screenshots.test.ts`
- `backend/src/routes/ai-assistant.ts`
- `frontend/src/api/types.ts`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/pages/subject-ai.tsx`
- `supabase/migrations/20260629145318_phase_2_screenshot_diagnostics.sql`
- `PARHAI_PHASE_2_SCREENSHOT_AUDIT.md`
- `PARHAI_PHASE_2_SCREENSHOT_REPAIR_REPORT.md`

## Screenshot logic changed

- Candidate pages are now evaluated against the requested question number and
  clean question text instead of accepting the first nonblank page.
- Page attempts use the stored page first, then `source_page + 1`, then
  `source_page - 1`.
- Exact bbox crop is attempted before a full-page fallback on the same page.
- Front covers, instruction pages, blank pages, and footer-only pages are
  rejected.
- A nonblank but unrelated nearby page is rejected as `page_match_failed`.
- The best-scoring valid candidate is selected and its one-based page is saved.
- Full-page success is recorded as `full_page_fallback`.
- The on-demand renderer now loads `question_index` and `resources` in two
  separate queries instead of relying on an embedded `resources!inner(...)`
  `.single()` lookup. This avoids relation/RLS coercion failures before PDF
  rendering starts.

## Source-page and database diagnostics

- Added screenshot diagnostic fields:
  - `question_index.screenshot_error`
  - `question_index.page_match_score`
  - `question_index.screenshot_fallback_used`
- Failed page matches save a friendly status for the UI and a detailed reason
  for admin/debug review.
- Successful on-demand previews update only the requested question row:
  `source_page`, `bbox`, `screenshot_status`, page-match score, and fallback
  flag.
- No bulk screenshot generation was run.

## Student UI cleanup

- Students see only:
  - `Generating preview...`
  - the generated preview
  - `Preview unavailable — open PDF instead.`
- Student cards no longer expose crop errors, bbox, source-page errors, or raw
  screenshot debug text.
- View PDF remains available even when preview generation fails.
- Only the first three visible source cards auto-generate previews. Other cards
  keep the manual Generate preview action.

## Admin debug behavior

- Admin diagnostics remain available only when the AI Tutor passes explicit
  admin mode.
- Admin debug includes `question_id`, `resource_id`, `source_page`, `bbox`,
  `screenshot_status`, `file_path`, `screenshot_error`, `page_match_score`, and
  whether fallback was used.

## Controlled sample test

The server-side on-demand renderer was tested against three individual
questions only:

| Question ID | Sample | Result |
| --- | --- | --- |
| `710` | Physics 5054 refraction/TIR sample | `generated`, page `10`, nonblank ratio `0.0335` |
| `3591` | Mathematics 4024 graph sample from 2023 | `generated`, page `3`, nonblank ratio `0.0752` |
| `3608` | Mathematics 4024 circle-theorem sample | `generated`, page `8`, nonblank ratio `0.0127` |

The first local smoke run failed with `TypeError: fetch failed` because the
sandbox blocked Supabase Storage network access. The same narrow test passed
after running with network permission and an in-memory service-role key. The
key was not written to the repository.

## Validation

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed: 21 backend tests and 4 frontend tests.
- `npm.cmd run build` passed for frontend and backend.

## Remaining risks

- Scanned/OCR-only pages may have no usable text for page matching.
- Diagram-only continuation pages can still require manual source-page review.
- Existing stored images are not silently overwritten in on-demand mode.
- Vite still reports a large frontend chunk warning; this predates the
  screenshot repair and does not block the build.
