# Parhai Data Quality Audit

Audit date: 2026-06-28. Linked Supabase project, read-only aggregate audit.

| Check | Count |
|---|---:|
| Total indexed questions | 4,189 |
| Missing resource or storage path | 0 |
| Missing/short clean text | 567 |
| Missing or Unclassified topic | 2,326 |
| Confidence missing or below 0.70 | 3,518 |
| Marked `needs_review` | 2,932 |
| Missing `source_page` | 4,125 |
| Screenshot pending/not generated/failed | 4,078 |
| Instruction/front-page text indicators | 265 |
| Marking-scheme answer linked | 1,381 |
| Marking-scheme answer missing | 2,808 |
| Missing/uncertain exam metadata | 0 |

The audit uses conservative checks. An instruction indicator does not prove that
the whole row is invalid, but it is sufficient to keep the row out of verified
student results until reviewed.

Run the repeatable admin audit with:

```powershell
npm run audit:questions
```

The retrieval fix excludes `needs_review`, confidence below 0.70, missing clean
text, and non-verified text quality. Raw extraction remains available for admin
diagnosis.

OCR-only/scanned papers remain a known limitation. Normal embedded-text PDFs
are the priority. OCR fallback must remain isolated so it cannot regress normal
PDF processing or page detection.
