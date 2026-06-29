# Parhai Retrieval Repair Report

## Completed

- Added strict subject-aware topic detection before broad evidence ranking.
- Added verified-only student filtering: confidence at least 0.70,
  `needs_review = false`, verified clean text, and approved resources.
- Added focused mappings for Physics Light/refraction, Energy, Electricity and
  Motion graphs, plus Maths circles, graphs and algebra.
- Added `text_quality_status` for new and existing indexed rows.
- Kept raw, clean and display text separate.
- Removed student-facing topic-review and technical crop messages.
- Preserved on-demand preview generation and PDF fallback.
- Improved hardest-question ranking and result-count consistency.

## Existing data repair

- Questions retagged in this pass: 0. No bulk retag was performed because
  verified high-confidence tags must not be overwritten without row-level
  evidence.
- Screenshots retried in this pass: 0. The task does not justify generating
  thousands of previews; previews remain on demand.
- Source pages corrected in this pass: 0. On-demand rendering corrects and
  persists a page only after a non-blank, non-instruction preview succeeds.
- Weak questions hidden from student search: migration classifies 567
  missing/short-clean-text rows and instruction-like rows conservatively;
  retrieval also hides all 2,932 current `needs_review` rows and 3,518 rows
  below the confidence threshold.
- Marking-scheme links changed: 0. Existing answer links remain intact; 1,381
  rows currently have linked answer text.

## Remaining risks

- 4,125 questions do not yet have `source_page`; they rely on on-demand heading
  detection and PDF fallback.
- 2,808 questions do not yet have linked answer text.
- OCR-only PDFs may need a separate OCR page-detection fallback.
- Topic maps require continued admin review before low-confidence rows can
  become verified student results.
