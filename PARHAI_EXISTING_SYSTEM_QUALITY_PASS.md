# Parhai Existing-System Quality Pass

Date: 2026-06-28

## What already existed

Parhai already had bulk import, Supabase resources, processing jobs, `question_index`, topic maps, AI Tutor and testing, student paper browsing, source cards, PDF and marking-scheme actions, and on-demand screenshots. This pass extends those systems; it does not replace them.

## What was inaccurate

- Mathematics 4024 had no approved topic map and all 2,578 indexed rows started as unclassified.
- A permissive circle backfill allowed graph/function questions to appear as Circle Theorems.
- Instruction/front-page extraction produced false question rows and wrong-page screenshots.
- Nonblank image detection accepted instruction pages.
- Default teacher responses were longer than useful for ordinary retrieval questions.
- Some student text still exposed repeated Cambridge footer/page noise.

## What was fixed

- Added 4024 topic seeds, circle aliases, typo normalization, and graph-first classification.
- Circle Theorems now requires strong theorem evidence; weak circle matches remain reviewable.
- Retagged only 4024 Maths rows; Physics 5054 was not modified.
- Added instruction-page rejection, adjacent-page retries, blank detection, and corrected page/bbox persistence.
- Added admin confidence, review, screenshot, page, bbox, resource, and question diagnostics.
- Kept on-demand rendering limited to visible cards and nonpersistent unless hybrid cache is enabled.
- Made default AI answers concise and database-first.
- Improved display-text cleanup while retaining raw extraction for administrators.
- Made missing marking-scheme linkage explicit.

## What was not touched

Bulk import, resource deletion, processing-job orchestration, Physics topic maps, student authentication, paper Storage paths, existing PDF access, and the AI provider configuration were not rebuilt or removed.

## Remaining risks

- Instruction-derived 4024 rows need controlled reprocessing to repair question splitting.
- Scanned PDFs and PDFs without usable text layers require OCR.
- Many non-circle/non-graph Maths questions still need broader conservative retagging.
- Four 2023 Maths papers still have Storage/fetch processing failures.
- Legacy migration-history drift should be reconciled before automated migration deployment.
