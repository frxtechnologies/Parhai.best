# Paper Checker Selection Safety Fix

## Root cause

Paper Checker correctly loaded indexed papers, but it did not make the selected
paper identity prominent and it treated indexed rows as if they were whole
question numbers. Question parts made those counts misleading. The existing
upload flow also had no filename-to-selection sanity check.

## Changes

- Added a clear selected-paper summary containing subject, syllabus, session,
  year, paper, variant, source code, indexed rows, verified question coverage,
  and marking-scheme coverage.
- Added distinct top-level question-number coverage alongside raw row counts.
- Added strong partial-index and partial-marking-scheme warnings.
- Papers with no linked marking-scheme questions can still be uploaded and
  reviewed, but final checking is disabled.
- Added a soft filename mismatch warning for year, paper, and variant hints.
- Added safe development-only debug information. No environment values or
  credentials are exposed.
- Kept upload, manual review, storage, and report routes unchanged.

## Current target paper

`4024_s23_qp_12.pdf` appears in the dropdown as Mathematics (Syllabus D) 4024,
May/June 2023, Paper 1 Variant 2.

Current database coverage:

- 59 indexed rows, including legacy/part rows
- 24 distinct verified question numbers
- expected coverage inferred as Q1–Q24
- 18 distinct question numbers with linked or partial marking-scheme status

No OCR, reindexing, or storage cleanup was performed.

## Verification

- Typecheck passed.
- 33 tests passed, including filename hint and mismatch-warning tests.
- Frontend and backend production builds passed.
- Existing large frontend bundle warning remains unrelated to this fix.
