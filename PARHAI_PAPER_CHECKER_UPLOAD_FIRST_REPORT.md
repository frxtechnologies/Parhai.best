# Parhai Paper Checker Upload-First Report

The `/paper-checker` workflow is now: choose indexed paper → upload solved PDF → extract/match → mandatory student review → marking report.

## Files and routes

- `frontend/src/pages/paper-checker.tsx`: upload-first UI, processing state, extraction review, report.
- `backend/src/routes/paper-checker.ts`: `POST /api/paper-checker/upload` plus reviewed-answer marking.
- `backend/src/services/answer-extraction.ts`: provider-abstracted extraction.
- Migration `20260630083728_paper_checker_upload_first.sql`.

## Storage and security

`paper-checker-submissions` is private, PDF-only, and limited to 25 MB. Objects use `{user_id}/{submission_id}/original/{filename}`. Student tables have owner-scoped read policies; direct student writes remain revoked. The service role stays backend-only.

## Extraction

Selectable-text PDFs use `pdf-parse` and Cambridge question-number splitting. Image-only/scanned/handwritten PDFs safely return `needs_manual_review` when no vision provider is configured. Students must review and correct every extracted answer before marking.

## Marking

Reviewed text is matched to the selected paper's verified `question_index`, then marked through the shared Cambridge context using linked official scheme answers. Missing schemes never produce official marks.

## Limitations and risks

- Handwriting vision is provider-ready but not configured.
- Page/bbox extraction is not yet available from the basic PDF provider.
- Mathematical equivalence, diagrams, alternative mark dependencies, and teacher overrides need later calibration.
- Production requires `SUPABASE_SERVICE_ROLE_KEY` on the backend.
