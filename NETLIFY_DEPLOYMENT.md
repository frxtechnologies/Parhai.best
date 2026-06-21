# Netlify deployment

The project deploys from the repository root using `netlify.toml`. Netlify builds `frontend/dist`, serves client-side routes through the SPA fallback, and exposes the existing Express API through `netlify/functions/api.ts`.

`frontend/public/_redirects` duplicates the API and SPA fallback rules in the published output. This protects route refreshes even when Netlify does not pick up the repository-level redirect configuration. Keep the Netlify Base directory at the repository root so the bundled Function is discovered.

## Required environment variables

Set these in **Netlify → Site configuration → Environment variables** for Production and Deploy Previews:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Optional server-only variables:

```env
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
SUPABASE_SERVICE_ROLE_KEY=
CORS_ORIGIN=https://YOUR_SITE.netlify.app
LOG_LEVEL=info
```

Do not set `VITE_API_URL` for the normal Netlify deployment. A blank value makes the browser use `/api`, which `netlify.toml` routes to the bundled API function. Only set it when the backend is deliberately hosted on a different public origin.

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` through a `VITE_` variable.

## Supabase Auth

In Supabase Authentication URL configuration, set the Site URL to the production Netlify URL and add production/deploy-preview callback URLs as needed. Email/password login itself uses the Supabase client directly; API routes validate the Supabase bearer token server-side.

## Supabase data flow

Admin uploads write the file to the private `resources` Storage bucket and insert one canonical `resources` row containing the selected `subject_id`, normalized `resource_type`, `file_url`, and `file_path`. Student subject pages query `resources` using both the current subject ID and each canonical category. The Resource Manager reloads directly from Supabase after an insert.

The deployed API extracts PDF text, creates overlapping chunks, generates 768-dimensional Gemini embeddings, and stores them in `ai_chunks`. The assistant uses `match_ai_chunks` semantic retrieval with keyword matching as a fallback. `GEMINI_API_KEY` is therefore required for both AI answers and complete resource processing.

For Vercel, use the same environment variables. The frontend may set `VITE_API_URL` to the public Vercel API origin if the Express routes are deployed separately; never set it to localhost. This repository currently includes the serverless adapter for Netlify in `netlify/functions/api.ts`.

Legacy `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` names remain supported as fallbacks, but new deployments should use the publishable-key names above.
