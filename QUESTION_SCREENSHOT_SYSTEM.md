# Question Screenshot System

Question screenshots are generated only by the backend processor. The frontend never renders PDFs or imports native canvas dependencies.

## Local setup

1. Apply Supabase migrations, including `20260628071136_complete_question_screenshot_system.sql`.
2. Set `ENABLE_QUESTION_SCREENSHOTS=true` in `backend/.env`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Install dependencies and run the API locally.

The renderer dynamically imports `pdfjs-dist` and `@napi-rs/canvas` only after the feature flag is enabled. With the flag false, indexed questions are marked `not_generated`, processing continues, and the student UI keeps PDF, text, and marking-scheme fallbacks.

## Existing questions

Run one Physics 5054 paper first:

```sh
npm run generate:screenshots
```

The command deliberately selects only one processed Physics 5054 paper with missing screenshots. To target a known paper:

```sh
npm run generate:screenshots -- 123
```

Use the Processing Jobs page to generate a whole paper or retry one question.

## Cropping and failures

PDF text coordinates locate a question heading and the next heading. All diagrams, tables, and graphs within that vertical page region remain in the rendered crop. Continuations create ordered `-part-N` images. When coordinates cannot be found, the renderer stores a full-page image with `full_page_fallback`. Renderer and upload failures set `failed` and never fail indexing, tagging, embeddings, or marking-scheme linking.

Files use:

`question-screenshots/{level}/{subject_code}/{year}/{session}/paper-{paper}/variant-{variant}/q-{question}.png`

## Hosting later

Netlify functions may not provide the native libraries, memory, or execution time required by PDF rendering. Leave the flag false there. A future Render, Railway, or VPS worker can run the same backend command with the native dependency installed, Supabase service credentials, and the flag enabled. No frontend or schema change is required.
