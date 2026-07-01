# Parhai Phase 3 Marking Scheme Audit

Audit date: 2026-06-30. Counts are from the linked Supabase project before Phase 3 repair.

| Measure | All | Physics 5054 | Mathematics 4024 |
|---|---:|---:|---:|
| Marking-scheme resources | 110 | 46 | 64 |
| Processed marking schemes | 110 | 46 | 64 |
| Failed marking schemes | 0 | 0 | 0 |
| Indexed questions | 4,189 | 1,576 | 2,613 |
| Linked questions | 1,381 | 329 | 1,052 |
| Partial links | 0 | 0 | 0 |
| Unlinked questions | 2,808 | 1,247 | 1,561 |
| Needs-review links | 0 | 0 | 0 |

Two question-paper resources have no matching marking-scheme PDF by the Cambridge metadata key. There was no answer-level table; `answer_text` on `question_index` was the only extracted-answer record, so the extracted-answer count was 1,381.

## Root causes

- Cambridge table-style mark schemes were parsed with the question-paper parser.
- Answer provenance, confidence, marking points, and ambiguity were not stored.
- Exact linking compared one combined text field only; unclear question-level answers produced no partial status.
- Several old resources contain malformed paper/variant metadata (including variants 12, 13, and 15), preventing safe matching.
- Resource-level status was stale even where some question answers had linked.

The safe repair preserves resources and questions, introduces answer-level records, and only uses exact paper metadata plus question/part matching.
