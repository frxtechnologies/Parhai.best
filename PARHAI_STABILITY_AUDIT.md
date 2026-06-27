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
| Question display | PDF boilerplate and repeated punctuation are stored/displayed as question text. There is no raw/clean/display separation. | `resource-processor.ts`, `questions.tsx` | `question_index` |
| Marks | The parser takes only the last `[n]` token rather than summing marks across parts. | `resource-processor.ts` | `question_index` |
| Topic quality | Generic low-signal terms can beat more specific subject concepts; historical rows lack confidence/review flags. | `topic-tagging.ts` | `topic_maps`, `question_index` |
| Marking schemes | Linking depends on metadata consistency and only runs during processing. Historical paper/variant values may be malformed. | `resource-processor.ts`, resource-link triggers | `resources`, `question_index`, `resource_links` |
| AI outages | Provider exceptions return an error even when retrieval succeeded, hiding useful database evidence. | `ai-assistant.ts`, student AI UI | `question_index`, `ai_chunks` |
| Admin diagnostics | Processing UI does not expose enough stored path/extraction/index/link details to diagnose failures. | `admin-processing.tsx` | `resources`, `processing_jobs` |

## Fix plan

1. Remove the contradictory classified-topic constraint and store explicit classification state.
2. Fail/review question-bearing resources that produce zero indexed questions.
3. Add bucket/path-aware Storage validation and safe errors.
4. Store raw, cleaned, and display text separately; never render raw extraction to students.
5. Sum marks across all detected mark tokens.
6. Keep low-confidence topic results reviewable rather than forcing a label.
7. Relink marking schemes after question indexing.
8. Return retrieved sources when the AI provider is unavailable.
9. Expand admin processing diagnostics.

## Remaining risks

- Scanned PDFs still require OCR before reliable splitting.
- Historical combined variants such as `12` need a controlled metadata backfill, not an automatic destructive rewrite.
- Screenshot generation remains deliberately disabled on Netlify.
- Some legacy question rows need reprocessing to populate the new clean-text and classification fields.
