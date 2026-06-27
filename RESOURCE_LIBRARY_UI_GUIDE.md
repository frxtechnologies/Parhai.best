# Resource Library UI Guide

The admin resource library turns Cambridge filenames into an exam-first view while keeping the original filename visible as secondary information.

## Normalization

`normalizeExamResource(resource)` derives:

- a readable title such as `Paper 1 · Variant 1`
- year and session label
- paper and variant labels
- a stable exam key
- processing status label
- numeric sorting values

It uses saved metadata first and falls back to Cambridge filename parsing when older records do not contain every field.

## Grouping and sorting

Resources are grouped in this order:

1. Subject
2. Year
3. Session
4. Paper number and variant

Years sort newest first. Sessions sort `OCT_NOV`, `MAY_JUNE`, then `FEB_MARCH`. Papers and variants sort ascending. The newest year opens by default; older years and all session groups remain collapsible.

## Paper pairs

A question paper and marking scheme share a row when their subject, year, session, paper number, and variant match. Missing counterparts produce `Missing Marking Scheme` or `Missing Question Paper` badges. Grade thresholds are displayed once for their session rather than as ordinary paper rows.

## Actions

- **Question Paper / Marking Scheme / View** opens the selected stored resource using the existing signed/public URL flow.
- **View Indexed Questions** opens the processing page for that resource.
- **Reprocess** calls the existing processing endpoint.
- **Delete** uses the existing permanent-deletion confirmation and cleanup flow.

The comfortable and compact layouts use the same Supabase records and actions. Desktop renders table rows; mobile renders responsive cards.

## Filters and summaries

The library supports subject, year, session, paper, variant, processing status, resource type, and text search filters. Summary cards are calculated from the currently matching real resources; no demonstration data is used.
