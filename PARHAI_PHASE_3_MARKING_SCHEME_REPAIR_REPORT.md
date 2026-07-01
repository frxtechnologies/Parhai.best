# Parhai Phase 3 Marking Scheme Repair Report

Phase 3 adds clean answer extraction, answer-level provenance, marking points, confidence, and deterministic exact/partial linking.

## Safety

No resource, question, screenshot, topic, or user row is deleted. Existing `answer_text` links remain intact. Ambiguous paper metadata is not guessed.

## Repair behavior

- Exact question and part: `linked`.
- Question-level answer with unclear part: `partial`.
- No match: `unlinked`.
- Ambiguous metadata remains unlinked for admin review.

Existing marking schemes must be reprocessed through the normal admin processing action after the migration is applied. This populates `marking_scheme_answers` and repairs question links without reindexing question papers.

## Remaining risks

- Scanned/OCR-only schemes may still require OCR.
- Cambridge table extraction varies by paper era; low-confidence rows need review.
- Legacy malformed variants must be corrected before they can be safely paired.
