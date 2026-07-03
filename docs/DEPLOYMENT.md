# Deployment

Deploy frontend and backend separately or on a host supporting both Node services.

- Frontend: build with `npm --prefix frontend run build`; output is `frontend/dist`.
- Backend: build with `npm --prefix backend run build`; start with `npm --prefix backend start`.
- Configure all secrets in the hosting provider, never in Git.
- Native PDF/canvas processing requires a compatible Node host. Keep screenshots off on unsupported serverless hosts.
- Configure CORS for the deployed frontend origin.
- Run migrations before starting workers.
- Keep `SUPABASE_SERVICE_ROLE_KEY` backend-only.

After deployment, test authentication, resource PDFs, AI Tutor database fallback, Paper Checker privacy, Bulk Import, and the health evaluations.
