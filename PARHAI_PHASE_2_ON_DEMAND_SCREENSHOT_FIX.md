# Parhai Phase 2 On-Demand Screenshot Fix

## Scope

This fix only touches the on-demand screenshot flow used by AI Tutor source
cards. It does not rebuild the app, does not bulk-generate screenshots, and
does not change question retrieval/ranking logic.

## Exact endpoint used

- Frontend source cards call:
  - `GET /api/questions/:questionId/screenshot`
- The endpoint returns:
  - `Content-Type: image/png`
  - `X-Screenshot-Status`
  - `X-Rendered-Page`
  - PNG bytes for successful on-demand previews
- On failure, it returns JSON:
  - `error: "Preview unavailable — open PDF instead."`
  - `reason`, admin/debug only

## Why screenshots were not appearing reliably

The PDF renderer itself worked for the tested cards, but the end-to-end card
flow had two weak points:

1. The screenshot endpoint rendered with the user-scoped Supabase client. That
   can fail for private Supabase Storage reads even when the user is logged in,
   depending on Storage/RLS policies. The endpoint now keeps `requireUser`
   protection, but uses the server/admin Supabase client for the actual PDF
   download/render when `SUPABASE_SERVICE_ROLE_KEY` is configured.
2. The frontend card did not preserve enough returned screenshot state. It now
   stores the returned blob URL, reads `X-Screenshot-Status`, clears failed
   state on success, and keeps retry enabled for failed previews.

For local preview, the backend also now accepts both:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

This avoids local CORS failures when the preview is opened with either host.

## Frontend files changed

- `frontend/src/components/ai-tutor/source-card.tsx`
  - Confirms the button calls `GET /api/questions/${source.chunkId}/screenshot`.
  - Requires a valid Supabase access token before calling the endpoint.
  - Sends `cache: "no-store"` for retry reliability.
  - Shows `Generating preview...` while loading.
  - Converts the returned PNG blob into a local preview URL immediately.
  - Clears failed state after success.
  - Allows retry after `failed` or `failed_page_match`.
  - Keeps detailed failure reason admin-only.

## Backend files changed

- `backend/src/routes/resources.ts`
  - Keeps `requireUser` on the on-demand preview endpoint.
  - Uses `supabaseAdmin` for rendering when `SUPABASE_SERVICE_ROLE_KEY` is
    present.
  - Returns friendly student-facing errors and structured admin reasons.
- `backend/src/app.ts`
  - Adds `127.0.0.1:5173` to allowed local CORS origins.

## Exact card tested

Visible card requested:

- Physics 5054 · 2023 Oct/Nov · Paper 2 Variant 2 · Q9(a)
- `question_index.id = 2496`
- PDF: `resources/O_LEVEL/5054/2023/OCT_NOV/past_paper/5054_w23_qp_22.pdf`

Renderer result:

- `status = generated`
- `pageNumber = 14`
- `outputSize = 195173`
- `nonBlankRatio = 0.04735`

## Additional samples tested

The same server-side renderer was also tested narrowly against:

| Question ID | Sample | Result |
| --- | --- | --- |
| `710` | Physics 5054 refraction/TIR sample | `generated`, page `10` |
| `3591` | Mathematics 4024 graph sample from 2023 | `generated`, page `3` |
| `3608` | Mathematics 4024 circle-theorem sample | `generated`, page `8` |

No bulk screenshot generation was run.

## Error handling

Backend failures now map to structured reasons where possible:

- `pdf_missing`
- `source_page_missing`
- `bbox_missing`
- `crop_failed`
- `render_failed`
- `storage_failed`
- `page_match_failed`

Students still only see:

> Preview unavailable — open PDF instead.

## Validation

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed: 21 backend tests and 4 frontend tests.
- `npm.cmd run build` passed for frontend and backend.

## Remaining risks

- Local and hosted backend environments should set `SUPABASE_SERVICE_ROLE_KEY`
  server-side only. Without it, private Storage/RLS policies can still block
  PDF downloads during server-side rendering.
- OCR-only/scanned PDFs may still need stronger text/page detection.
- Existing stored screenshots are not overwritten in `on_demand` mode.
- Vite still reports a large bundle warning; this predates this fix and does
  not block the build.
