# Parhai AI Study Agents Foundation

## Files changed

- `backend/src/services/study-agents.ts`
- `backend/src/services/study-agents.test.ts`
- `backend/src/routes/study-agents.ts`
- `backend/src/routes/index.ts`
- `frontend/src/lib/agent-api.ts`
- `frontend/src/pages/paper-analyzer-agent.tsx`
- `frontend/src/pages/repeated-topics.tsx`
- `frontend/src/pages/revision-planner.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/layout/sidebar.tsx`
- `supabase/migrations/20260701070055_ai_study_agents_foundation.sql`

## Database changes

The migration adds:

- `paper_analyses` for safe cached paper-analysis JSON.
- `repeated_topic_stats` for transparent cached trend calculations.
- `revision_plans` for student-owned saved plans.

All three tables have RLS enabled. Authenticated students may read safe shared analytics. Revision-plan policies require `auth.uid() = user_id` for read, insert, update, and delete. No service-role or AI-provider key is used in frontend code.

The migration is committed locally but not force-pushed because the existing June 30 Supabase migration history still has timestamp drift. It should be applied after the migration history is reconciled.

## PaperAnalyzerAgent

The agent accepts an exact question-paper resource ID, loads its metadata, and calls the existing database-first exam engine. It returns:

- paper identity and syllabus metadata
- indexed/verified/marks/link/preview completeness
- topic and subtopic distribution
- difficulty distribution
- deterministic question-type classification
- high-scoring questions
- topics the paper is useful for practising
- honest partial-index and missing-mark-scheme warnings

Question type classification uses explicit question text signals for calculation, graph, diagram, data/table, practical, explanation, definition, and theory questions.

## RepeatedTopicsAgent

The agent filters verified `question_index` rows by subject, year range, paper, session, and variant. It groups real rows by topic and calculates:

- question and mark totals
- subtopics
- years, sessions, and papers represented
- Easy/Medium/Hard split
- increasing/stable/decreasing trend
- source question IDs

Prediction score is transparent and deterministic:

- frequency: up to 40 points
- marks weightage: up to 20 points
- recency: up to 20 points
- spread across the selected years: up to 15 points
- paper relevance: up to 5 points

Labels are High chance at 70+, Medium chance at 40–69.9, and Low chance below 40. The UI always states that past-paper prediction is not guaranteed and warns when fewer than three indexed years are available.

## RevisionPlannerAgent

The planner uses:

- selected subject and syllabus
- current/target grade
- exam date
- available hours
- 7/14/30/90-day plan length
- student-declared weak topics
- the top repeated topics from the latest five-year indexed dataset

Each day contains concept revision, verified past-paper practice, marking-scheme review, estimated time, and periodic mini tests. Plans are deterministic and remain useful without an AI provider. The schema is ready for future Paper Checker weak-topic input.

## Routes and UI

- `/paper-analyzer`
- `/repeated-topics`
- `/revision-planner`

Backend:

- `GET /api/agents/paper-analyzer/:resourceId`
- `GET /api/agents/repeated-topics`
- `POST /api/agents/revision-planner`
- `GET /api/agents/revision-plans`

The three routes are visible in the existing student sidebar and use the established layout and authentication.

## Security

- All endpoints require an authenticated user.
- The browser sends only the user access token.
- Service-role and provider keys remain backend-only.
- Revision plan RLS is owner-scoped.
- Shared analytics tables are read-only to students.
- No model fine-tuning or guaranteed prediction claims were added.

## Tests

- Typecheck: passed.
- Automated tests: 40 passed (34 backend, 6 frontend).
- Production frontend and backend builds: passed.
- Git diff validation: passed.

## Remaining limitations

- The new tables must be applied after Supabase migration-history reconciliation before revision-plan saving works on the live database.
- Trend reliability depends on the number of verified indexed papers in the selected year range.
- Question-type detection is rules-first and may classify a mixed question by its strongest command signal.
- AI-written summaries are intentionally not included yet; all displayed analytics and plans work without an AI key.
