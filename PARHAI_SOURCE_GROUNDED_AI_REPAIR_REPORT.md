# Parhai Source-Grounded AI Repair

## Root causes

- AI Tutor had separate deterministic and legacy retrieval paths without one shared parsed-query contract.
- Semantic/resource retrieval could be merged after only partial metadata filtering.
- `question_type` was referenced by processing code but was absent from the live schema because migration history had drifted.
- Existing question types used inconsistent labels such as `calculation-based` and `graph-based`.
- Source rows had no final reusable validation gate before rendering.
- Multiple foreign keys between `question_index` and `marking_scheme_answers` made implicit PostgREST embeds ambiguous.
- Generic marking guidance had historically been linked as if it were an official answer.

## Implemented architecture

1. `parseStudentPromptToQuery()` converts prompts into a strict subject, syllabus, level, year, session, component, variant, topic, question-type, and marking-scheme contract.
2. `examEngine.findQuestions()` applies database filters before any semantic ranking.
3. `validateSourceAgainstParsedQuery()` checks every candidate again and records precise rejection reasons.
4. Only validated rows become source cards or LLM context.
5. No exact rows produces an honest no-exact-match response.
6. Diagnostics are returned only when the requester is present in `admin_users`.

## Question-type repair

Canonical values:

- calculation
- theory
- diagram
- graph
- definition
- explanation
- data_table
- practical
- mixed
- unknown

The deterministic classifier records confidence, review status, reason, and subtype metadata. Existing rows were backfilled without deleting questions. The admin Processing page now includes **Reclassify types** per resource.

First 1,000-row database classification snapshot after repair:

- mixed: 135
- calculation: 111
- explanation: 94
- theory: 75
- data_table: 56
- practical: 38
- graph: 26
- definition: 6
- diagram: 4
- unknown: 455

Unknown rows remain review candidates rather than being forced into an incorrect type.

## Marking-scheme safety

- Only `question_answer` rows with `is_question_specific=true`, sufficient extraction/link confidence, and exact linked status are official.
- Generic guidance is excluded from AI Tutor official answers and Paper Checker scoring.
- Ambiguous Supabase embeds were replaced with explicit answer-ID queries.
- Marking-scheme screenshots use explicit answer lookup and line-aware Cambridge row matching.

## Migration reconciliation

Five June 30 local migrations were aligned to their already-applied remote timestamps. No SQL or production data was changed by that alignment.

Applied additive migrations:

- exam intelligence student memory
- exact marking links and preview metadata
- study-agent foundation
- self-training resource pipeline
- complete AI training engine
- source-grounded AI truth fields

No reset, truncate, or resource/user deletion was performed.

## Evaluation results

`npm --prefix backend run eval:retrieval`

- Physics 5054 O Level Paper 2 calculation, 2020–2024: 30 exact candidates; zero invalid sources.
- Physics 5054 Light, 2020–2024: first 50 exact candidates; zero invalid sources.
- Physics 5054 Electricity, 2021–2024: 8 exact candidates; zero invalid sources.
- Light with official linked schemes: 13 exact candidates; partial/generic rows excluded.
- Mathematics 4024 Paper 1 May/June 2023: 44 exact candidates; zero invalid sources.
- A Level Physics 9702 Paper 4, 2020–2024: no uploaded exact candidates; correctly returns no exact data.

All 6 database-backed retrieval evaluations passed.

## Files changed for this repair

- `backend/src/services/source-grounded-query.ts`
- `backend/src/services/source-grounded-query.test.ts`
- `backend/src/services/exam-engine.ts`
- `backend/src/services/exam-engine.test.ts`
- `backend/src/services/resource-processor.ts`
- `backend/src/services/selective-reprocessing.ts`
- `backend/src/services/cambridge-context.ts`
- `backend/src/services/marking-scheme-preview.ts`
- `backend/src/services/marking-scheme-preview.test.ts`
- `backend/src/routes/ai-assistant.ts`
- `backend/src/routes/resources.ts`
- `backend/src/scripts/ai-retrieval-eval.ts`
- `backend/src/scripts/reclassify-question-types.ts`
- `backend/package.json`
- `frontend/src/api/types.ts`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/pages/admin-processing.tsx`
- `supabase/migrations/20260703063942_source_grounded_ai_truth_fields.sql`
- five reconciled June 30 migration filenames

## Remaining limitations

- Unknown question types require admin review or improved extraction; they are not treated as calculation matches.
- Only currently uploaded/indexed subjects can return exact data. There are no exact indexed 9702 Paper 4 rows in the tested range.
- Topic accuracy still depends on approved topic maps and existing confidence values. Low-confidence/needs-review rows remain excluded.
- A full marking-scheme relink/re-extraction should be run per affected resource where exact links are still missing.
- The evaluation scans at most 50 candidates per prompt; pagination remains database-first and preserves filters.
