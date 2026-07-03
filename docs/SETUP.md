# Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy all three `.env.example` files to untracked `.env` files.
4. Add Supabase and optional AI-provider credentials locally.
5. Apply Supabase migrations as described in `SUPABASE_BACKUP_AND_RESTORE.md`.
6. Run `npm run dev`.

Validation:

```bash
npm run typecheck
npm test
npm run build
npm run eval:ai:coverage
npm run eval:ai:dynamic
npm run eval:marking-links
```

The frontend defaults to port 5173 and backend to port 3001.
