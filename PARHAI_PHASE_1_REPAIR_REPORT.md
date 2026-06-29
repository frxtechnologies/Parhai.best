# Parhai Phase 1 Repair Report

## Changes

- Added `question_part`, `text_quality_score`,
  `marking_scheme_link_status`, and `student_verified`.
- Standardized text quality as `good`, `acceptable`, `needs_review`, or
  `failed`.
- Student retrieval now requires `student_verified = true`.
- Added conservative low-confidence Physics Light/Energy retagging.
- Added Maths 4024 graph-first and strong-circle-theorem repair rules.
- Preserved high-confidence tags unless strong contradictory graph evidence
  exists.
- Exact scheme matches are `linked`; question-level fallback to subparts is
  `partial`; missing answers remain `unlinked`.
- Screenshot failure remains non-blocking and student-facing errors stay
  friendly.

## Safety

No resources, indexed questions, screenshots, users, topic maps, or answer data
were deleted. Screenshots were not generated in bulk. Existing raw extraction
remains admin-only.

## Live repair counts

| Result | Count |
|---|---:|
| Physics Light rows retagged from weak/review data | 67 |
| Physics Energy rows retagged from weak/review data | 105 |
| Maths graph rows corrected with graph-first evidence | 36 |
| Additional strong circle rows retagged | 0 |
| Marked/remaining `needs_review` | 3,602 |
| Student-verified questions | 587 |
| Bad/weak rows hidden from students | 3,602 |
| Marking-scheme answers linked | 1,381 |
| Partial marking-scheme links | 0 |
| Unlinked answers | 2,808 |
| Screenshot `failed_page_match` | 1 |
| Full-page screenshot fallbacks | 18 |

The circle repair count is zero because strong circle rows had already been
repaired by the earlier 4024 migration; the Phase 1 rule remains in place for
future low-confidence rows. Existing linked answers were preserved. New scheme
processing now records exact and partial status explicitly.

## Remaining work

- Missing source pages must be repaired gradually through successful on-demand
  preview detection or controlled paper reprocessing.
- OCR-only papers need an isolated OCR fallback; normal text PDFs remain the
  priority.
- Low-confidence questions without strong rule evidence remain in admin review
  rather than receiving forced tags.
