# Parhai Marking Scheme Intelligence Repair

## Root cause

The old extractor removed some headings but did not classify sections. Numbered paragraphs inside general marking principles could therefore be saved as answers. The linker trusted every extracted answer row, copied its text to `question_index.answer_text`, and marked the question linked. AI Tutor, source cards, previews, analytics, and Paper Checker then trusted that status/text without checking whether the row was question-specific.

## System-wide repair

- Added a subject-independent marking-scheme section classifier.
- Added `answer_type`, `is_question_specific`, extraction/link confidence, normalized text, detection/link reason, and linked question metadata.
- Generic guidance, headers, examiner notes, unknown sections, and review sections are not linkable official answers.
- Exact official use requires a question-specific row, confidence of at least 0.80, and an exact link status.
- Resource matching already enforces subject, level, year, session, component, and variant before answer linking.
- Part-level answers only match the same part. Question-level fallback remains visibly partial and is not used for official scoring.
- AI Tutor strips non-official answer text and gives the honest missing question-specific scheme message.
- Paper Checker receives the same strict predicate and cannot score from generic guidance.
- Marking-scheme screenshot generation rejects non-question-specific rows.
- Source-card badges distinguish available, partial, general guidance, needs review, and not linked.
- Admin endpoints list review/unmatched sections and allow classification correction; classifying a row non-specific also unlinks it.

## Safe cleanup

Migration `20260702193116_marking_scheme_intelligence_and_cleanup.sql` preserves original text, classifies known generic phrases, conservatively marks uncertain legacy sections for review, audits invalid links, and unlinks them from questions.

Live cleanup results:

- 52 generic-guidance sections identified.
- 40 uncertain sections marked `needs_review`.
- 75 invalid links recorded in `marking_scheme_link_audits`.
- 0 generic/non-question-specific sections remain linked to questions.
- Verified question-specific links currently remain for Mathematics 4024 (1,052) and Physics 5054 (317).

Other subjects currently have no verified linked rows in the available database. The classifier and linker are not subject-specific and apply automatically when their resources are processed.

## Files changed

- `backend/src/services/marking-scheme-intelligence.ts`
- `backend/src/services/marking-scheme-intelligence.test.ts`
- `backend/src/services/resource-processor.ts`
- `backend/src/services/exam-engine.ts`
- `backend/src/services/cambridge-context.ts`
- `backend/src/services/marking-scheme-preview.ts`
- `backend/src/routes/ai-assistant.ts`
- `backend/src/routes/resources.ts`
- `frontend/src/components/ai-tutor/source-card.tsx`
- `frontend/src/components/ai-tutor/ai-message.tsx`
- `supabase/migrations/20260702193116_marking_scheme_intelligence_and_cleanup.sql`

## Remaining limitations

- Complex essay level-of-response grids and visually structured tables may require admin review.
- Low-confidence legacy sections are intentionally withheld rather than guessed.
- Chemistry, Biology, Computer Science, and AS/A Level data can only be validated once corresponding processed resources exist.
