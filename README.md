# Parhai.com

> Project status: paused as of July 2026. The complete restorable codebase and Supabase migrations are archived here without private credentials. Start with [docs/SETUP.md](docs/SETUP.md) and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

Parhai.com is an AI-assisted study platform for Cambridge O-Level and A-Level students. Students authenticate with Supabase, select their level and subjects, open subject workspaces, browse papers and notes, and ask a subject-scoped assistant questions backed by uploaded source material.

This standalone repository is the Parhai.com project source of truth. It is designed to run independently from the FRX Technologies website.

## Current Status

- Supabase email/password authentication is active.
- O-Level and A-Level subject catalogs are seeded through migrations.
- Selected subjects drive the student dashboard.
- The admin upload flow is active for the first controlled ingestion test.
- Admins can upload and process question papers directly through Supabase Storage.
- A provider-flexible server AI layer supports xAI, Gemini, OpenAI, Groq, and OpenRouter.
- Uploaded source content is private and retrieved through authenticated flows.
- Image-only PDF OCR remains a future integration; basic upload and AI processing do not use n8n.

Do not present future integrations as working features. The application intentionally returns a missing-source response when relevant paper data has not been ingested.

## Repository

GitHub repository: `frxtechnologies/Parhai.best`.

## Tech Stack

### Frontend

- React 19
- Vite 6
- TypeScript
- Tailwind CSS 4
- Wouter routing
- TanStack Query
- Framer Motion
- Lucide icons
- Supabase JavaScript client

### Backend

- Node.js 20+
- Express 5
- TypeScript
- Zod request validation
- Multer multipart uploads
- `pdf-parse` text extraction
- Pino structured logging
- Supabase service-side client
- Provider-selected AI chat/classification plus 768-dimensional retrieval embeddings

### Data And Infrastructure

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Row Level Security
- pgvector
- GitHub

## Folder Structure

```text
.
|-- frontend/                 React/Vite application
|   |-- public/               Static assets, including logo.png
|   `-- src/
|       |-- api/              Supabase and backend API client hooks
|       |-- components/       Reusable UI and application layout
|       |-- config/           Frontend configuration such as admin visibility
|       |-- context/          Supabase auth/session context
|       |-- lib/              Supabase browser client and utilities
|       `-- pages/            Route-level screens
|-- backend/                  Active Express API and legacy scaffolding
|   `-- src/
|       |-- lib/              Supabase, provider-flexible AI, and logging clients
|       |-- middleware/       Supabase user/admin authorization
|       |-- routes/           Active and legacy route modules
|       `-- services/         PDF parsing and ingestion logic
|-- supabase/
|   |-- migrations/           Ordered database and Storage migrations
|   `-- README.md             Older Supabase notes; prefer SUPABASE_SETUP.md
|-- AI_ASSISTANT_GUIDE.md     RAG, API, ingestion, and extension guide
|-- LOCAL_DEVELOPMENT.md      Local setup and troubleshooting
|-- SUPABASE_SETUP.md         Database, Auth, Storage, RLS, and migrations
|-- .env.example              Environment variable names only
`-- README.md                 Main handover and project map
```

## Quick Start

```bash
git clone https://github.com/frxtechnologies/Parhai.best.git
cd Parhai.best
npm install
```

## Subject Resource Architecture

Parhai uses three core Supabase tables for the subject library:

- `subjects`: the O Level/A Level subject catalogue and syllabus codes.
- `resources`: metadata for past papers, marking schemes, notes, syllabuses, and worksheets. Each row stores the subject, exam metadata, private Storage path, file information, and processing status.
- `ai_chunks`: extracted resource text split into ordered, searchable chunks. Every chunk is linked to both `subject_id` and `resource_id`; deleting a resource cascades to its chunks.

The private Supabase Storage bucket is `resources`. Signed-in students can read files through short-lived signed URLs. Only emails listed in `admin_users` can create, update, or delete subjects, resource rows, chunks, and Storage objects. Apply the ordered SQL files in `supabase/migrations/` when provisioning a new Supabase project.

### Upload and AI flow

1. An administrator opens `/admin/resources`, selects a subject and resource type, enters optional exam metadata, and uploads a PDF or text file.
2. The browser uploads the file directly to the private `resources` bucket and inserts its metadata into `resources`.
3. The authenticated backend downloads the stored file, extracts real text, splits it into overlapping chunks, and saves them in `ai_chunks`.
4. The subject AI assistant searches only approved chunks and indexed questions for the selected subject. Only relevant evidence is sent to the active server-side AI provider.
5. Answers cite the stored resource title, year, and paper code. If matching chunks do not exist, the assistant returns the missing-source response instead of inventing an answer.

Text-based PDFs and plain-text files are processed directly. Image-only scans require an OCR extension before they can produce AI chunks.

Create two local environment files from `.env.example`:

```text
frontend/.env
backend/.env
```

Run the frontend and backend together:

```bash
npm run dev
```

Local URLs:

```text
Frontend: http://localhost:5173
API:      http://localhost:3001
Health:   http://localhost:3001/api/healthz
```

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for Windows, macOS/Linux, Cursor, VS Code, and Replit instructions.

## Environment Variables

The active Vite frontend reads:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_URL=
```

The active Express backend reads:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_EMBEDDING_MODEL=
PORT=
CORS_ORIGIN=
NODE_ENV=
LOG_LEVEL=
```

`GEMINI_API_KEY` is a backend-only secret used by the active assistant and paper-classification pipeline. No active route depends on n8n.

`GEMINI_EMBEDDING_MODEL` defaults to `gemini-embedding-001`. Resource processing extracts text, stores chunks and 768-dimensional embeddings in `ai_chunks`, and updates `resources.status` through `uploaded`, `processing`, `processed`, or `failed`. Marking schemes are linked to past papers by subject, level, year, session, paper code, and variant.

Never put `SUPABASE_SERVICE_ROLE_KEY` or an AI provider key in `frontend/.env`. Never commit `.env` files.

## Application Routes

Frontend routes:

| Route | Purpose |
| --- | --- |
| `/` | Product homepage |
| `/login` | Login and account creation |
| `/onboarding` | Level and subject selection |
| `/dashboard` | Selected-subject dashboard |
| `/subjects` | Subject catalog |
| `/subject/:id` | Subject workspace |
| `/subject/:id/ai` | Subject-scoped AI assistant |
| `/papers` | Paper browser |
| `/notes` | Notes browser |
| `/questions` | Question browser |
| `/ai` | General AI entry screen |
| `/progress` | Progress screen |
| `/admin` | Authorized paper upload screen |

Active backend routes:

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/healthz` | None | API health check |
| `POST` | `/api/ai-assistant` | Supabase bearer token | Retrieve sources and answer a student question |
| `POST` | `/api/ingest/physics-2024-paper-1` | Admin bearer token | Ingest the first Physics paper test pair |

Files in `backend/src/routes/` other than those mounted by `backend/src/routes/index.ts` are legacy scaffolding and are not active HTTP endpoints.

## Supabase Overview

Supabase provides authentication, profiles, subject selection, source metadata, extracted questions, document chunks, vectors, chat history, and private file storage. All exposed tables use RLS.

The main active RAG tables are:

- `papers`
- `marking_schemes`
- `questions`
- `topics`
- `question_topics`
- `document_chunks`
- `chat_messages`

The private Storage buckets are:

- `papers`
- `marking-schemes`
- `notes`

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the full table catalog, migration process, Auth settings, admin access, and RLS notes.

## AI Assistant Flow

1. The frontend sends the Supabase access token and a subject-scoped question to `POST /api/ai-assistant`.
2. The API validates the token and request.
3. The API finds exact question-number matches when possible.
4. It generates a query embedding through the central AI service.
5. It calls `match_document_chunks` for semantic retrieval.
6. It falls back to `search_document_chunks` for keyword retrieval.
7. If no sources exist, it returns the fixed missing-paper message without inventing content.
8. If sources exist, the model receives only those chunks and must cite them.
9. User and assistant messages are written to `chat_messages`.

See [AI_ASSISTANT_GUIDE.md](AI_ASSISTANT_GUIDE.md) for request/response examples and extension instructions.

## PDF Ingestion Flow

1. An authorized admin opens `/admin`.
2. The frontend sends both PDFs as multipart form data with a Supabase bearer token.
3. The API verifies the email against `admin_users`.
4. PDFs are uploaded to private Storage buckets.
5. `pdf-parse` extracts text.
6. The parser detects Physics Paper 1 questions and marking-scheme answer pairs.
7. Questions and answers are linked by question number.
8. Topics are classified by AI when configured, with a keyword fallback.
9. Question and marking-scheme chunks are created.
10. Embeddings are generated through the central AI service.
11. The paper is marked `ready` or `ready_without_embeddings`.
12. Ready papers immediately appear in the matching subject queries and become retrievable by the assistant.

The current endpoint is deliberately specific to Physics 5054, year 2024, Paper 1. Generalize the parser and endpoint only after validating the real test PDFs.

## Build And Verification

```bash
npm run typecheck
npm test
npm run build
```

Frontend-only commands:

```bash
npm run typecheck:frontend
npm run build:frontend
```

Backend-only commands:

```bash
npm run typecheck:backend
npm run build:backend
npm --prefix backend test
```

## Subject-aware automatic RAG

The canonical pipeline is `resources` → `processing_jobs` → PDF extraction → `question_index` + `ai_chunks`. Past papers, worksheets, tests, and topicals are split into numbered questions and tagged with topic, subtopic, difficulty, and marks. Matching marking schemes update `answer_text` by subject, level, board, year, session, paper code, variant, and question number. Scanned PDFs fail clearly with an OCR-required status.

Student AI requests include the selected subject, level, and board. Server retrieval enforces the real `subject_id` and `is_approved` resource boundary before invoking the selected provider. Citations contain source file, year, session, paper code, variant, and question number. Admins can inspect and retry jobs at `/admin/processing` and test provider configuration at `/admin/ai-testing`.

AI configuration is server-only. Set `AI_PROVIDER` to `xai`, `gemini`, `openai`, `groq`, or `openrouter` and add the matching key (`XAI_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, or `OPENROUTER_API_KEY`). See `AI_SETUP.md`.

## Deployment

The repository includes `netlify.toml`, so Netlify deploys the Vite frontend and the Express API together.

### Netlify

```text
Base directory: repository root
Build command:  npm run build:frontend
Output:         frontend/dist
Functions:      netlify/functions
```

The included redirects send `/api/*` to the Netlify API function and all other unknown paths to the SPA. Leave `VITE_API_URL` blank on Netlify. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` in Netlify environment variables. Add `GEMINI_API_KEY` for AI processing. `SUPABASE_SERVICE_ROLE_KEY` remains optional and server-only.

### Supabase

Use the existing project or create a new one, then apply every migration in `supabase/migrations/` in filename order. Configure the deployed frontend URL in Supabase Auth redirect URLs.

## GitHub Workflow

Before starting work:

```bash
git checkout main
git pull origin main
git switch -c feature/short-description
```

After making changes:

```bash
npm run typecheck
npm test
npm run build
git status
git add <files>
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Open pull requests into `main`. Pull remote changes before continuing in a different tool. Avoid committing generated build folders, `.env` files, service keys, uploaded PDFs, or editor-specific state.

## Common Errors

| Error | Likely Cause | Fix |
| --- | --- | --- |
| `Supabase is not configured` | Missing Vite values | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `frontend/.env`, then restart Vite |
| Backend exits during startup | Missing server Supabase values | Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `backend/.env` |
| `401 A valid Supabase session is required` | Missing or expired bearer token | Log out, log in again, and retry |
| `403 Only the Parhai content administrator...` | Email is not in `admin_users` | Add the normalized email through a migration; do not bypass middleware |
| Upload returns `422` | PDF text did not match the controlled parser | Confirm both PDFs are text-based Physics 5054 Paper 1 files and select the correct session/variant |
| Paper upload succeeds but is not listed | Ingestion status is not ready | Inspect API logs and the `papers.ingestion_status` value |
| Assistant says the paper is missing | No matching chunks exist | Complete ingestion and verify `document_chunks` rows for the paper |
| Assistant returns `503` | Active AI provider is missing or unavailable | Check `AI_PROVIDER` and its server-side API key, then use `/admin/ai-testing` |
| CORS error | Frontend origin is not allowed | Set backend `CORS_ORIGIN` to the exact frontend origin |
| Direct deployed route returns 404 | Static host lacks SPA fallback | Rewrite all frontend routes to `/index.html` |
| Vite changes are ignored | Environment values are loaded at startup | Restart the frontend dev server |

More troubleshooting is in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

## Handover Checklist

1. Read this README.
2. Follow [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).
3. Apply or verify [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
4. Read [AI_ASSISTANT_GUIDE.md](AI_ASSISTANT_GUIDE.md) before changing retrieval or ingestion.
5. Run typecheck, tests, and build before every pull request.
6. Keep all schema changes as new migration files.
7. Never place server secrets in frontend code or Git history.
