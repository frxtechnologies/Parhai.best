# Parhai Bulk Auto Import

Bulk Auto Import is available in **Admin → Subjects & Resources**, below the existing Direct PDF Upload form.

## Supported input

- Select multiple PDF files, or
- Select a ZIP file containing PDFs. Nested ZIP folders are supported; non-PDF entries are ignored.

Files are parsed and hashed in the browser before anything is uploaded. Nothing is saved until **Confirm Import** is selected.

## Cambridge filename format

```text
subjectCode_sessionCode_resourceType_optionalPaperVariant.pdf
```

Examples:

- `4024_s23_qp_11.pdf` → May/June 2023, question paper 1, variant 1
- `4024_s23_ms_11.pdf` → matching marking scheme
- `4024_s23_gt.pdf` → May/June 2023 grade threshold
- `0625_w24_qp_22.pdf` → Oct/Nov 2024, paper 2, variant 2
- `0478_m23_ms_12.pdf` → Feb/March 2023, marking scheme paper 1, variant 2

Session codes are `s` (May/June), `w` (Oct/Nov), and `m` (Feb/March).
Resource codes are `qp`, `ms`, `gt`, `er`, `in`, `sf`, and `sy`.

## Review workflow

The preview shows filename, resource type, subject code, mapped subject, level, year, session, paper, variant, confidence, and warnings. Every detected metadata field can be corrected before import.

An unknown code is marked **Needs Review**. Add or correct its row in `subject_code_map`, or choose the subject manually in the preview. Needs Review rows are never uploaded.

## Saving and processing

Confirmed files are stored in the private `resources` bucket at:

```text
resources/{level}/{subject_code}/{year}/{session}/{resource_type}/{filename}
```

Each successful file creates:

1. A `resources` row containing its SHA-256 hash and batch ID.
2. A `processing_jobs` row through the existing database trigger.
3. Automatic background extraction and indexing through the existing resource processor.

The batch is recorded in `admin_import_batches` with imported, duplicate, failed, and needs-review counts.

## Linking rules

- Marking schemes link to a question paper with the same subject, year, session, paper number, and variant.
- Grade thresholds link to all question papers with the same subject, year, and session.
- Links are stored in `resource_links` and are created regardless of upload order.

## Duplicate protection

The importer checks:

- SHA-256 file hash.
- Exam key: subject, year, session, resource type, paper number, and variant.

Database unique indexes enforce both checks during concurrent imports. A file rejected after Storage upload is removed immediately.

## Troubleshooting

- **Needs Review:** Correct missing metadata or map the subject code.
- **Duplicate:** The file hash or exam key already exists; it is skipped.
- **Storage error:** Verify the signed-in user is listed in `admin_users` and the `resources` bucket policies are installed.
- **Processing failed:** The resource remains saved. Use the Processing Jobs page to inspect the exact extraction error and retry.
- **Scanned PDF:** Text extraction reports that OCR is required.
