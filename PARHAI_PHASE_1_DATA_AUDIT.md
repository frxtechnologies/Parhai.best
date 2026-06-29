# Parhai Phase 1 Data Audit

Audit date: 2026-06-29. Counts were queried directly from the linked Supabase
project before Phase 1 repair.

| Check | Count |
|---|---:|
| Total resources | 236 |
| Question papers | 110 |
| Marking schemes | 110 |
| Indexed questions | 4,189 |
| Missing/short clean question text | 567 |
| Missing or Unclassified topic | 2,326 |
| Missing subtopic | 3,133 |
| Topic confidence below 0.60 or missing | 3,155 |
| Marked `needs_review` | 2,932 |
| Missing `source_page` | 4,120 |
| Screenshot failed/not generated | 4,034 |
| Marking-scheme answer linked | 1,381 |
| Marking-scheme answer not linked | 2,808 |
| Processed question papers with zero indexed rows | 0 |
| Failed processing jobs | 25 |

## Subject breakdown

| Subject | Resources | Papers | Schemes | Questions | Needs review | Low confidence | Scheme linked |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mathematics 4024 | 143 | 63 | 64 | 2,613 | 2,307 | 2,189 | 1,052 |
| Physics 5054 | 93 | 47 | 46 | 1,576 | 625 | 966 | 329 |

The database has no separate marking-scheme-answer table. Parsed answer text is
stored in `question_index.answer_text`; paper-to-scheme relationships are also
tracked through `resources.related_resource_id` and `resource_links`.

The strongest current limitation is source-page coverage. On-demand screenshot
generation must continue to detect headings, reject instruction pages, and fall
back to View PDF when a trustworthy preview cannot be produced.
