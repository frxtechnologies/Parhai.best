# Parhai Gemini assistant setup

The AI assistant searches authenticated Supabase records in `papers`, `questions`, `topics`, and `notes`. Only the retrieved records are sent to Gemini. The Gemini key is read by the backend and is never included in frontend code.

## Local setup

1. Create a Gemini API key in Google AI Studio.
2. Add it to `backend/.env`:

   ```env
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-2.5-flash-lite
   ```

3. Keep `SUPABASE_URL` and `SUPABASE_ANON_KEY` configured in `backend/.env`. `SUPABASE_SERVICE_ROLE_KEY` is optional for this route because it uses the signed-in student's JWT and Supabase RLS.
4. Restart the backend with `npm run dev` from `backend`.

Never add `GEMINI_API_KEY` to a `VITE_`, `NEXT_PUBLIC_`, or other browser-exposed variable.

## Netlify

In the Netlify site, open **Site configuration → Environment variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`), scope it to the server function/backend runtime, and redeploy. If the Express backend is hosted separately, add the variable on that backend host instead—Netlify frontend variables cannot configure another server.

## Vercel

Open **Project Settings → Environment Variables**, add `GEMINI_API_KEY` for Production/Preview/Development as needed, then redeploy the backend project. Do not prefix the key with `NEXT_PUBLIC_`.

## Test

1. Sign in to Parhai and ensure a real paper has been processed into `questions`.
2. Open `/admin/ai-testing`.
3. Select Physics and ask: `How many Light questions appeared in Physics 2024?`
4. Confirm that **Supabase results used** shows real matching rows and that the final answer cites them.

If no matching rows exist, the API returns `I could not find this in the uploaded papers yet.` If the key is absent, it returns `AI assistant is not configured yet. Please add GEMINI_API_KEY.`
