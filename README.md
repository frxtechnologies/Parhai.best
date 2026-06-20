# Parhai.com

Parhai.com is an AI-assisted study platform for Cambridge O-Level and A-Level students. Students authenticate with Supabase, select their level and subjects, open subject workspaces, browse papers and notes, and ask a subject-scoped assistant questions backed by uploaded source material.

This standalone repository is the Parhai.com project source of truth. It is designed to run independently from the FRX Technologies website.

## Current Status

- Supabase email/password authentication is active.
- O-Level and A-Level subject catalogs are seeded through migrations.
- Selected subjects drive the student dashboard.
- The admin upload flow is active for the first controlled ingestion test.
- Admins can upload and process question papers directly through Supabase Storage.
- Gemini classifies extracted questions and answers only from retrieved Supabase records.
- Uploaded source content is private and retrieved through authenticated flows.
- Image-only PDF OCR remains a future integration; basic upload and AI processing do not use n8n.

Do not present future integrations as working features. The application intentionally returns a missing-source response when relevant paper data has not been ingested.

## Repository

The intended GitHub repository is `frxtechnologies/parhai-com`.

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
- OpenAI chat completions and embeddings through HTTPS

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
|       |-- lib/              Supabase, OpenAI, and logging clients
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
git clone git@github.com:frxtechnologies/parhai-com.git
cd parhai-com
npm install
```

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
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

The active Express backend reads:

```env
SUPABASE_URL=
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
4. It generates a query embedding when OpenAI is configured.
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
10. Embeddings are generated when OpenAI is configured.
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

## Deployment

Deploy the repository as two services.

### Frontend Service

```text
Root directory: frontend
Build command:  npm ci && npm run build
Output:         dist
```

Configure SPA fallback so unknown routes serve `index.html`. Set `VITE_API_URL` to the public backend origin.

### Backend Service

```text
Root directory: backend
Build command:  npm ci && npm run build
Start command:  npm start
```

Set server-only Supabase and OpenAI variables in the hosting provider. Set `CORS_ORIGIN` to the deployed frontend origin. Do not expose backend secrets as frontend variables.

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
| Assistant returns `503` | Sources exist but OpenAI is not configured | Add `OPENAI_API_KEY` to the backend environment |
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
