# Paper Checker Dropdown Fix

## Why the dropdown was empty

`frontend/src/pages/paper-checker.tsx` calls `GET /api/paper-checker/papers`.
The old endpoint used a user-scoped N+1 query and only retained papers with
`student_verified` questions. RLS visibility and that verified-only condition
could hide a paper even though it had rows in `question_index`.

## Endpoint and query fix

- Endpoint: `GET /api/paper-checker/papers`
- The authenticated route now uses the backend-only Supabase client.
- It uses an inner embedded relationship with `question_index`, so only
  resources with at least one indexed row are returned.
- It does not require complete indexing or a linked marking scheme.
- Each option includes:
  - `indexed_question_count`
  - `verified_question_count`
  - `marking_scheme_linked_count`

The endpoint remains protected by `requireUser`. The service-role credential
is never returned to the browser.

## Frontend fix

The existing Paper Checker select now renders:

`Subject name code · year session · Paper N Variant N`

Partially indexed papers show a warning and their available verified count.
The empty state is:

`No indexed papers found. Upload and process question papers first.`

Selecting a paper still enables the existing upload flow only after a PDF is
chosen; the upload behavior itself was not changed.

## Verification

A live read-only query returned **107 indexed papers**.

`4024_s23_qp_12.pdf` was returned as:

- Mathematics (Syllabus D) 4024
- 2023 May/June
- Paper 1 Variant 2
- 59 indexed rows
- 42 verified rows
- 28 rows with linked or partial marking-scheme status

The difference between indexed and verified counts is displayed as a partial
indexing warning rather than hiding the paper.
