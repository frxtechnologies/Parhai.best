# Paper Checker Upload Flow Fix

## Root cause

Two issues blocked the flow. Paper-list reads used the anonymous server client, so RLS returned no selectable papers. The local backend also had only `SUPABASE_ANON_KEY`; without `SUPABASE_SERVICE_ROLE_KEY`, private Storage writes and protected inserts were correctly rejected before extraction.

## Fix

- Added canonical `POST /api/paper-checker/submissions` while retaining `/upload`.
- Paper and question reads now use the authenticated student's Supabase client.
- Added a backend-only service-role configuration guard with a clear 503 response.
- Added visible upload, reading, review, and marking progress messages.
- Improved upload/marking failure messages.
- Kept placeholder answer creation for scanned/handwritten PDFs when vision OCR is unavailable.
- Review remains mandatory before marking.

## Security

The service role remains backend-only. Student tables are owner-readable and direct score writes remain revoked. Solved PDFs stay in the private `paper-checker-submissions` bucket.

## Remaining limitation

Handwriting vision is not configured. Scanned/handwritten files therefore create question-aligned editable placeholders and require manual transcription.
