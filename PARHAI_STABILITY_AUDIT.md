# Parhai Stability Audit

Date: 2026-06-27

## Executive findings

The live database contains a contradictory constraint that rejects the pipeline's documented fallback topic, 12 failed past papers, two processed past papers with zero indexed questions, ten failures caused by topic classification, one missing Storage object, and one low-level fetch failure. Physics 5054 has 901 indexed rows, but older rows contain stale classifications, null confidence, and noisy extracted text.

## Broken areas, causes, and scope

| Area | Evidence / root cause | Files | Tables |
|---|---|---|---|
| Question inserts | `question_index_topic_classified_check` rejects `Unclassified`, while the processor intentionally uses it when no map/AI result exists. | `resource-processor.ts`, old `eliminate_unclassified_topics` migration | `question_index` |
| False completion | Question-bearing resources can return zero split questions and are still marked processed. Two live past papers are in this state. | `resource-job.ts`, `resource-processor.ts` | `resources`, `processing_jobs`, `question_index` |
| Storage failures | Error output loses bucket/path context. Live failures include `Object not found` and `TypeError: fetch failed`. | `resource-processor.ts` | `resources`, Storage objects |
| Cambridge filenames | Treating the two-digit component as one variant turns `qp_12` into “Variant 12”; the first digit is paper and the second is variant. Parsing must be shared by import and display code. | `cambridge-filename.ts`, `exam-resource-library.ts`, `bulk-auto-import.tsx`, `resource-processor.ts` | `resources`, `question_index`, `resource_links` |
| Question display | PDF boilerplate and repeated punctuation are stored/displayed as question text. There is no raw/clean/display separation. | `resource-processor.ts`, `questions.tsx` | `question_index` |
| Marks | The parser takes only the last `[n]` token rather than summing marks across parts. | `resource-processor.ts` | `question_index` |
| Topic quality | Generic low-signal terms can beat more specific subject concepts; historical rows lack confidence/review flags. | `topic-tagging.ts` | `topic_maps`, `question_index` |
| Marking schemes | Linking depends on metadata consistency and only runs during processing. Historical paper/variant values may be malformed. | `resource-processor.ts`, resource-link triggers | `resources`, `question_index`, `resource_links` |
| AI outages | Provider exceptions return an error even when retrieval succeeded, hiding useful database evidence. | `ai-assistant.ts`, student AI UI | `question_index`, `ai_chunks` |
| Admin diagnostics | Processing UI does not expose enough stored path/extraction/index/link details to diagnose failures. | `admin-processing.tsx` | `resources`, `processing_jobs` |

## Safe implementation order

1. Remove the contradictory topic constraint and store explicit classification state.
2. Validate Storage paths, retry transient fetch failures, and preserve actionable errors.
3. Fail question-bearing jobs that save zero indexed questions.
4. Parse Cambridge suffixes as paper digit plus variant digit (`qp_12` = Paper 1 Variant 2).
5. Store raw, clean, and display text separately and remove PDF boilerplate.
6. Sum every part-mark token.
7. Seed Physics 5054 subtopics and keep low-confidence tags reviewable.
8. Match and relink marking schemes using normalized metadata.
9. Preserve database results and sources when Groq fails or is rate-limited.
10. Show clean question-first student sources while keeping screenshots optional.

## Implementation status

All ten stages are implemented on this branch. Database changes are additive or constraint-relaxing and live in `20260627181359_physics_5054_subtopics.sql` and `20260627191051_stability_pipeline_fixes.sql`. No resources are deleted; rows needing re-extraction become explicitly reviewable instead of remaining falsely completed.

## Remaining risks

- Scanned PDFs still require OCR before reliable splitting.
- Historical combined variants such as `12` need a controlled metadata backfill, not an automatic destructive rewrite.
- Screenshot generation remains deliberately disabled on Netlify.
- Some legacy question rows need reprocessing to populate the new clean-text and classification fields.
