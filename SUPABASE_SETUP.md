# Supabase Setup

This guide describes the Supabase backend used by Parhai.com. Database migrations in `supabase/migrations/` are the source of truth. Do not make undocumented production-only schema changes.

## Responsibilities

Supabase currently provides:

- Email/password authentication
- Persistent browser sessions
- User profiles
- Subject catalog and student subject selection
- Paper, question, topic, note, quiz, and progress data
- Private PDF storage
- pgvector document embeddings
- RAG retrieval functions
- AI chat history
- Row Level Security

## Create Or Connect A Project

1. Create a Supabase project or obtain access to the existing project.
2. Copy the Project URL and a publishable key into `frontend/.env`.
3. Copy the Project URL and service-role key into `backend/.env`.
4. Never expose the service-role key through a `VITE_` or `NEXT_PUBLIC_` variable.

Frontend variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Backend variables:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

The frontend key is safe to expose only because RLS protects the database. The service-role key bypasses RLS and must stay on the backend.

## Supabase CLI

Install or invoke the current CLI, then discover available commands before using them:

```bash
npx supabase --help
npx supabase migration --help
npx supabase db --help
```

Link the repository to a project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Apply committed migrations:

```bash
npx supabase db push
```

List migration state:

```bash
npx supabase migration list
```

Create every new migration through the CLI:

```bash
npx supabase migration new descriptive_change_name
```

Edit the generated SQL file, test it on a development project or branch, run security/performance advisors, and commit it with the related application code.

## Migration Order

Apply files in filename order:

```text
20260615000100_initial_schema.sql
20260615000200_seed_subject_catalog.sql
20260615000300_rag_ai_assistant_schema.sql
20260615000400_private_paper_storage.sql
20260616000100_lock_admin_email.sql
20260619092050_ai_assistant_pipeline.sql
20260619093340_optimize_ai_assistant_rls.sql
20260619100527_add_paper_upload_admin.sql
```

Do not edit a migration that has already been applied to a shared project. Add a new migration instead.

## Authentication Setup

In Supabase Dashboard:

1. Open Authentication settings.
2. Enable Email provider.
3. Decide whether email confirmation is required.
4. Add local and deployed redirect URLs.
5. Add the frontend Site URL.
6. Enable leaked-password protection for production.

Typical redirect entries:

```text
http://localhost:5173/**
https://YOUR_FRONTEND_DOMAIN/**
```

### Google Sign-In (optional)

The login page shows a "Continue with Google" button. It only works once the
Google provider is enabled in Supabase:

1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application).
2. Add the Supabase callback as an authorized redirect URI:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
3. In the Supabase Dashboard, go to Authentication → Providers → Google, enable
   it, and paste the Client ID and Client Secret.
4. Ensure the redirect URLs above include `/dashboard` (the app returns users
   there after Google sign-in).

Until this is configured, the button will bounce back to the login page.

The application uses:

- `signUp` with email and password
- `signInWithPassword`
- `getSession`
- `getUser`
- `onAuthStateChange`
- `signOut`

The `handle_new_user` trigger creates a `profiles` row when a new Auth user is inserted. The frontend also has a defensive profile creation fallback.

## Admin Access

Paper-upload authorization is data-driven through `public.admin_users`.

Current authorized upload emails are inserted by migrations. To add another admin, create a migration:

```sql
insert into public.admin_users (email)
values ('normalized-email@example.com')
on conflict (email) do nothing;
```

Then update `frontend/src/config/admin.ts` so the navigation item is visible for that email. Frontend visibility is not security. The Express middleware queries `admin_users`, and Storage/table RLS policies enforce database access.

To remove an admin, create a new migration that deletes that exact normalized email and update the frontend visibility list.

## Table Catalog

### Identity And Enrollment

| Table | Purpose |
| --- | --- |
| `profiles` | One application profile per Supabase Auth user |
| `subjects` | O-Level and A-Level subject catalog |
| `user_subjects` | Many-to-many mapping of selected student subjects |
| `admin_users` | Emails authorized to manage source content |

### Current Content And RAG Tables

| Table | Purpose |
| --- | --- |
| `papers` | Published paper metadata, Storage path, raw text, and ingestion status |
| `marking_schemes` | One marking-scheme record linked to a paper |
| `questions` | Extracted or authored questions, answers, marks, and paper links |
| `topics` | Normalized subject topic names |
| `question_topics` | Question-to-topic links with confidence and source |
| `document_chunks` | Question, marking-scheme, and note chunks used by RAG |
| `chat_messages` | User-owned AI conversation messages and source references |
| `notes` | Subject notes |

### Study And Progress Tables

| Table | Purpose |
| --- | --- |
| `study_events` | Student activity events |
| `saved_questions` | Questions saved by a student |
| `quizzes` | Generated or stored quizzes |
| `quiz_attempts` | Student quiz answers, score, and feedback |
| `student_progress` | Per-student, per-subject progress totals and weak topics |

### Legacy RAG Tables

These tables were created by the earlier RAG scaffold and are not the primary tables used by the current Express AI route:

- `past_papers`
- `paper_chunks`
- `note_chunks`
- `ai_chat_history`

Do not silently write new features to both schemas. New work should use `papers`, `document_chunks`, and `chat_messages`, or include an explicit migration plan to consolidate the legacy tables.

## Important Columns

### `papers`

```text
id
subject_id
title
year
session
paper_number
type
variant
file_url
level
subject_code
storage_path
ingestion_status
raw_text
created_at
updated_at
```

Student queries show only papers with `ingestion_status` equal to `ready` or `ready_without_embeddings`.

### `document_chunks`

```text
id
source_type
paper_id
question_id
marking_scheme_id
note_id
subject_id
level
year
session
paper_number
question_number
content
metadata
embedding
created_at
```

`embedding` uses `vector(1536)`, matching the default OpenAI embedding model configured by the backend.

### `chat_messages`

```text
id
user_id
subject_id
paper_id
role
content
sources
created_at
```

RLS restricts chat reads, inserts, and deletes to the authenticated owner.

## Database Types

The schema defines:

- `study_level`: `O_LEVEL`, `A_LEVEL`
- `paper_session`: `MAY_JUNE`, `OCT_NOV`, `FEB_MAR`
- `paper_type`: `PAST_PAPER`, `MARKING_SCHEME`
- `question_difficulty`: `EASY`, `MEDIUM`, `HARD`

Use these exact values in frontend and backend code.

## Retrieval Functions

### `match_document_chunks`

Semantic vector retrieval filtered by:

- `subject_id`
- `level`
- optional year
- optional paper ID
- match count

### `search_document_chunks`

Postgres full-text fallback with the same subject, level, year, and paper filters.

Both functions return source metadata and similarity/rank values. The API merges and deduplicates results.

## Storage Buckets

All current source buckets are private:

| Bucket | Contents |
| --- | --- |
| `papers` | Question-paper PDFs |
| `marking-schemes` | Marking-scheme PDFs |
| `notes` | Future note PDFs |

Authenticated users can read permitted files. Admin policies allow content management when the authenticated email exists in `admin_users`.

Uploads use deterministic paths:

```text
LEVEL/SUBJECT_CODE/YEAR/SESSION/paper-N/variant-N/question-paper.pdf
LEVEL/SUBJECT_CODE/YEAR/SESSION/paper-N/variant-N/marking-scheme.pdf
```

The first ingestion implementation currently writes Physics paths only.

## RLS Rules

- Profiles, selections, progress, saved questions, and chats are owner-scoped.
- Subjects and published study content are readable by authenticated users.
- Content management is limited to admin emails.
- Service-role operations run only in the backend.
- The frontend never receives the service-role key.

Whenever adding a table to `public`:

1. Enable RLS.
2. Grant only the required Data API privileges.
3. Add explicit policies.
4. Test as anonymous, ordinary authenticated, owner, and admin users.
5. Run Supabase security and performance advisors.

## Verification Queries

Run these in the SQL editor after setup:

```sql
select code, level, name from public.subjects order by level, name;

select id, title, ingestion_status
from public.papers
order by created_at desc;

select paper_id, source_type, count(*)
from public.document_chunks
group by paper_id, source_type
order by paper_id, source_type;

select id, name, public
from storage.buckets
where id in ('papers', 'marking-schemes', 'notes')
order by id;
```

Every bucket should report `public = false`.

## New Project Checklist

1. Create project.
2. Configure Auth provider and redirect URLs.
3. Link Supabase CLI.
4. Apply all migrations.
5. Confirm pgvector is installed.
6. Confirm all three Storage buckets are private.
7. Verify subject seeds.
8. Verify admin rows.
9. Run advisors.
10. Add frontend publishable values.
11. Add backend service-role values.
12. Create a test account and complete onboarding.
13. Test ordinary-user and admin access separately.
