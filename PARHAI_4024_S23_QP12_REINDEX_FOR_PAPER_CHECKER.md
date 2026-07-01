# 4024 S23 Paper 1 Variant 2 Reindex for Paper Checker

Target: `4024_s23_qp_12.pdf` only. Matching scheme: `4024_s23_ms_12.pdf`.

## Before repair

- Total legacy `question_index` rows: 47
- Student-verified rows: 5
- Expected question parts already represented: 30
- Expected question parts missing: 12
- Malformed/unexpected rows: 17
- Paper Checker review placeholders: 5

The legacy total looked superficially high, but most rows were not usable by the student-facing verified-data filter. Some question numbers/parts did not match the Cambridge paper structure.

## Repair

- Upserted the exact 42-part list from Q1(a) through Q24.
- Inserted 12 missing expected parts.
- Updated 30 existing expected parts.
- Marked 17 malformed extras `needs_review` and non-student-verified rather than deleting them.
- Preserved all existing Paper Checker submissions.
- Relinked exact marking-scheme answers where available.

## After repair

- Total retained rows: 59
- Student-verified expected rows: 42
- Missing expected question numbers: 0
- Student-visible malformed extras: 0
- Linked marking-scheme answers: 24 of 42
- Missing marks metadata: 41
- Missing source-page metadata: 38

Marks and source-page metadata remain a known quality limitation and should be repaired separately from the Paper Checker coverage fix. They were not guessed.

## Paper Checker retest

Using `Maths P1 23 Solved .pdf`:

- Private upload: passed
- PDF pages rendered: 16
- Extraction status: `needs_manual_review`
- Editable review placeholders: 42
- Full expected question-part list available: yes
- Existing handwriting fallback retained: yes

Handwriting OCR was intentionally not added in this repair.
