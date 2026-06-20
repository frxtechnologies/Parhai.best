# Local Development

This guide is for developers using VS Code, Cursor, Replit, Codex, or another standard Node.js environment.

## Prerequisites

- Git
- Node.js 20 or newer
- npm
- Access to a Supabase project
- A Gemini API key for classification and grounded answers
- Optional: Supabase CLI

Verify tools:

```bash
git --version
node --version
npm --version
```

## Clone The Repository

```bash
git clone git@github.com:frxtechnologies/parhai-com.git
cd parhai-com
```

## Install Dependencies

Use the committed lockfiles:

```bash
npm run install:all
```

Equivalent commands:

```bash
npm --prefix frontend ci
npm --prefix backend ci
```

The repository is an npm workspace, so a root install prepares both applications.

## Create Environment Files

The root `.env.example` is a name-only template. Create separate files because Vite and Express load different environments.

### `frontend/.env`

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

For local development, `VITE_API_URL` may be blank because Vite proxies `/api` to port 3001. It can also be set to the local API origin.

### `backend/.env`

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

Recommended local non-secret settings:

```text
PORT: 3001
CORS_ORIGIN: http://localhost:5173
NODE_ENV: development
LOG_LEVEL: info
```

Enter actual values only in local `.env` files or hosting-provider secret settings. Do not paste them into Markdown, source files, screenshots, commits, issues, or chat messages.

## Run Locally

Open two terminals from the repository root.

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

Open:

```text
http://localhost:5173
```

Verify the API:

```text
http://localhost:3001/api/healthz
```

The root `npm run dev` command starts only the frontend. The AI assistant and uploads require the backend process as well.

## Windows Commands

Create environment files in PowerShell:

```powershell
Copy-Item .env.example frontend/.env
Copy-Item .env.example backend/.env
```

Then remove irrelevant sections from each copied file and fill values locally.

Run npm through `npm.cmd` if PowerShell execution policy interferes with `npm`:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

## macOS And Linux Commands

```bash
cp .env.example frontend/.env
cp .env.example backend/.env
```

Then edit each file and start the two processes.

## VS Code

1. Open the repository root, not only `frontend/`.
2. Use two integrated terminals.
3. Keep TypeScript using the workspace version when prompted.
4. Install extensions only as personal editor choices; do not commit workspace changes unless useful to every developer.
5. Run `npm run typecheck` before committing.

## Cursor

1. Open the repository root.
2. Ask Cursor to read `README.md`, `SUPABASE_SETUP.md`, and `AI_ASSISTANT_GUIDE.md` before editing.
3. Tell it that active backend routes are mounted in `backend/src/routes/index.ts`.
4. Require schema changes to be new Supabase migrations.
5. Review generated changes before running database or Git commands.

## Replit

Replit needs two running processes. Use separate workflows or configure a process manager.

Frontend command:

```bash
npm --prefix frontend run dev -- --host 0.0.0.0
```

Backend command:

```bash
npm --prefix backend run dev
```

Set secrets through Replit Secrets, not `.replit` or committed files. Set `VITE_API_URL` to the public backend URL available to the browser. Set `CORS_ORIGIN` to the public frontend URL.

Remember that Vite variables are embedded during build/start. Restart the frontend after changing them.

## Authentication Test

1. Open `/login`.
2. Create an account with email/password.
3. If email confirmation is enabled, confirm the message.
4. Log in.
5. Select a level and subjects.
6. Confirm `/dashboard` shows only selected subjects.
7. Refresh and verify the session persists.
8. Log out and verify protected pages redirect to `/login`.

## Admin Upload Test

1. Ensure the account email exists in `admin_users` and `frontend/src/config/admin.ts`.
2. Log in with that account.
3. Open `/admin`.
4. Select Physics 5054.
5. Choose the 2024 Paper 1 PDF and matching marking scheme.
6. Select the correct session and variant.
7. Submit and wait for the published message.
8. Open the Physics subject workspace and confirm the paper appears.
9. Open the subject AI assistant and ask for a specific question number.

Do not upload confidential, unauthorized, or copyrighted files without the necessary rights.

## Quality Commands

Run before every pull request:

```bash
npm run typecheck
npm test
npm run build
```

Check production backend dependencies:

```bash
npm --prefix backend audit --omit=dev
```

Review local changes:

```bash
git status
git diff --check
git diff
```

## Database Changes

Create a migration instead of editing applied files:

```bash
npx supabase migration new descriptive_name
```

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for linking, applying, and validating migrations.

## Common Errors

### Frontend says Supabase is not configured

Cause: `frontend/.env` is missing or uses Next.js variable names.

Fix: use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart Vite.

### Backend exits immediately

Cause: `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.

Fix: add both to `backend/.env`. Confirm the service key was not accidentally placed in the frontend.

### API requests return 401

Cause: no bearer token, expired session, or frontend and backend use different Supabase projects.

Fix: verify both environment files point to the same project, then log out and back in.

### Admin link is missing

Cause: email is absent from the frontend visibility list or the session profile has a different email.

Fix: normalize the email and update `frontend/src/config/admin.ts`. Backend access also requires an `admin_users` row created through a migration.

### Admin receives 403

Cause: the live database does not contain the email in `admin_users`.

Fix: verify migration state and query the table. Do not weaken or remove the authorization middleware.

### Upload fails with 422

Cause: missing marking scheme, wrong PDF, image-only PDF, incorrect paper format, or fewer than 30 parsed questions/answers.

Fix: inspect the backend error and verify the PDFs. The first parser supports only text-based Physics 5054 2024 Paper 1.

### Upload appears stuck in processing

Cause: an error occurred after metadata creation.

Fix: inspect backend logs and Supabase Storage/database state. Re-uploading the same variant is designed to replace the deterministic paths and extracted rows.

### Assistant says the paper is missing

Cause: no matching `document_chunks` rows or filters do not match the paper.

Fix: verify subject, level, year, paper ID, and ingestion status.

### Assistant reports OpenAI is not configured

Cause: sources were found but `OPENAI_API_KEY` is absent from the backend.

Fix: add the key server-side and restart the API.

### CORS blocks requests

Cause: backend `CORS_ORIGIN` does not exactly match the frontend scheme, hostname, and port.

Fix: correct the origin and restart the backend.

### Deployed page routes return 404

Cause: static host is treating routes as files.

Fix: configure SPA fallback to `index.html`.

### Port is already in use

Find and stop the existing process or change the port. If changing the API port, update `VITE_API_URL` or Vite proxy configuration.

### Vite build fails with a filesystem access error

Cause: a restricted shell or security tool blocked esbuild from resolving files.

Fix: run the build from the repository root in a normal local terminal with access to the project directory.

## Clean Handoff Between Tools

Before switching from VS Code to Cursor, Replit, or Codex:

```bash
git status
npm run typecheck
npm test
git add <files>
git commit -m "Describe completed work"
git push
```

In the next tool:

```bash
git fetch origin
git checkout YOUR_BRANCH
git pull
npm run install:all
```

Never move uncommitted work between tools by copying random generated folders. Commit intentional source changes or create a patch.
