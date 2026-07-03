# Project status

Parhai.com is paused as of July 2026. The repository contains the frontend, backend, migrations, AI Tutor, Paper Checker, Bulk Import, processing queue, screenshots, analytics, and administrative review tools.

## Current data health

Last database-wide evaluation:

- AI data health: 22%
- indexed questions: 5,970
- student-verified questions: 624
- exact official marking links: 725
- identity-invalid references flagged: 462
- low-confidence marking references requiring review: 1,375
- unknown question types: 2,885
- missing question previews: 5,801

Available indexed syllabuses were Mathematics 4024, Physics 5054, and Chemistry 5070.

## Priority work when resuming

1. Reconnect a Supabase project and restore migrations/data/storage.
2. Re-extract and exactly relink Physics and Mathematics marking schemes.
3. Review Chemistry topics before exposing Chemistry questions to students.
4. Generate answer-specific marking-scheme page metadata/previews.
5. Review unknown question types and low-confidence topic tags.
6. Run all coverage, dynamic, and marking-link evaluations.

The repository contains no intended private keys. Local Supabase and AI credentials must be supplied again after restoration.
