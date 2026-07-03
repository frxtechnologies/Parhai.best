# Environment variables

Use `.env.example`, `backend/.env.example`, and `frontend/.env.example` as the canonical list.

## Frontend-safe

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_URL`

Only publishable values may use the `VITE_` prefix.

## Backend-only secrets

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `XAI_API_KEY`

Never commit backend `.env` files or copy these values into frontend configuration.

## Operational settings

Processing, screenshots, Paper Checker retention, provider selection, concurrency, ports, CORS, and logging are documented inline in the example files. Start with conservative concurrency values when restoring to a new host.
