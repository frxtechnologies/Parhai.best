# AI Provider Configuration

Parhai uses one server-side AI service layer. Chat, topic classification, paper analysis, syllabus-map generation, and marking-scheme analysis all call this layer; frontend code never receives provider keys.

## Environment variables

Set these in `backend/.env` locally or in the hosting provider's server environment:

```env
AI_PROVIDER=groq
AI_MODEL=llama-3.3-70b-versatile

OPENAI_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

`AI_PROVIDER` selects `openai`, `groq`, `gemini`, or `openrouter`. Existing xAI compatibility remains available. `AI_MODEL` overrides the selected provider's model. Provider-specific model variables remain supported as fallbacks for compatibility.

Only the key for the active provider is required. Never add real keys to `.env.example`, frontend variables, source files, or Git.

## Switching providers

1. Change `AI_PROVIDER`.
2. Set `AI_MODEL` to a model offered by that provider.
3. Add the matching server-side API key.
4. Restart the local backend or trigger a Netlify environment redeploy.
5. Open **Admin → AI Testing** and use **Test connection**.

No prompt must be re-entered. Cambridge teacher instructions, grounding rules, topic-classification instructions, and processing prompts remain versioned in backend code.

## Data safety

Provider configuration is independent from Supabase. Changing a provider, model, or key does not delete or rewrite:

- uploaded PDFs and Storage paths
- extracted text and chunks
- indexed questions and topic tags
- question screenshots
- marking-scheme links
- completed processing jobs

After a provider change, only jobs already marked `uploaded`, `extracting`, `indexing`, or `failed` need retrying. Completed resources remain searchable. Reprocessing completed resources is optional and should only be used when intentionally regenerating classifications or embeddings.

## Health check

The admin AI testing page displays:

- active provider
- active model
- whether the active provider key is configured
- connection state
- provider test response

The browser receives only these booleans and labels. It never receives API-key contents.
