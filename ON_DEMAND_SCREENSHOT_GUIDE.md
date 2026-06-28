# On-demand question screenshots

Parhai keeps original PDFs in Supabase Storage and question metadata in `question_index`. In the recommended mode, screenshots are rendered only for question cards the student opens.

## Modes

Set `SCREENSHOT_MODE` on the backend:

- `off`: no rendering; clients retain question text, PDF, and marking-scheme fallbacks.
- `on_demand`: render one requested page/crop and stream the PNG. Nothing is uploaded.
- `pre_generate`: processing jobs may generate and permanently store screenshots.
- `hybrid_cache`: render on first request, save the result in `question-screenshots/on-demand/`, and reuse it.

Local development defaults to:

```env
SCREENSHOT_MODE=on_demand
```

Native `pdfjs-dist` and `@napi-rs/canvas` modules are dynamically imported inside rendering functions. They are never imported by React or at server module startup.

## Request flow

The AI assistant queries and filters `question_index` first, removes normalized-text duplicates, ranks the remaining evidence, and returns source cards. The UI displays six cards initially. Each visible question card requests:

`GET /api/questions/:questionId/screenshot`

The authenticated backend downloads the source PDF, renders only `source_page`, applies `bbox` when valid, and streams a PNG. Missing/invalid bounds produce a full-page fallback. Rendering errors do not affect the AI answer.

## Storage and compute

`on_demand` uses compute and bandwidth per visible preview but consumes no screenshot Storage. Responses receive a short private browser-cache lifetime. `hybrid_cache` trades Storage for repeat-request performance and gives cached objects a one-day cache-control value. Administrators can remove cached objects under the `on-demand/` prefix without touching PDFs or question metadata.

For native rendering, use a local API, Render, Railway, or a VPS with adequate memory and execution time. On restrictive Netlify/Vercel functions, use `off`, or point the frontend API URL at a dedicated rendering worker.

## Remaining crop limitations

Accurate crops depend on trustworthy `source_page` and `bbox`. Legacy rows with malformed question numbering or missing bounds use full-page fallbacks until re-indexed. Do not enable bulk pre-generation until those rows are repaired.
