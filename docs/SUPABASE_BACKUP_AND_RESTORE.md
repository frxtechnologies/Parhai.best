# Supabase backup and restore

Parhai previously used Supabase project reference `izzywbkohqzbnhnvqzaa`. The reference is not a secret; passwords and service-role keys are deliberately absent from this repository.

## Required environment variables

Copy the tracked example files and fill them locally:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Required values include `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. The service-role key belongs only in `backend/.env`. Never add it to a `VITE_` variable.

## Restore into a new project

1. Create a new Supabase project and save its database password in a password manager.
2. Install and authenticate the Supabase CLI.
3. Run `supabase link --project-ref NEW_PROJECT_REF`.
4. Review migration history with `supabase migration list --linked`.
5. Apply the tracked schema with `supabase db push --linked --include-all`.
6. Run `supabase db advisors` and address security/performance warnings.
7. Populate local environment files with the new URL and keys.
8. Restart the backend and frontend, then run the retrieval and marking-link evaluations.

Do not run `supabase db reset` against a hosted project.

## Storage

Migrations create or configure the official resource and private Paper Checker storage policies where applicable. Verify these buckets after migration:

- official resource bucket used by `resources.bucket`
- `question-screenshots`
- `paper-checker-submissions` (private)

Create any missing bucket in the Supabase dashboard with the same name used by the application. Official Cambridge resources must not be placed in the temporary Paper Checker bucket.

## RLS and administrator access

All exposed application tables should have RLS enabled. Policies are stored in `supabase/migrations`. After creating the first authenticated account, add its normalized email to `public.admin_users` using the SQL editor or another trusted administrator. Do not base authorization on editable user metadata.

## Key classification

Safe in the browser:

- project URL
- publishable/anon key, protected by RLS

Backend-only:

- service-role/secret key
- database password and connection URL
- AI-provider keys
- JWT or deployment secrets

## Reconnecting an agent later

Clone the repository, create local `.env` files from examples, authenticate the Supabase CLI, and link the new project. Give future agents repository access and temporary Supabase access only when needed. Never paste secrets into committed files, chat logs, screenshots, or issue descriptions.

Before abandoning the previous account, revoke or rotate its service-role/database/AI keys and export any data or Storage objects needed later. Migrations preserve structure, not production rows or uploaded PDF objects.
