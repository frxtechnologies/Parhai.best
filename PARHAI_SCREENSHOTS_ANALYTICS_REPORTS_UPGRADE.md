# Screenshots, Analytics, and Reports Upgrade

## Question screenshots

- Existing question previews remain on demand.
- Visible cards request only their own preview.
- Cards retain readable question-text and View PDF fallbacks.
- Broken image responses are hidden from students.

## Marking-scheme screenshots

Added a server-only on-demand renderer and endpoint:

`GET /api/questions/:questionId/marking-scheme/screenshot`

The renderer:

- loads the exact linked `marking_scheme_answer`
- downloads only its official marking-scheme PDF
- finds the exact question/part heading
- crops to the next answer heading
- streams a private PNG without permanent storage
- returns an honest unavailable response when matching fails

Question `1227` was verified:

- linked status
- official scheme resource `87`
- matched page `6`
- rendered PNG returned

Source cards now support question preview, PDF, marking-scheme preview,
explanation, mark-as-practised, and bookmark actions. Admin diagnostics remain
hidden from students.

## Analytics and reports

The exam engine already returns:

- total questions and recorded marks
- topic/subtopic distribution
- difficulty distribution
- linked/unlinked marking-scheme coverage
- repeated patterns
- year trend question/mark counts
- student weak-topic/activity memory

Added a reusable branded PDF report exporter for paper, trend, student, and
Paper Checker report payloads.

## Student activity

Bookmark and practised actions write academic-only activity through:

`POST /api/exam-engine/activity`

Owner-only RLS applies after the pending learning-memory migration.

## Paper Checker temporary storage

After marking results are persisted, Paper Checker deletes only the student's
private `paper-checker-submissions` object when:

`PAPER_CHECKER_DELETE_UPLOAD_AFTER_REPORT=true`

Default retention configuration:

- `PAPER_CHECKER_DELETE_UPLOAD_AFTER_REPORT=true`
- `PAPER_CHECKER_UPLOAD_RETENTION_HOURS=24`

The migration adds:

- `uploaded_file_deleted`
- `uploaded_file_deleted_at`
- `file_retention_status`
- `report_saved`
- `expires_at`

Official Cambridge resource buckets and paths are never passed to this cleanup.

## Verification

- Exact linked scheme preview rendered successfully.
- Typecheck passed.
- Existing question preview and PDF fallback paths remain unchanged.

## Remaining risks

- The memory/retention migration remains unapplied because remote migration
  history has pre-existing timestamp drift. It must be reconciled before a
  normal push.
- Some marking schemes have poor extracted answer keys; exact preview is only
  offered when a linked answer exists.
- Missing marks make analytics mark totals incomplete, while question counts
  remain correct.
- Automatic 24-hour cleanup for abandoned (never-reported) submissions still
  needs a scheduled worker/cron after migration deployment.
