# Parhai Global AI and Marking-Link Health

## What changed

The six regression prompts were using the generic retrieval engine, but the old evaluator was handpicked. The replacement evaluator discovers every subject, syllabus, resource, paper identity, topic, question type, and stored marking reference directly from Supabase.

## Normalized Cambridge identity

`buildCambridgeIdentity()` normalizes:

- syllabus code
- level
- year
- session
- paper/component
- variant
- component-variant code
- question number
- question part

`validateQuestionMarkSchemePair()` additionally requires a question-specific answer, extraction confidence of at least 0.8, and link confidence of at least 0.8.

The same safety predicate now protects:

- AI Tutor answer text and badges
- marking-scheme screenshot generation
- exact-question marking-scheme lookup
- Paper Checker scoring

## Database-wide coverage

Discovered automatically:

| Syllabus | Subject | Papers | Schemes | Indexed | Verified | Topic | Typed | Preview |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 4024 | Mathematics (Syllabus D) | 63 | 64 | 2,625 | 348 | 529 | 1,378 | 27 |
| 5054 | Physics | 47 | 46 | 1,576 | 276 | 1,439 | 753 | 142 |
| 5070 | Chemistry | 119 | 120 | 1,769 | 0 | 0 | 954 | 0 |

Totals:

- 229 question papers
- 230 marking schemes
- 5,970 indexed questions
- 624 verified questions
- 2,885 unknown question types
- 5,801 missing previews
- 56 generic-guidance sections

Current overall data-health score: **22%**. This is intentionally honest; Chemistry needs topic verification, and previews/marking extraction remain incomplete.

## Marking-link audit and repair

Before repair:

- Stored answer references: 2,562
- Exact valid links: 725
- Identity-mismatched links: 462
- Low-confidence links: 1,375
- Generic guidance incorrectly official: 0
- Answer rows not currently linked: 2,243
- Answer-specific previews missing: 725 of 725 valid links

Applied non-destructive safety repair:

- Kept 725 exact links official.
- Marked 462 identity mismatches `invalid_link`.
- Marked 1,375 confidence-deficient references `needs_review`.
- Preserved answer IDs and extraction rows for admin repair.
- Deleted no papers, questions, schemes, users, or uploads.

After repair, the official-link evaluator checks 725 links and reports 725 valid / 0 invalid.

## Commands

- `npm run eval:ai` — fixed regression suite.
- `npm run eval:ai:coverage` — database-wide subject/resource coverage.
- `npm run eval:ai:dynamic` — generated checks for every discovered syllabus.
- `npm run eval:marking-links` — validates every currently official marking link.
- `npm run audit:marking-links` — detailed marking-link audit.
- `npm run repair:marking-links` — dry-run repair plan.
- `npm run repair:marking-links -- --apply` — apply safety statuses.

## Admin health dashboard

The Processing Jobs admin page now loads `/api/admin/ai-health` and shows:

- health percentage
- indexed and verified totals
- valid/invalid marking links
- unknown question types
- subject-level verification, link, and preview coverage

The endpoint requires the existing admin authorization check.

## Schema changes

Added:

- normalized marking-scheme status
- answer identity and preview metadata
- `resource_links`
- `ai_health_eval_runs`

RLS is enabled on the new exposed tables. Only administrators can manage resource links or read health runs.

## Remaining repair work

- Physics and most Mathematics references are now review-only because legacy link confidence is below the official threshold. They require exact relinking/re-extraction before green badges return.
- 5,199 unlinked/review questions have a matching marking-scheme resource and should be processed by subject/resource batches.
- Answer-specific source pages/crops are missing for all 725 currently valid links.
- Chemistry 5070 has no student-verified topic rows yet and must remain hidden from strict student retrieval until topic review.
- Future uploads now store normalized answer identity, but legacy answer metadata and preview crops still require reprocessing.
