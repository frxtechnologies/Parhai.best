# Agent workflow

Future Codex, Cursor, Replit, or human contributors must:

1. Pull the latest GitHub branch first.
2. Never commit `.env` files or paste secrets into logs.
3. Keep the Supabase service-role key backend-only.
4. Create local configuration from `.env.example`.
5. Use a dedicated branch for large changes.
6. Make small, intentional commits.
7. Preserve unrelated user changes in dirty worktrees.
8. Create Supabase schema changes through tracked migrations.
9. Run typecheck, tests, and build before pushing.
10. Report changed files, migrations, validation, and remaining risks.

Do not reset Supabase, delete uploaded resources, or rewrite Git history without explicit approval.
