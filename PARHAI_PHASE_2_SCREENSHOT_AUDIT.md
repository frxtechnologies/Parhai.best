# Parhai Phase 2 Screenshot Audit

Audit date: 2026-06-29. Counts are from the linked Supabase database before
the Phase 2 repair.

| Subject | Questions | Generated | Not generated | Failed/page mismatch | Full-page fallback | Missing source page | Missing bbox | PDF available | Missing PDF path |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mathematics 4024 | 2,613 | 21 | 2,551 | 1 | 0 | 2,594 | 2,594 | 2,613 | 0 |
| Physics 5054 | 1,576 | 93 | 1,461 | 3 | 19 | 1,503 | 1,505 | 1,576 | 0 |

All indexed Physics 5054 and Mathematics 4024 rows currently have a resource
storage path, so every verified source card can request a signed PDF URL.

The dominant limitation is missing page metadata, not missing PDFs. On-demand
preview generation therefore needs to detect the question heading, validate the
page, and store the corrected one-based PDF page number after success.
