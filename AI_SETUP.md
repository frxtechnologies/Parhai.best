# Parhai AI provider setup

Parhai uses one server-side service in `backend/src/lib/ai-service.ts` for chat, classification, topic tagging, and embeddings. Frontend code never receives provider keys.

## Select a provider

Set `AI_PROVIDER` to one of `xai`, `gemini`, `openai`, `groq`, or `openrouter`, then add only that provider's key. Changing providers requires an environment change and redeploy, not a code change.

```env
AI_PROVIDER=xai
XAI_API_KEY=your-secret-key
XAI_MODEL=grok-3-mini
```

Other supported keys are `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, and `OPENROUTER_API_KEY`. Optional model variables are listed in `.env.example`.

For xAI, OpenAI-compatible chat is sent from the backend to `https://api.x.ai/v1`. Gemini uses its native server API. OpenAI uses native embeddings; Gemini uses native embeddings. xAI, Groq, and OpenRouter use a deterministic 768-dimensional local retrieval vector so processing remains available even when the selected chat provider does not expose a compatible embedding model.

## Local setup

Add the variables to `backend/.env`, restart `npm run dev`, sign in as the content administrator, and open `/admin/ai-testing`. The page displays provider, model, whether a key was detected, connection state, and a test response. It never displays the key.

## Netlify

In Site configuration → Environment variables, add:

- `AI_PROVIDER`
- the selected provider key, such as `XAI_API_KEY`
- the optional selected model, such as `XAI_MODEL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` when server-side privileged processing is enabled
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Redeploy after changing environment variables. Never create a `VITE_` provider key because Vite exposes those values to browsers.

## Automatic RAG pipeline

An admin upload creates a private Storage object, a `resources` row, and a `processing_jobs` row. The secure processing endpoint extracts text, creates `ai_chunks`, splits question-like resources into `question_index`, tags questions through the active provider, and links marking-scheme answers. Student retrieval is restricted by `subject_id` and approved resources. Answers and citations are logged in `ai_chat_logs` for the signed-in user.

Scanned PDFs return an explicit OCR-required error. Provider errors distinguish missing or invalid keys, rate limits, unavailable providers, and unavailable models.
